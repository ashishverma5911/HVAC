import { NextRequest, NextResponse } from 'next/server';
import {
  createStreamCorrelationToken,
  resolveWebhookCandidateUrls,
  validateTwilioWebhookMultiUrl,
} from '@/lib/telephony/twilioSecurity';
import { getTelephonyEndpoints } from '@/lib/telephony/telephonyConfig';
import { resolveInboundDestinationRouteAsync } from '@/lib/telephony/tenantPhoneMapping';
import {
  buildCallFailureFallbackTwiml,
  buildInboundStreamTwiml,
  buildUnknownDestinationTwiml,
} from '@/lib/telephony/twimlBuilder';
import { CallSessionManager } from '@/lib/telephony/callSessionManager';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';
import { normalizeCallerPhoneInput } from '@/lib/compliance/callPrivacyAndCompliance';
import { validateContractorConfiguration } from '@/lib/ai/contractorConfig';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const params: Record<string, string> = {};

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (v !== undefined && v !== null) {
              params[k] = String(v);
            }
          }
        }
      } catch {
        // Fallback to URLSearchParams
      }
    }

    if (Object.keys(params).length === 0 && rawText) {
      const searchParams = new URLSearchParams(rawText);
      searchParams.forEach((v, k) => {
        params[k] = v;
      });
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const twilioSignature = req.headers.get('x-twilio-signature');
    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const isSecure = proto === 'https';

    const endpoints = getTelephonyEndpoints(host, isSecure);
    const candidateUrls = resolveWebhookCandidateUrls(req.url, req.headers, endpoints.webhookUrl);

    // 1. Validate Twilio request signature in production / when TWILIO_AUTH_TOKEN is configured
    const sigCheck = validateTwilioWebhookMultiUrl(
      authToken,
      twilioSignature,
      candidateUrls,
      params
    );
    if (!sigCheck.valid) {
      console.warn(
        `[TwilioVoiceWebhook] Rejected invalid Twilio signature (${sigCheck.reason}) for candidate URLs:`,
        candidateUrls
      );
      return new NextResponse('Forbidden: Invalid Twilio Signature', { status: 403 });
    }

    // 2. Strip any untrusted caller/client-supplied contractor IDs from params and URL query
    const untrustedCheck: Record<string, unknown> = { ...params };
    try {
      const urlObj = new URL(req.url);
      urlObj.searchParams.forEach((v, k) => {
        untrustedCheck[k] = v;
      });
    } catch {
      // Ignore URL parse error
    }
    stripUntrustedTenantIds(untrustedCheck);

    // 3. Extract trusted Twilio call parameters (normalizing missing/anonymous caller ID to null)
    const callerPhone = normalizeCallerPhoneInput(params.From || params.Caller || null);
    const calledPhone = (params.To || params.Called || '').trim();
    const forwardedFrom = (params.ForwardedFrom || '').trim() || undefined;
    const callSid = (params.CallSid || `CA-WEBHOOK-${Date.now()}`).trim();

    const sessionManager = CallSessionManager.getInstance();

    // 4. Duplicate webhook idempotency check by CallSid
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
      return new NextResponse(dup.registration.twiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
          'X-Aeris-Webhook-Duplicate': 'true',
          'X-Aeris-Contractor-Id': existingReg.businessId,
        },
      });
    }

    // 5. Map the destination phone number (`To` / `Called`) to the verified contractor
    const routeResult = await resolveInboundDestinationRouteAsync(calledPhone, {
      untrustedPayload: untrustedCheck,
    });

    if (!routeResult.matched) {
      console.warn(
        `[TwilioVoiceWebhook] Rejecting call ${callSid} to unassigned/invalid destination number "${calledPhone}" (reason: ${routeResult.reason}).`
      );
      const unknownTwiml = buildUnknownDestinationTwiml(calledPhone);
      return new NextResponse(unknownTwiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
          'X-Aeris-Route-Status': routeResult.reason,
        },
      });
    }

    const { businessId, businessConfig } = routeResult;

    try {
      await ContractorPersistenceService.ensureConversation(
        businessId,
        callSid,
        'telephony',
        callerPhone || undefined,
        calledPhone
      );
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
      );
    } catch (persistErr) {
      console.warn('[TwilioVoiceWebhook] Non-fatal error pre-persisting inbound call:', persistErr);
    }

    // 5b. Validate contractor configuration before starting AI receptionist
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
      return new NextResponse(fallbackTwiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
          'X-Aeris-Route-Status': 'INVALID_CONTRACTOR_CONFIGURATION',
          'X-Aeris-Contractor-Id': businessId,
        },
      });
    }

    const validatedConfig = configValidation.config;

    // 6. Check if AI session is forced unavailable or cannot start
    if (process.env.FORCE_AI_SESSION_UNAVAILABLE === 'true') {
      console.error(
        `[TwilioVoiceWebhook] AI session unavailable for CallSid=${callSid} (Contractor=${validatedConfig.name} [${businessId}]). Returning safe fallback TwiML.`
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
      return new NextResponse(fallbackTwiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
          'X-Aeris-Route-Status': 'FALLBACK_UNAVAILABLE',
          'X-Aeris-Contractor-Id': businessId,
        },
      });
    }

    // 7. Create stream correlation token & build TwiML connecting to Media Streams WebSocket
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

    // 8. Register webhook against the resolved contractor
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

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        'X-Aeris-Route-Status': 'MATCHED',
        'X-Aeris-Contractor-Id': businessId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[TwilioVoiceWebhook] Error handling voice webhook:', msg);
    const fallbackTwiml = buildCallFailureFallbackTwiml(null);
    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const isSecure = proto === 'https';
  const endpoints = getTelephonyEndpoints(host, isSecure);

  const correlationToken = createStreamCorrelationToken({
    callSid: 'CA-DIAGNOSTIC-PREVIEW',
    calledPhone: '+19725550199',
    callerPhone: '+15550000000',
    businessId: 'pilot-abc-cooling',
  });

  const twiml = buildInboundStreamTwiml({
    wsUrl: endpoints.streamUrl,
    callerPhone: '+15550000000',
    calledPhone: '+19725550199',
    callSid: 'CA-DIAGNOSTIC-PREVIEW',
    businessId: 'pilot-abc-cooling',
    correlationToken,
  });

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
