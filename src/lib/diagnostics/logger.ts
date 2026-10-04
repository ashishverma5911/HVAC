import { sanitizeLogPayload } from './piiMask';

export type DiagnosticEventType =
  | 'REQUEST_START'
  | 'REQUEST_SUCCESS'
  | 'REQUEST_FAILED'
  | 'VOICE_SESSION_START'
  | 'VOICE_SESSION_END'
  | 'VOICE_TOKEN_ISSUED'
  | 'TOOL_EXECUTED'
  | 'LEAD_PERSISTED'
  | 'APPOINTMENT_PERSISTED'
  | 'DEMO_RATE_LIMIT_TRIGGERED'
  | 'CALL_RECEIVED'
  | 'CALL_ENDED'
  | 'CALL_ERROR'
  | 'STREAM_CONNECTED'
  | 'GEMINI_CONNECTED'
  | 'USER_TRANSCRIPT'
  | 'TWILIO_SIGNATURE_VALIDATED';

export interface DiagnosticEventParams {
  event: DiagnosticEventType;
  businessId?: string | null;
  conversationId?: string | null;
  correlationId?: string;
  isDemo?: boolean;
  durationMs?: number;
  status?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export function logDiagnosticEvent(params: DiagnosticEventParams): void {
  const timestamp = new Date().toISOString();
  const safeDetails = params.details ? sanitizeLogPayload(params.details) : undefined;

  const logEntry = {
    timestamp,
    event: params.event,
    businessId: params.businessId || (params.isDemo ? 'demo' : 'unauthenticated'),
    conversationId: params.conversationId,
    correlationId: params.correlationId,
    durationMs: params.durationMs,
    status: params.status,
    details: safeDetails,
    error: params.error,
  };

  if (params.error || (params.status && params.status >= 500)) {
    console.error(`[DIAGNOSTIC:${params.event}]`, JSON.stringify(logEntry));
  } else {
    console.log(`[DIAGNOSTIC:${params.event}]`, JSON.stringify(logEntry));
  }
}
