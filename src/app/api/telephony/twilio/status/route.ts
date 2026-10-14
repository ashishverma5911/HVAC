import { NextRequest, NextResponse } from 'next/server';
import {
  resolveWebhookCandidateUrls,
  validateTwilioWebhookMultiUrl,
} from '@/lib/telephony/twilioSecurity';
import { CallSessionManager } from '@/lib/telephony/callSessionManager';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import { resolveInboundDestinationRouteAsync } from '@/lib/telephony/tenantPhoneMapping';
import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/telephony/twilio/status
 * Handles Twilio Call Status Callbacks (`queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed`, `no-answer`, `canceled`).
 * Strictly verifies Twilio request signature and associates status updates with the verified contractor.
 */
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
    const candidateUrls = resolveWebhookCandidateUrls(req.url, req.headers);

    const sigCheck = validateTwilioWebhookMultiUrl(
      authToken,
      twilioSignature,
      candidateUrls,
      params
    );
    if (!sigCheck.valid) {
      console.warn(
        `[TwilioStatusWebhook] Rejected invalid Twilio signature (${sigCheck.reason}) for status callback.`
      );
      return NextResponse.json(
        { error: 'Forbidden: Invalid Twilio Signature', code: 'INVALID_TWILIO_SIGNATURE' },
        { status: 403 }
      );
    }

    // Strip any untrusted tenant IDs
    const sanitizedParams: Record<string, unknown> = { ...params };
    stripUntrustedTenantIds(sanitizedParams);

    const callSid = (params.CallSid || '').trim();
    const callStatus = (params.CallStatus || '').trim();
    const callDurationRaw = params.CallDuration || params.Duration || '';
    const callDuration = callDurationRaw ? parseInt(callDurationRaw, 10) : undefined;
    const errorCode = params.ErrorCode?.trim() || null;
    const errorMessage = params.ErrorMessage?.trim() || null;
    const callerPhone = (params.From || params.Caller || '').trim() || null;
    const calledPhone = (params.To || params.Called || '').trim() || null;

    if (!callSid || !callStatus) {
      return NextResponse.json(
        { error: 'Missing required CallSid or CallStatus parameter.', code: 'MISSING_PARAMS' },
        { status: 400 }
      );
    }

    const sessionManager = CallSessionManager.getInstance();
    const callbackResult = sessionManager.recordCallStatusCallback({
      callSid,
      callStatus,
      callDuration: Number.isFinite(callDuration) ? callDuration : undefined,
      errorCode,
      errorMessage,
    });

    // Resolve businessId from active/registered session or destination phone route
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

    return NextResponse.json({
      success: true,
      callSid,
      callStatus: callbackResult.normalizedStatus,
      businessId,
    });
  } catch (err: unknown) {
    console.error('[TwilioStatusWebhook] Error processing status callback:', err);
    return NextResponse.json(
      { error: 'Failed to process call status callback.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
