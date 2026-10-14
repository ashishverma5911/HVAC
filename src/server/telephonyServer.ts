import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { CallSessionManager } from '../lib/telephony/callSessionManager';
import { GeminiTelephonyBridge } from '../lib/telephony/geminiTelephonyBridge';
import { decodeTwilioMediaPayload } from '../lib/telephony/audioCodec';
import {
  createStreamCorrelationToken,
  resolveWebhookCandidateUrls,
  validateTwilioWebhookMultiUrl,
} from '../lib/telephony/twilioSecurity';
import { getTelephonyEndpoints } from '../lib/telephony/telephonyConfig';
import { resolveInboundDestinationRouteAsync } from '../lib/telephony/tenantPhoneMapping';
import {
  buildCallFailureFallbackTwiml,
  buildInboundStreamTwiml,
  buildUnknownDestinationTwiml,
} from '../lib/telephony/twimlBuilder';
import { ContractorPersistenceService } from '../lib/services/contractorPersistence';
import { stripUntrustedTenantIds } from '../lib/validation/tenantSanitizer';
import { logDiagnosticEvent } from '../lib/diagnostics/logger';
import { maskPhone } from '../lib/diagnostics/piiMask';
import { normalizeCallerPhoneInput } from '../lib/compliance/callPrivacyAndCompliance';
import { validateContractorConfiguration } from '../lib/ai/contractorConfig';

// Load local environment files in development if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile('.env.local');
  }
} catch {
  // If .env.local doesn't exist, proceed with environment variables
}

const PORT = parseInt(process.env.PORT || process.env.TELEPHONY_PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const sessionManager = CallSessionManager.getInstance();
const activeBridges = new Map<string, GeminiTelephonyBridge>();

/**
 * Parses URLSearchParams or JSON from raw POST body buffer.
 */
function parseWebhookBody(rawBody: string, contentType?: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (contentType && contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== undefined && v !== null) {
            params[k] = String(v);
          }
        }
        return params;
      }
    } catch {
      // Fallback to URLSearchParams
    }
  }
  const searchParams = new URLSearchParams(rawBody);
  searchParams.forEach((val, key) => {
    params[key] = val;
  });
  return params;
}

export function createTelephonyServer(): {
  server: http.Server;
  wss: WebSocketServer;
  shutdown: (signal: string, onComplete?: () => void) => void;
} {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Set CORS headers for status & health APIs
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Twilio-Signature');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Health check endpoint
    if ((url.pathname === '/health' || url.pathname === '/') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'aeris-telephony-bridge',
          uptimeSeconds: Math.floor(process.uptime()),
          activeConnections: sessionManager.getAllActiveSessions().length,
          timestamp: Date.now(),
        })
      );
      return;
    }

    // 2. Real-time Telephony Diagnostics Status endpoint
    if (url.pathname === '/api/telephony/status' && req.method === 'GET') {
      const activeSessions = sessionManager.getAllActiveSessions();
      const recentSessions = sessionManager.getRecentSessionsSummary();

      const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
      const maskedTwilioNumber = twilioNumber.length > 5 ? maskPhone(twilioNumber) : (twilioNumber ? 'Configured' : 'Not Configured');

      const hostHeader = req.headers.host || 'localhost:8080';
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const endpoints = getTelephonyEndpoints(hostHeader, proto === 'https');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'online',
          timestamp: Date.now(),
          uptimeSeconds: Math.floor(process.uptime()),
          activeCallCount: activeSessions.length,
          twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          twilioPhoneNumber: maskedTwilioNumber,
          publicHttpBaseUrl: endpoints.publicHttpBaseUrl,
          publicWsBaseUrl: endpoints.publicWsBaseUrl,
          webhookUrl: endpoints.webhookUrl,
          streamUrl: endpoints.streamUrl,
          isReadyForRealTwilio: endpoints.isReadyForRealTwilio,
          missingConfig: endpoints.missingConfig,
          maxCallDurationSeconds: parseInt(process.env.MAX_CALL_DURATION_SECONDS || '300', 10),
          recentSessions,
        })
      );
      return;
    }

    // 3. Twilio Inbound Voice Webhook (POST /api/telephony/twilio/voice)
    if (url.pathname === '/api/telephony/twilio/voice' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const params = parseWebhookBody(rawBody, req.headers['content-type']);

          const authToken = process.env.TWILIO_AUTH_TOKEN || '';
          const twilioSignature = (req.headers['x-twilio-signature'] as string) || null;
          const hostHeader = req.headers.host || 'localhost:8080';
          const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
          const endpoints = getTelephonyEndpoints(hostHeader, proto === 'https');
          const candidateUrls = resolveWebhookCandidateUrls(
            `${proto}://${hostHeader}${url.pathname}${url.search}`,
            req.headers,
            endpoints.webhookUrl
          );

          const sigCheck = validateTwilioWebhookMultiUrl(
            authToken,
            twilioSignature,
            candidateUrls,
            params
          );
          if (!sigCheck.valid) {
            console.warn(
              `[Telephony Server] Rejected request with invalid Twilio signature (${sigCheck.reason}) for URL: ${endpoints.webhookUrl}`
            );
            logDiagnosticEvent({
              event: 'CALL_ERROR',
              error: 'Rejected request with invalid Twilio signature',
              details: { webhookUrl: endpoints.webhookUrl, reason: sigCheck.reason },
            });
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: Invalid Twilio Webhook Signature');
            return;
          }

          // Strip any untrusted caller/client-supplied contractor IDs
          const untrustedCheck: Record<string, unknown> = { ...params };
          url.searchParams.forEach((v, k) => {
            untrustedCheck[k] = v;
          });
          stripUntrustedTenantIds(untrustedCheck);

          const callerPhone = normalizeCallerPhoneInput(params.From || params.Caller || null);
          const calledPhone = (params.To || params.Called || '').trim();
          const forwardedFrom = (params.ForwardedFrom || '').trim() || undefined;
          const callSid = (params.CallSid || `CALL-${Date.now()}`).trim();

          // Duplicate webhook idempotency check by CallSid
          const existingReg = sessionManager.getWebhookRegistration(callSid);
          if (existingReg) {
            const dup = sessionManager.registerInboundWebhook({
              callSid: existingReg.callSid,
              callerPhone: existingReg.callerPhone,
              calledPhone: existingReg.calledPhone,
              forwardedFrom: existingReg.forwardedFrom,
              businessId: existingReg.businessId,
              businessConfig: existingReg.businessConfig,
              correlationToken: existingReg.correlationToken,
              twiml: existingReg.twiml,
            });
            res.writeHead(200, {
              'Content-Type': 'text/xml; charset=utf-8',
              'Content-Length': Buffer.byteLength(dup.registration.twiml),
              'X-Aeris-Webhook-Duplicate': 'true',
              'X-Aeris-Contractor-Id': existingReg.businessId,
            });
            res.end(dup.registration.twiml);
            return;
          }

          logDiagnosticEvent({
            event: 'CALL_RECEIVED',
            conversationId: callSid,
            details: {
              callerPhone: maskPhone(callerPhone),
              calledPhone: maskPhone(calledPhone),
            },
          });

          logDiagnosticEvent({
            event: 'TWILIO_SIGNATURE_VALIDATED',
            conversationId: callSid,
          });

          // Map destination phone number (`To` / `Called`) to contractor
          const routeResult = await resolveInboundDestinationRouteAsync(calledPhone, {
            untrustedPayload: untrustedCheck,
          });

          if (!routeResult.matched) {
            console.warn(
              `[Telephony Server] Rejecting call ${callSid} to unassigned/invalid destination number "${calledPhone}" (${routeResult.reason})`
            );
            const unknownTwiml = buildUnknownDestinationTwiml(calledPhone);
            res.writeHead(200, {
              'Content-Type': 'text/xml; charset=utf-8',
              'Content-Length': Buffer.byteLength(unknownTwiml),
              'X-Aeris-Route-Status': routeResult.reason,
            });
            res.end(unknownTwiml);
            return;
          }

          const { businessId, businessConfig } = routeResult;

          await ContractorPersistenceService.ensureConversation(
            businessId,
            callSid,
            'telephony',
            callerPhone || undefined,
            calledPhone
          ).catch(() => {});

          await ContractorPersistenceService.persistCallEvent(
            businessId,
            callSid,
            'INBOUND_WEBHOOK_ROUTED',
            {
              callSid,
              callerPhone,
              calledPhone,
              forwardedFrom: forwardedFrom || null,
              contractorName: businessConfig?.name || null,
              routeSource: routeResult.routeSource,
            }
          ).catch(() => {});

          const configValidation = validateContractorConfiguration(businessConfig);
          if (!configValidation.valid || !configValidation.config) {
            const errReason = configValidation.reason || 'Invalid contractor configuration';
            sessionManager.markSessionFailure(callSid, errReason);
            await ContractorPersistenceService.persistCallStatusUpdate(businessId, callSid, {
              callStatus: 'failed',
              errorCode: 'INVALID_CONTRACTOR_CONFIGURATION',
              errorMessage: errReason,
              callerPhone,
              calledPhone,
            }).catch(() => {});
            const fallbackTwiml = buildCallFailureFallbackTwiml(null, { calledPhone });
            res.writeHead(200, {
              'Content-Type': 'text/xml; charset=utf-8',
              'Content-Length': Buffer.byteLength(fallbackTwiml),
              'X-Aeris-Route-Status': 'INVALID_CONTRACTOR_CONFIGURATION',
              'X-Aeris-Contractor-Id': businessId,
            });
            res.end(fallbackTwiml);
            return;
          }

          const validatedConfig = configValidation.config;

          if (process.env.FORCE_AI_SESSION_UNAVAILABLE === 'true') {
            console.error(
              `[Telephony Server] AI session unavailable for CallSid=${callSid} (Contractor=${validatedConfig.name}). Returning fallback TwiML.`
            );
            sessionManager.markSessionFailure(callSid, 'AI receptionist session unavailable');
            await ContractorPersistenceService.persistCallStatusUpdate(businessId, callSid, {
              callStatus: 'failed',
              errorCode: 'AI_SESSION_UNAVAILABLE',
              errorMessage: 'AI receptionist session unavailable',
              callerPhone,
              calledPhone,
            }).catch(() => {});
            const fallbackTwiml = buildCallFailureFallbackTwiml(validatedConfig, { calledPhone });
            res.writeHead(200, {
              'Content-Type': 'text/xml; charset=utf-8',
              'Content-Length': Buffer.byteLength(fallbackTwiml),
              'X-Aeris-Route-Status': 'FALLBACK_UNAVAILABLE',
              'X-Aeris-Contractor-Id': businessId,
            });
            res.end(fallbackTwiml);
            return;
          }

          const correlationToken = createStreamCorrelationToken({
            callSid,
            calledPhone,
            callerPhone: callerPhone || '',
            businessId,
          });

          const twiml = buildInboundStreamTwiml({
            wsUrl: endpoints.streamUrl,
            callerPhone: callerPhone || '',
            calledPhone,
            callSid,
            businessId,
            correlationToken,
            forwardedFrom,
            businessConfig: validatedConfig,
          });

          sessionManager.registerInboundWebhook({
            callSid,
            callerPhone,
            calledPhone,
            forwardedFrom,
            businessId,
            businessConfig: validatedConfig,
            correlationToken,
            twiml,
          });

          console.log(
            `[Telephony Server] Inbound phone call routed: CallSid=${callSid}, From=${maskPhone(callerPhone)}, Contractor=${validatedConfig.name} (${businessId})`
          );

          res.writeHead(200, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(twiml),
            'X-Aeris-Route-Status': 'MATCHED',
            'X-Aeris-Contractor-Id': businessId,
          });
          res.end(twiml);
        } catch (err) {
          console.error('[Telephony Server] Error processing voice webhook:', err);
          const fallbackTwiml = buildCallFailureFallbackTwiml(null);
          res.writeHead(200, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(fallbackTwiml),
          });
          res.end(fallbackTwiml);
        }
      });
      return;
    }

    // 4. Twilio Call Status Callback Webhook (POST /api/telephony/twilio/status)
    if (url.pathname === '/api/telephony/twilio/status' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const params = parseWebhookBody(rawBody, req.headers['content-type']);
          const authToken = process.env.TWILIO_AUTH_TOKEN || '';
          const twilioSignature = (req.headers['x-twilio-signature'] as string) || null;
          const hostHeader = req.headers.host || 'localhost:8080';
          const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
          const candidateUrls = resolveWebhookCandidateUrls(
            `${proto}://${hostHeader}${url.pathname}${url.search}`,
            req.headers
          );

          const sigCheck = validateTwilioWebhookMultiUrl(
            authToken,
            twilioSignature,
            candidateUrls,
            params
          );
          if (!sigCheck.valid) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden: Invalid Twilio Signature' }));
            return;
          }

          const callSid = (params.CallSid || '').trim();
          const callStatus = (params.CallStatus || '').trim();
          const callDurationRaw = params.CallDuration || params.Duration || '';
          const callDuration = callDurationRaw ? parseInt(callDurationRaw, 10) : undefined;
          const errorCode = params.ErrorCode?.trim() || null;
          const errorMessage = params.ErrorMessage?.trim() || null;
          const callerPhone = normalizeCallerPhoneInput(params.From || params.Caller || null);
          const calledPhone = (params.To || params.Called || '').trim() || null;

          if (!callSid || !callStatus) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing CallSid or CallStatus' }));
            return;
          }

          const callbackResult = sessionManager.recordCallStatusCallback({
            callSid,
            callStatus,
            callDuration: Number.isFinite(callDuration) ? callDuration : undefined,
            errorCode,
            errorMessage,
          });

          let businessId = callbackResult.businessId;
          if (!businessId && calledPhone) {
            const routeRes = await resolveInboundDestinationRouteAsync(calledPhone);
            if (routeRes.matched) {
              businessId = routeRes.businessId;
            }
          }

          if (businessId) {
            await ContractorPersistenceService.persistCallStatusUpdate(businessId, callSid, {
              callStatus: callbackResult.normalizedStatus,
              durationSeconds: Number.isFinite(callDuration) ? callDuration : undefined,
              errorCode,
              errorMessage,
              callerPhone,
              calledPhone,
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              callSid,
              callStatus: callbackResult.normalizedStatus,
              businessId,
            })
          );
        } catch (err) {
          console.error('[Telephony Server] Error processing status callback:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  // WebSocket Server attached to HTTP server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/telephony/twilio-stream')) {
      console.warn(`[Telephony Server] WS connection rejected for unknown path: ${reqUrl}`);
      ws.close(1008, 'Unknown endpoint');
      return;
    }

    console.log(`[Telephony Server] Twilio Media Stream WebSocket connected from ${req.socket.remoteAddress}`);

    let currentStreamSid: string | null = null;
    let bridge: GeminiTelephonyBridge | null = null;

    ws.on('message', async (rawMessage: Buffer | string) => {
      try {
        const msgStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf-8');
        const msg = JSON.parse(msgStr);

        switch (msg.event) {
          case 'connected': {
            console.log(`[Telephony Server] Media Stream event 'connected' received (protocol version: ${msg.protocol})`);
            break;
          }

          case 'start': {
            const rawStreamSid = msg.streamSid || msg.start?.streamSid;
            const rawCallSid = msg.start?.callSid || msg.start?.customParameters?.callSid || `CALL-${Date.now()}`;
            const customParams = {
              ...(msg.start?.customParameters || {}),
              ...(msg.start?.callerPhone ? { callerPhone: msg.start.callerPhone } : {}),
              ...(msg.start?.calledPhone ? { calledPhone: msg.start.calledPhone } : {}),
            };

            const validation = await sessionManager.validateAndCorrelateStreamStart({
              streamSid: rawStreamSid,
              callSid: rawCallSid,
              customParameters: customParams,
            });

            if (!validation.valid || !validation.businessId || !validation.businessConfig) {
              console.warn(
                `[Telephony Server] Rejecting Media Stream start event (streamSid=${rawStreamSid}, callSid=${rawCallSid}): ${validation.reason}`
              );
              ws.close(1008, validation.reason || 'Invalid stream start');
              return;
            }

            const { streamSid, callSid, callerPhone, calledPhone, businessId, businessConfig } =
              validation;

            currentStreamSid = streamSid;
            console.log(
              `[Telephony Server] Call started: streamSid=${streamSid}, callSid=${callSid}, contractor=${businessConfig.name} (${businessId})`
            );

            // Initialize isolated call session with immutable contractor binding
            const session = sessionManager.createSession({
              callSid,
              streamSid,
              callerPhone,
              calledPhone,
              businessId,
              businessConfig,
              onDurationLimitReached: (s) => {
                console.log(`[Telephony Server] Call limit watchdog reached for stream ${s.streamSid}. Closing WebSocket.`);
                try {
                  ws.send(JSON.stringify({ event: 'clear', streamSid: s.streamSid }));
                  ws.close(1000, 'Max call duration reached');
                } catch {}
              },
            });

            logDiagnosticEvent({
              event: 'STREAM_CONNECTED',
              businessId: session.businessId,
              conversationId: callSid,
              correlationId: session.sessionId,
              details: { streamSid },
            });

            // Ensure conversation record in database and record call_answered lifecycle event
            ContractorPersistenceService.ensureConversation(
              session.businessId,
              callSid,
              'telephony',
              callerPhone || undefined,
              calledPhone || undefined
            ).catch((err) => {
              console.warn('[Telephony Server] Non-fatal: Conversation row ensure failed:', err?.message || err);
            });

            ContractorPersistenceService.recordCallLifecycleEvent(
              session.businessId,
              callSid,
              'call_answered',
              {
                streamSid,
                callerPhone: session.callerPhone,
                calledPhone: session.calledPhone,
              }
            ).catch(() => {});

            // Initialize Gemini Live bridge for this call
            try {
              bridge = new GeminiTelephonyBridge(session, ws);
              activeBridges.set(streamSid, bridge);
              await bridge.connect();
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`[Telephony Server] Failed to connect Gemini Live bridge for ${streamSid}:`, err);
              sessionManager.markSessionFailure(streamSid, `Bridge initialization failure: ${errMsg}`);
              await ContractorPersistenceService.persistCallStatusUpdate(
                session.businessId,
                callSid,
                {
                  callStatus: 'failed',
                  errorCode: 'GEMINI_BRIDGE_INIT_FAILED',
                  errorMessage: `Bridge initialization failure: ${errMsg}`,
                  callerPhone: session.callerPhone,
                  calledPhone: session.calledPhone,
                }
              ).catch(() => {});
              ws.close(1011, 'Gemini bridge error');
            }
            break;
          }

          case 'media': {
            if (!currentStreamSid) return;
            const session = sessionManager.getSessionByStream(currentStreamSid);
            if (!session || session.ended) return;

            const payload = msg.media?.payload;
            if (payload && bridge) {
              session.metrics.twilioChunksReceived += 1;
              session.metrics.twilioBytesReceived += payload.length;

              // Transcode 8kHz μ-law -> 16kHz Linear PCM
              const pcm16 = decodeTwilioMediaPayload(payload);
              session.metrics.pcmFramesGenerated += pcm16.length;

              // Stream to Gemini Live
              bridge.sendCallerAudioChunk(pcm16);
            }
            break;
          }

          case 'stop': {
            const streamSid = msg.streamSid || currentStreamSid;
            console.log(`[Telephony Server] Twilio stream 'stop' event received for streamSid=${streamSid}`);
            if (streamSid) {
              if (bridge) {
                bridge.flushPendingTranscripts('twilio_stream_stop');
              }
              const session = sessionManager.getSessionByStream(streamSid);
              sessionManager.terminateSession(streamSid, 'Twilio stream stop event');

              if (session) {
                logDiagnosticEvent({
                  event: 'CALL_ENDED',
                  businessId: session.businessId,
                  conversationId: session.callSid,
                  correlationId: session.sessionId,
                  durationMs: (session.metrics.durationSeconds || 0) * 1000,
                });

                ContractorPersistenceService.persistCallStatusUpdate(
                  session.businessId,
                  session.callSid,
                  {
                    callStatus: session.failed ? 'failed' : 'completed',
                    durationSeconds: session.metrics.durationSeconds,
                    endedAt: new Date().toISOString(),
                    callerPhone: session.callerPhone,
                    calledPhone: session.calledPhone,
                  }
                ).catch(() => {});
              }

              if (bridge) {
                bridge.close();
                bridge = null;
              }
              activeBridges.delete(streamSid);
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[Telephony Server] Error processing WS message:', err);
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : '';
      console.log(
        `[Telephony Server] WebSocket closed for stream ${currentStreamSid || 'unknown'} (code: ${code}, reason: "${reasonStr}")`
      );
      if (currentStreamSid) {
        const session = sessionManager.getSessionByStream(currentStreamSid);
        const wasAlreadyEnded = Boolean(session?.ended);

        if (bridge) {
          bridge.flushPendingTranscripts(
            code !== 1000 && code !== 1005 ? 'abnormal_ws_disconnect' : 'ws_closed'
          );
        }

        if (session && !wasAlreadyEnded) {
          const isAbnormalDisconnect = code !== 1000 && code !== 1005;
          if (isAbnormalDisconnect) {
            sessionManager.markSessionFailure(
              currentStreamSid,
              `WebSocket disconnected unexpectedly (code ${code}: ${reasonStr || 'abnormal closure'})`
            );
          } else {
            sessionManager.terminateSession(currentStreamSid, `WebSocket closed (${code})`);
          }

          ContractorPersistenceService.persistCallStatusUpdate(
            session.businessId,
            session.callSid,
            {
              callStatus: isAbnormalDisconnect ? 'failed' : 'completed',
              durationSeconds: session.metrics.durationSeconds,
              errorCode: isAbnormalDisconnect ? `WS_CLOSE_${code}` : null,
              errorMessage: isAbnormalDisconnect
                ? `WebSocket disconnected unexpectedly (code ${code})`
                : null,
              callerPhone: session.callerPhone,
              calledPhone: session.calledPhone,
            }
          ).catch(() => {});
        } else {
          sessionManager.terminateSession(currentStreamSid, `WebSocket closed (${code})`);
        }

        if (bridge) {
          bridge.close();
          bridge = null;
        }
        activeBridges.delete(currentStreamSid);
      }
    });

    ws.on('error', (err) => {
      console.error(`[Telephony Server] WebSocket error on stream ${currentStreamSid}:`, err);
      if (currentStreamSid) {
        const errMsg = err instanceof Error ? err.message : String(err);
        sessionManager.markSessionFailure(currentStreamSid, `WebSocket error: ${errMsg}`);
      }
    });
  });

  let isShuttingDown = false;

  const shutdown = (signal: string, onComplete?: () => void) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Telephony Server] Received ${signal}. Initiating graceful shutdown...`);

    // 1. Close active Gemini telephony bridges
    for (const [streamSid, bridge] of activeBridges.entries()) {
      try {
        console.log(`[Telephony Server] Closing Gemini bridge for stream ${streamSid}...`);
        bridge.close();
      } catch (err) {
        console.error(`[Telephony Server] Error closing bridge for stream ${streamSid}:`, err);
      }
    }
    activeBridges.clear();

    // 2. Terminate active sessions in CallSessionManager
    const activeSessions = sessionManager.getAllActiveSessions();
    for (const session of activeSessions) {
      try {
        sessionManager.terminateSession(session.streamSid, `Server shutdown (${signal})`);
      } catch (err) {
        console.error(`[Telephony Server] Error terminating session ${session.sessionId}:`, err);
      }
    }

    // 3. Close connected WebSocket clients
    wss.clients.forEach((client) => {
      try {
        client.close(1001, 'Server shutting down');
      } catch {}
    });

    // 4. Close WebSocket server
    wss.close((wsErr) => {
      if (wsErr) {
        console.error('[Telephony Server] Error closing WebSocket server:', wsErr);
      }

      // 5. Close HTTP server (including idle keep-alive sockets)
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      server.close((httpErr) => {
        if (httpErr) {
          console.error('[Telephony Server] Error closing HTTP server:', httpErr);
        }
        console.log('[Telephony Server] Graceful shutdown completed cleanly.');
        if (onComplete) {
          onComplete();
        } else if (require.main === module) {
          process.exit(0);
        }
      });
    });

    // Timeout fallback after 10s
    setTimeout(() => {
      console.warn('[Telephony Server] Forceful shutdown timeout (10s) reached.');
      if (onComplete) {
        onComplete();
      } else if (require.main === module) {
        process.exit(1);
      }
    }, 10000).unref();
  };

  return { server, wss, shutdown };
}

// Auto-start server when invoked as entrypoint script
if (require.main === module) {
  const { server, shutdown } = createTelephonyServer();

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 HVAC AI Receptionist Telephony Server running on http://${HOST}:${PORT}`);
    console.log(`   Health check: GET http://${HOST}:${PORT}/health`);
    console.log(`   Diagnostics:  GET http://${HOST}:${PORT}/api/telephony/status`);
    console.log(`   Twilio Voice: POST http://${HOST}:${PORT}/api/telephony/twilio/voice`);
    console.log(`   Media Stream: ws://${HOST}:${PORT}/api/telephony/twilio-stream`);
    console.log(`=======================================================`);
  });
}
