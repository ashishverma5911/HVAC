import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { CallSessionManager } from '../lib/telephony/callSessionManager';
import { GeminiTelephonyBridge } from '../lib/telephony/geminiTelephonyBridge';
import { decodeTwilioMediaPayload } from '../lib/telephony/audioCodec';
import { validateTwilioWebhookSignature } from '../lib/telephony/twilioSecurity';
import { getTelephonyEndpoints } from '../lib/telephony/telephonyConfig';

// Load local environment files in development if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile('.env.local');
  }
} catch {
  // If .env.local doesn't exist, proceed with environment variables
}

const PORT = parseInt(process.env.TELEPHONY_PORT || '8080', 10);
const sessionManager = CallSessionManager.getInstance();
const activeBridges = new Map<string, GeminiTelephonyBridge>();

/**
 * Builds the TwiML response instructing Twilio to fork/stream the call audio over WebSockets.
 */
function buildTwimlResponse(streamUrl: string, callerPhone: string, calledPhone: string): string {
  // Escape XML characters in phone numbers for safety
  const safeCaller = callerPhone.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeCalled = calledPhone.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callerPhone" value="${safeCaller}" />
      <Parameter name="calledPhone" value="${safeCalled}" />
    </Stream>
  </Connect>
</Response>`;
}

/**
 * Parses URLSearchParams from raw POST body buffer.
 */
function parseUrlEncodedBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  const searchParams = new URLSearchParams(rawBody);
  searchParams.forEach((val, key) => {
    params[key] = val;
  });
  return params;
}

export function createTelephonyServer(): { server: http.Server; wss: WebSocketServer } {
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
    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'hvac-telephony-bridge' }));
      return;
    }

    // 2. Real-time Telephony Diagnostics Status endpoint
    if (url.pathname === '/api/telephony/status' && req.method === 'GET') {
      const activeSessions = sessionManager.getAllActiveSessions();
      const recentSessions = sessionManager.getRecentSessionsSummary();

      const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
      const maskedTwilioNumber = twilioNumber.length > 5
        ? `${twilioNumber.substring(0, 5)}***${twilioNumber.substring(twilioNumber.length - 2)}`
        : (twilioNumber ? 'Configured' : 'Not Configured');

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
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        const params = parseUrlEncodedBody(rawBody);

        const authToken = process.env.TWILIO_AUTH_TOKEN || '';
        const twilioSignature = (req.headers['x-twilio-signature'] as string) || '';
        const hostHeader = req.headers.host || 'localhost:8080';
        const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
        const endpoints = getTelephonyEndpoints(hostHeader, proto === 'https');

        if (authToken && !validateTwilioWebhookSignature(authToken, twilioSignature, endpoints.webhookUrl, params)) {
          console.warn(`[Telephony Server] Rejected request with invalid Twilio signature for URL: ${endpoints.webhookUrl}`);
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden: Invalid Twilio Webhook Signature');
          return;
        }

        const callerPhone = params.From || '';
        const calledPhone = params.To || '';
        const callSid = params.CallSid || `CALL-${Date.now()}`;

        console.log(`[Telephony Server] Inbound phone call received: CallSid=${callSid}, From=${callerPhone ? callerPhone.substring(0, 4) + '***' : 'Unknown'}`);

        const twiml = buildTwimlResponse(endpoints.streamUrl, callerPhone, calledPhone);

        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(twiml),
        });
        res.end(twiml);
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
            const streamSid = msg.streamSid;
            const callSid = msg.start?.callSid || `CALL-${Date.now()}`;
            const customParams = msg.start?.customParameters || {};
            const callerPhone = customParams.callerPhone || msg.start?.callerPhone || null;
            const calledPhone = customParams.calledPhone || msg.start?.calledPhone || null;

            currentStreamSid = streamSid;
            console.log(`[Telephony Server] Call started: streamSid=${streamSid}, callSid=${callSid}`);

            // Initialize isolated call session
            const session = sessionManager.createSession({
              callSid,
              streamSid,
              callerPhone,
              calledPhone,
              onDurationLimitReached: (s) => {
                console.log(`[Telephony Server] Call limit watchdog reached for stream ${s.streamSid}. Closing WebSocket.`);
                try {
                  ws.send(JSON.stringify({ event: 'clear', streamSid: s.streamSid }));
                  ws.close(1000, 'Max call duration reached');
                } catch {}
              },
            });

            // Initialize Gemini Live bridge for this call
            try {
              bridge = new GeminiTelephonyBridge(session, ws);
              activeBridges.set(streamSid, bridge);
              await bridge.connect();
            } catch (err) {
              console.error(`[Telephony Server] Failed to connect Gemini Live bridge for ${streamSid}:`, err);
              sessionManager.terminateSession(streamSid, 'Bridge initialization failure');
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
              sessionManager.terminateSession(streamSid, 'Twilio stream stop event');
              if (bridge) {
                bridge.close();
                bridge = null;
              }
              activeBridges.delete(streamSid);
            }
            break;
          }

          default:
            // Non-media events (e.g. mark, dtmf)
            break;
        }
      } catch (err) {
        console.error('[Telephony Server] Error processing WebSocket message:', err);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[Telephony Server] Twilio WebSocket closed (code: ${code}, reason: "${reason.toString()}")`);
      if (currentStreamSid) {
        sessionManager.terminateSession(currentStreamSid, `WebSocket client closed: ${code}`);
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
        sessionManager.terminateSession(currentStreamSid, `WebSocket error: ${err.message}`);
        if (bridge) {
          bridge.close();
          bridge = null;
        }
        activeBridges.delete(currentStreamSid);
      }
    });
  });

  return { server, wss };
}

// Start standalone server when executed directly
if (require.main === module || process.argv[1]?.includes('telephonyServer')) {
  const { server } = createTelephonyServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================================`);
    console.log(` [Summit HVAC] Telephony Bridge Server Active`);
    console.log(` HTTP & WebSocket Port: ${PORT}`);
    console.log(` Twilio Voice Webhook: http://0.0.0.0:${PORT}/api/telephony/twilio/voice`);
    console.log(` Twilio Media Stream:  ws://0.0.0.0:${PORT}/api/telephony/twilio-stream`);
    console.log(` Diagnostics Status:   http://0.0.0.0:${PORT}/api/telephony/status`);
    console.log(`=========================================================\n`);
  });
}
