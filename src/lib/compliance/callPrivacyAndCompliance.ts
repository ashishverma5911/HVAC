/**
 * Call Lifecycle Events, Recording & Consent Safeguards, and Customer Privacy Controls
 * for AERIS AI Receptionist (Phase 9).
 */

export type CallLifecycleEventType =
  | 'incoming_call_received'
  | 'ai_session_initialized'
  | 'call_answered'
  | 'lead_captured'
  | 'appointment_requested'
  | 'human_assistance_requested'
  | 'call_completed'
  | 'call_failed';

export const VALID_CALL_LIFECYCLE_EVENTS: ReadonlyArray<CallLifecycleEventType> = [
  'incoming_call_received',
  'ai_session_initialized',
  'call_answered',
  'lead_captured',
  'appointment_requested',
  'human_assistance_requested',
  'call_completed',
  'call_failed',
] as const;

export const CALL_LIFECYCLE_EVENT_LABELS: Record<CallLifecycleEventType, string> = {
  incoming_call_received: 'Incoming call received',
  ai_session_initialized: 'AI session initialized',
  call_answered: 'Call answered',
  lead_captured: 'Lead captured',
  appointment_requested: 'Appointment requested',
  human_assistance_requested: 'Human assistance requested',
  call_completed: 'Call completed',
  call_failed: 'Call failed',
};

const EVENT_ALIAS_MAP: Record<string, CallLifecycleEventType> = {
  incoming_call_received: 'incoming_call_received',
  'incoming call received': 'incoming_call_received',
  inbound_webhook_routed: 'incoming_call_received',
  call_received: 'incoming_call_received',

  ai_session_initialized: 'ai_session_initialized',
  'ai session initialized': 'ai_session_initialized',
  gemini_connected: 'ai_session_initialized',
  voice_session_start: 'ai_session_initialized',

  call_answered: 'call_answered',
  'call answered': 'call_answered',
  stream_connected: 'call_answered',

  lead_captured: 'lead_captured',
  'lead captured': 'lead_captured',
  lead_persisted: 'lead_captured',

  appointment_requested: 'appointment_requested',
  'appointment requested': 'appointment_requested',
  appointment_persisted: 'appointment_requested',

  human_assistance_requested: 'human_assistance_requested',
  'human assistance requested': 'human_assistance_requested',
  human_escalation_requested: 'human_assistance_requested',
  transfer_to_human: 'human_assistance_requested',

  call_completed: 'call_completed',
  'call completed': 'call_completed',
  call_ended: 'call_completed',

  call_failed: 'call_failed',
  'call failed': 'call_failed',
  call_error: 'call_failed',
};

/**
 * Normalizes raw event names or tool audit events to canonical CallLifecycleEventType where applicable.
 */
export function normalizeCallLifecycleEventType(
  rawType?: string | null,
  payload?: Record<string, unknown> | null
): CallLifecycleEventType | null {
  if (!rawType || typeof rawType !== 'string') return null;
  const cleaned = rawType.trim().toLowerCase();

  if (EVENT_ALIAS_MAP[cleaned]) {
    return EVENT_ALIAS_MAP[cleaned];
  }

  if (cleaned === 'tool_audit' && payload && typeof payload === 'object') {
    const tool = typeof payload.tool === 'string' ? payload.tool.trim().toLowerCase() : '';
    if (tool === 'create_lead') return 'lead_captured';
    if (tool === 'request_appointment') return 'appointment_requested';
    if (tool === 'transfer_to_human') return 'human_assistance_requested';
  }

  if (cleaned === 'call_status_updated' && payload && typeof payload === 'object') {
    const st = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
    if (st === 'completed') return 'call_completed';
    if (st === 'failed') return 'call_failed';
    if (st === 'in_progress' || st === 'active') return 'call_answered';
  }

  return null;
}

/**
 * Builds a deterministic idempotency key for a call event so retried webhooks
 * or repeated tool/status operations do not insert duplicate call events.
 */
export function buildCallEventIdempotencyKey(
  paramsOrBusinessId:
    | {
        businessId: string;
        conversationId: string;
        eventType: string;
        payload?: Record<string, unknown> | null;
        explicitKey?: string;
      }
    | string,
  conversationIdArg?: string,
  eventTypeArg?: string,
  payloadArg?: Record<string, unknown> | null
): string {
  const params =
    typeof paramsOrBusinessId === 'string'
      ? {
          businessId: paramsOrBusinessId,
          conversationId: conversationIdArg || '',
          eventType: eventTypeArg || '',
          payload: payloadArg || null,
        }
      : paramsOrBusinessId;

  if (params.explicitKey && params.explicitKey.trim()) {
    return `${params.businessId}|${params.conversationId}|${params.explicitKey.trim()}`;
  }

  const rawEventType = typeof params.eventType === 'string' ? params.eventType : '';
  const canonical = normalizeCallLifecycleEventType(rawEventType, params.payload);
  const effectiveType = canonical || rawEventType.trim().toLowerCase();
  const payload = params.payload || {};

  // Singleton per-call lifecycle milestones: only one event per (businessId, conversationId, milestone)
  if (
    effectiveType === 'incoming_call_received' ||
    effectiveType === 'ai_session_initialized' ||
    effectiveType === 'call_answered' ||
    effectiveType === 'call_completed' ||
    effectiveType === 'call_failed'
  ) {
    return `${params.businessId}|${params.conversationId}|lifecycle:${effectiveType}`;
  }

  if (effectiveType === 'lead_captured') {
    const leadToken = typeof payload.leadId === 'string' && payload.leadId ? payload.leadId : 'primary';
    return `${params.businessId}|${params.conversationId}|lifecycle:lead_captured|${leadToken}`;
  }

  if (effectiveType === 'appointment_requested') {
    const apptToken =
      (typeof payload.appointmentId === 'string' && payload.appointmentId) ||
      (typeof payload.preferredSlot === 'string' && payload.preferredSlot) ||
      (typeof payload.requestedSlot === 'string' && payload.requestedSlot) ||
      'primary';
    return `${params.businessId}|${params.conversationId}|lifecycle:appointment_requested|${apptToken}`;
  }

  if (effectiveType === 'human_assistance_requested') {
    const reasonToken =
      (typeof payload.reason === 'string' && payload.reason.trim().toLowerCase()) || 'primary';
    return `${params.businessId}|${params.conversationId}|lifecycle:human_assistance_requested|${reasonToken}`;
  }

  const toolToken = typeof payload.tool === 'string' ? payload.tool : '';
  const summaryToken = typeof payload.summary === 'string' ? payload.summary : '';
  const statusToken = typeof payload.status === 'string' ? payload.status : '';
  return `${params.businessId}|${params.conversationId}|evt:${effectiveType}|${toolToken}|${statusToken}|${summaryToken}`;
}

// ============================================================================
// CALL RECORDING & CONSENT SAFEGUARDS
// ============================================================================

export interface CallRecordingPolicyEvaluation {
  recordingEnabled: false;
  autoRecordingDisabled: true;
  rawAudioPersisted: false;
  consentDisclosureRequired: true;
  legalComplianceVerified: false;
  reason: string;
  federalAndStateRequirements: typeof US_CALL_RECORDING_CONSENT_REQUIREMENTS;
}

/**
 * Applicable US federal and state call-recording and AI monitoring consent requirements
 * that must be reviewed by qualified legal counsel before a real contractor PSTN pilot.
 */
export const US_CALL_RECORDING_CONSENT_REQUIREMENTS = {
  recordingEnabledByDefault: false,
  rawAudioStorageEnabled: false,
  legalComplianceVerified: false,
  complianceDisclaimer:
    'AERIS disables call audio recording by default and does not claim legal compliance. Before enabling call recording or launching a live PSTN pilot, the contractor must review applicable federal and state wiretapping/eavesdropping laws with qualified legal counsel.',
  federalRequirement: {
    statute: 'Electronic Communications Privacy Act (ECPA) / Federal Wiretap Act (18 U.S.C. § 2511)',
    rule: 'One-party consent baseline under federal law, subject to stricter state all-party consent statutes on interstate calls.',
  },
  allPartyConsentStates: [
    'California (Cal. Penal Code § 632)',
    'Pennsylvania (18 Pa. C.S. § 5703)',
    'Florida (Fla. Stat. § 934.03)',
    'Illinois (720 ILCS 5/14-2)',
    'Maryland (Md. Code, Cts. & Jud. Proc. § 10-402)',
    'Massachusetts (Mass. Gen. Laws ch. 272, § 99)',
    'Montana (Mont. Code Ann. § 45-8-213)',
    'New Hampshire (N.H. Rev. Stat. Ann. § 570-A:2)',
    'Washington (RCW 9.73.030)',
    'Connecticut (Conn. Gen. Stat. § 52-570d — civil all-party rule for recorded phone calls)',
    'Michigan (MCL § 750.539c — interpreted as one-party for participants, third-party restrictions apply)',
    'Nevada (NRS 200.620 — all-party consent required for wire communications)',
    'Oregon (ORS 165.540 — one-party for electronic/phone, all-party for in-person; disclosure recommended)',
    'Delaware (11 Del. C. § 2402 / § 1335 — conflicting privacy provisions; all-party disclosure recommended)',
  ],
  interstateCallRule:
    'When a caller and contractor (or cloud telephony server) are located in different states, courts may apply the stricter state law (e.g., California Cal. Penal Code § 632). Upfront caller notification and consent disclosure at the start of the call is required before any recording or third-party monitoring.',
  pilotReviewChecklist: [
    'Keep automatic call audio recording disabled unless explicitly reviewed and enabled with legal approval.',
    'Play or speak an upfront AI & transcription/recording disclosure in the opening greeting prior to capturing caller audio.',
    'Enforce strict tenant-scoped access controls (Row Level Security + server-side session verification) on all call records and transcripts.',
    'Configure retention and deletion procedures to honor customer record correction or deletion requests.',
  ],
} as const;

/**
 * Evaluates call recording policy.
 * Call recording is strictly disabled by default and never enabled automatically.
 */
export function evaluateCallRecordingPolicy(options?: {
  requestedRecording?: boolean;
  recordingRequested?: boolean;
  explicitContractorOptIn?: boolean;
  callerConsentDisclosed?: boolean;
}): CallRecordingPolicyEvaluation {
  const isRequested = Boolean(options?.requestedRecording || options?.recordingRequested);
  const reason = isRequested
    ? 'Call audio recording is blocked: AERIS does not enable call recording automatically, and live PSTN recording requires verified federal/state consent compliance.'
    : 'Call audio recording is disabled by default. Only text intake metadata and transcripts (where supported) are stored.';

  return {
    recordingEnabled: false,
    autoRecordingDisabled: true,
    rawAudioPersisted: false,
    consentDisclosureRequired: true,
    legalComplianceVerified: false,
    reason,
    federalAndStateRequirements: US_CALL_RECORDING_CONSENT_REQUIREMENTS,
  };
}

// ============================================================================
// CUSTOMER PRIVACY & DATA MINIMIZATION
// ============================================================================

const MISSING_CALLER_ID_TOKENS = new Set([
  '',
  'unknown',
  'anonymous',
  'restricted',
  'unavailable',
  'blocked',
  'private',
  'withheld',
  'no caller id',
  'n/a',
  'null',
  'undefined',
]);

/**
 * Normalizes an incoming caller phone identifier.
 * Returns null if the caller ID is missing, anonymous, restricted, or a placeholder,
 * ensuring missing caller IDs are never fabricated.
 */
export function normalizeCallerPhoneInput(rawPhone?: unknown): string | null {
  if (typeof rawPhone !== 'string') return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (MISSING_CALLER_ID_TOKENS.has(lower)) {
    return null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) {
    return null;
  }
  if (/^5550000$/.test(digits.slice(-7)) || /^0+$/.test(digits)) {
    return null;
  }
  return trimmed;
}

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /\bsk-[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[0-9A-Za-z._~+/-]+=*/gi,
  /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{5,}\b/g,
];

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PAYMENT_CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Scrubs secrets (API keys, JWTs, Bearer tokens) and non-intake sensitive data
 * (SSNs, payment card numbers) from any string before persistence or logging.
 */
export function minimizeCustomerText(text?: string | null, maxLength?: number): string {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED_SECRET]');
  }

  result = result.replace(SSN_PATTERN, '[REDACTED_SSN]');

  // Redact 13-19 digit sequences that are not standard 10/11-digit phone numbers
  result = result.replace(PAYMENT_CARD_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19) {
      return '[REDACTED_PAYMENT_DATA]';
    }
    return match;
  });

  if (typeof maxLength === 'number' && maxLength > 0 && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  return result;
}

const DISALLOWED_PRIVACY_PAYLOAD_KEYS = new Set([
  'ssn',
  'social_security',
  'socialsecuritynumber',
  'credit_card',
  'creditcard',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'bank_account',
  'routing_number',
  'date_of_birth',
  'dob',
  'drivers_license',
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'gemini_api_key',
  'twilio_auth_token',
  'supabase_service_role_key',
  'authorization',
  'raw_audio',
  'audio_bytes',
  'pcm_data',
  'mulaw_payload',
]);

/**
 * Minimizes a call event or metadata payload before database storage:
 * - Removes any secret keys, raw audio buffers, and non-intake sensitive fields (SSN, payment cards, etc.)
 * - Scrubs inline secrets or SSNs/card numbers from string values.
 */
export function minimizeEventPayload(
  payload?: Record<string, unknown> | null,
  depth = 0
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || depth > 5) {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (
      DISALLOWED_PRIVACY_PAYLOAD_KEYS.has(lowerKey) ||
      lowerKey.includes('secret') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('auth_token') ||
      lowerKey.includes('service_role')
    ) {
      continue;
    }

    if (typeof val === 'string') {
      out[key] = minimizeCustomerText(val);
    } else if (Array.isArray(val)) {
      out[key] = val.map((item) =>
        typeof item === 'string'
          ? minimizeCustomerText(item)
          : item && typeof item === 'object'
          ? minimizeEventPayload(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else if (val && typeof val === 'object') {
      out[key] = minimizeEventPayload(val as Record<string, unknown>, depth + 1);
    } else {
      out[key] = val;
    }
  }

  return out;
}

/**
 * Sanitizes an error message before returning it in an HTTP response so that
 * secrets, API keys, phone numbers, email addresses, and street addresses are never exposed.
 */
export function sanitizeClientErrorMessage(rawMessage?: string | null): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'An unexpected error occurred.';
  }

  let sanitized = minimizeCustomerText(rawMessage);

  // Redact phone numbers in error messages
  sanitized = sanitized.replace(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    '[REDACTED_PHONE]'
  );
  sanitized = sanitized.replace(/\+\d{10,15}\b/g, '[REDACTED_PHONE]');

  // Redact email addresses in error messages
  sanitized = sanitized.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    '[REDACTED_EMAIL]'
  );

  // Redact street addresses (e.g. "450 Stonebrook Pkwy" or "123 Main St") in error messages
  sanitized = sanitized.replace(
    /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,30}\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Pkwy|Parkway|Ct|Court|Way|Cir|Circle)\b/gi,
    '[REDACTED_ADDRESS]'
  );

  // Redact internal database schema, table, relation, and constraint identifiers & stack frames
  sanitized = sanitized.replace(/\bconstraint\s+"[^"]+"/gi, 'constraint "[REDACTED_CONSTRAINT]"');
  sanitized = sanitized.replace(/\brelation\s+"[^"]+"/gi, 'relation "[REDACTED_TABLE]"');
  sanitized = sanitized.replace(/\b(?:public|auth|pg_catalog)\.[a-z0-9_]+\b/gi, '[REDACTED_SCHEMA_OBJ]');
  sanitized = sanitized.replace(/\s+at\s+[^\n]+/g, '');

  return sanitized;
}
