import { NextRequest, NextResponse } from 'next/server';
import { requireContractorAuth } from '@/lib/auth/tenant';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import {
  US_CALL_RECORDING_CONSENT_REQUIREMENTS,
  evaluateCallRecordingPolicy,
} from '@/lib/compliance/callPrivacyAndCompliance';
import { buildSafeErrorResponse } from '@/lib/errors/safeResponse';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/calls
 * Returns persisted call history for the authenticated contractor, along with
 * call recording policy and transcript capability disclosures.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireContractorAuth();
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          ok: false,
          error: authResult.error || 'Authentication required.',
          code: authResult.code || 'UNAUTHORIZED',
        },
        { status: authResult.status || 401 }
      );
    }

    const { businessId } = authResult;
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status') || undefined;
    const outcomeFilter = url.searchParams.get('outcome') || undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 200) : 50;

    const calls = await ContractorPersistenceService.getContractorCallHistory(businessId, {
      status: statusFilter,
      outcome: outcomeFilter,
      limit,
    });

    const recordingPolicy = evaluateCallRecordingPolicy({
      recordingRequested: false,
    });

    return NextResponse.json({
      ok: true,
      businessId,
      total: calls.length,
      calls,
      recordingPolicy,
      consentRequirements: US_CALL_RECORDING_CONSENT_REQUIREMENTS,
      transcriptCapabilities: {
        inboundTelephonyBridge: {
          supported: true,
          mode: 'server_side_persisted',
          description:
            'Inbound Twilio Media Stream calls routed through GeminiTelephonyBridge persist turn-by-turn customer and AI text transcripts (and partial transcripts on disconnect) to conversation_messages.',
        },
        browserTextChat: {
          supported: true,
          mode: 'server_side_persisted',
          description:
            'Browser text chat turns sent via POST /api/receptionist/chat persist customer and AI messages server-side.',
        },
        browserLiveVoice: {
          supported: false,
          mode: 'direct_browser_to_gemini_live_ephemeral',
          description:
            'Browser Live Voice connects directly from the browser WebSocket to Gemini Live via an ephemeral token; turn-by-turn voice transcripts are displayed live in the browser UI and are not automatically persisted server-side unless a tool call is executed.',
        },
      },
    });
  } catch (err: unknown) {
    return buildSafeErrorResponse({
      status: 500,
      code: 'CALL_HISTORY_FETCH_FAILED',
      userMessage: 'Unable to load contractor call history at this time.',
      internalError: err,
    });
  }
}
