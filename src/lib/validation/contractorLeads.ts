import { LeadStatus, LeadUrgency } from '@/lib/supabase/types';
import { stripUntrustedTenantIds } from './tenantSanitizer';
import { minimizeCustomerText } from '@/lib/compliance/callPrivacyAndCompliance';

export const APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE =
  'Appointment requested — contractor confirmation required.';

export const VALID_LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'appointment_requested',
  'transferred',
  'converted',
  'completed',
  'closed_not_proceeding',
];

export const VALID_LEAD_URGENCIES: LeadUrgency[] = ['normal', 'urgent', 'emergency'];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  appointment_requested: 'Appointment Requested',
  transferred: 'Transferred / Escalated',
  converted: 'Converted',
  completed: 'Completed',
  closed_not_proceeding: 'Closed / Not Proceeding',
};

/**
 * Allowed status transitions for a lead.
 * - Leads in active intake/triage states ('new', 'contacted', 'qualified', 'appointment_requested', 'transferred')
 *   can progress to any follow-up or resolution state, but cannot regress back to 'new' once progressed.
 * - Terminal states ('converted', 'completed', 'closed_not_proceeding') cannot regress to 'new', 'qualified',
 *   'appointment_requested', or 'transferred', though a contractor may log 'contacted' to re-open follow-up
 *   or adjust between terminal outcomes.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: [
    'new',
    'contacted',
    'qualified',
    'appointment_requested',
    'transferred',
    'converted',
    'completed',
    'closed_not_proceeding',
  ],
  contacted: [
    'contacted',
    'qualified',
    'appointment_requested',
    'transferred',
    'converted',
    'completed',
    'closed_not_proceeding',
  ],
  qualified: [
    'contacted',
    'qualified',
    'appointment_requested',
    'transferred',
    'converted',
    'completed',
    'closed_not_proceeding',
  ],
  appointment_requested: [
    'contacted',
    'qualified',
    'appointment_requested',
    'transferred',
    'converted',
    'completed',
    'closed_not_proceeding',
  ],
  transferred: [
    'contacted',
    'qualified',
    'appointment_requested',
    'transferred',
    'converted',
    'completed',
    'closed_not_proceeding',
  ],
  converted: ['converted', 'completed', 'contacted', 'closed_not_proceeding'],
  completed: ['completed', 'converted', 'contacted', 'closed_not_proceeding'],
  closed_not_proceeding: ['closed_not_proceeding', 'contacted', 'converted', 'completed'],
};

const FABRICATED_PLACEHOLDER_PATTERNS = [
  /^unknown$/i,
  /^unknown\s+(caller|customer|name|address|phone)$/i,
  /^caller$/i,
  /^customer$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^null$/i,
  /^undefined$/i,
  /^not\s+provided$/i,
  /^not\s+available$/i,
  /^not\s+given$/i,
  /^tbd$/i,
  /^anonymous$/i,
  /^no\s+name$/i,
  /^no\s+address$/i,
  /^no\s+phone$/i,
  /^000[-.\s]?000[-.\s]?0000$/,
  /^123[-.\s]?456[-.\s]?7890$/,
  /^\(?555\)?[-.\s]?0000$/,
  /^\(?555\)?[-.\s]?555[-.\s]?0000$/,
];

export interface LeadInternalNote {
  id: string;
  text: string;
  author: string;
  authorEmail?: string | null;
  authorRole?: string | null;
  createdAt: string;
}

export type ContactAttemptMethod =
  | 'phone'
  | 'phone_call'
  | 'sms'
  | 'email'
  | 'voicemail'
  | 'in_person';
export type ContactAttemptOutcome =
  | 'reached'
  | 'connected'
  | 'voicemail'
  | 'left_voicemail'
  | 'no_answer'
  | 'scheduled'
  | 'scheduled_callback'
  | 'resolved'
  | 'other';

export interface LeadContactAttempt {
  id: string;
  method: ContactAttemptMethod;
  outcome: ContactAttemptOutcome;
  summary: string;
  recordedBy?: string | null;
  createdAt: string;
  timestamp: string;
}

export interface LeadNextFollowUp {
  action: string;
  dueAt?: string | null;
  assignedTo?: string | null;
  completed: boolean;
  updatedAt: string;
}

export interface LeadHumanEscalation {
  escalationType: 'callback_requested' | 'live_transfer';
  escalationMode: 'callback_request' | 'live_transfer';
  liveTransferConnected: boolean;
  callbackRequested: boolean;
  reason: string;
  urgency: LeadUrgency;
  summary?: string;
  callbackPhone?: string | null;
  transferNumber?: string | null;
  requestedAt: string;
  statusMessage: string;
}

export interface LeadStatusHistoryEntry {
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  changedBy?: string | null;
  changedAt: string;
}

export interface EnrichedLeadMetadata {
  workflowStatus?: LeadStatus;
  preferredAppointmentWindow?: string | null;
  sourceCallId?: string | null;
  missingCustomerFields?: string[];
  appointmentConfirmationMessage?: string | null;
  schedulingIntegrationBooked?: boolean;
  internalNotes?: LeadInternalNote[];
  contactAttempts?: LeadContactAttempt[];
  nextFollowUp?: LeadNextFollowUp | null;
  humanEscalation?: LeadHumanEscalation | null;
  statusHistory?: LeadStatusHistoryEntry[];
  [key: string]: unknown;
}

/**
 * Normalizes a status string or human-readable label into a canonical LeadStatus.
 */
export function normalizeLeadStatusInput(raw: unknown): LeadStatus | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  if ((VALID_LEAD_STATUSES as string[]).includes(cleaned)) {
    return cleaned as LeadStatus;
  }

  switch (cleaned) {
    case 'closed / not proceeding':
    case 'closed/not proceeding':
    case 'closed_not_proceeding':
    case 'not proceeding':
    case 'not_proceeding':
    case 'closed':
      return 'closed_not_proceeding';
    case 'appointment requested':
    case 'appt requested':
    case 'appt_requested':
      return 'appointment_requested';
    case 'new lead':
      return 'new';
    default:
      return null;
  }
}

/**
 * Validates both the target lead status and whether the transition from currentStatus is allowed.
 */
export function validateLeadStatusTransition(
  currentStatusRaw: unknown,
  targetStatusRaw: unknown
): {
  valid: boolean;
  status?: LeadStatus;
  code?: 'INVALID_STATUS' | 'INVALID_STATUS_TRANSITION';
  error?: string;
} {
  const targetStatus = normalizeLeadStatusInput(targetStatusRaw);
  if (!targetStatus) {
    return {
      valid: false,
      code: 'INVALID_STATUS',
      error: `Invalid status "${String(targetStatusRaw ?? '')}". Allowed values: ${VALID_LEAD_STATUSES.join(', ')}`,
    };
  }

  const currentStatus = normalizeLeadStatusInput(currentStatusRaw) || 'new';
  const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus] || VALID_LEAD_STATUSES;

  if (!allowedTargets.includes(targetStatus)) {
    return {
      valid: false,
      code: 'INVALID_STATUS_TRANSITION',
      error: `Invalid status transition from "${currentStatus}" (${LEAD_STATUS_LABELS[currentStatus]}) to "${targetStatus}" (${LEAD_STATUS_LABELS[targetStatus]}).`,
    };
  }

  return {
    valid: true,
    status: targetStatus,
  };
}

/**
 * Ensures missing or placeholder customer fields are never fabricated.
 * Returns an empty string if the value was omitted or matched a fabricated placeholder.
 */
export function sanitizeCustomerField(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = minimizeCustomerText(raw.trim()).trim();
  if (!trimmed) return '';

  for (const pattern of FABRICATED_PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return '';
    }
  }
  return trimmed;
}

/**
 * Sanitizes and validates lead capture fields without fabricating missing customer information.
 */
export function sanitizeLeadCaptureInput(rawInput: Record<string, unknown>): {
  customerName: string;
  phone: string;
  serviceAddress: string;
  cityArea: string;
  serviceType: string;
  reportedIssue: string;
  urgency: LeadUrgency;
  preferredAppointmentWindow: string;
  sourceCallId: string;
  status: LeadStatus;
  source: 'web_chat' | 'web_voice' | 'telephony';
  missingCustomerFields: string[];
} {
  const clean = stripUntrustedTenantIds(rawInput);

  const customerName = sanitizeCustomerField(clean.customerName ?? clean.customer_name ?? clean.name);
  const phone = sanitizeCustomerField(clean.phone ?? clean.callbackPhone ?? clean.callback_phone);
  const serviceAddress = sanitizeCustomerField(
    clean.serviceAddress ?? clean.service_address ?? clean.address
  );
  const cityArea = sanitizeCustomerField(
    clean.cityArea ?? clean.city_area ?? clean.cityOrArea ?? clean.city
  );
  const serviceType =
    sanitizeCustomerField(clean.serviceType ?? clean.service_type ?? clean.service) ||
    'General HVAC Service';
  const reportedIssue =
    sanitizeCustomerField(
      clean.reportedIssue ??
        clean.reported_issue ??
        clean.problemDescription ??
        clean.problem_description
    ) || '';

  const rawUrgency = String(clean.urgency || 'normal').trim().toLowerCase();
  const urgency: LeadUrgency = (VALID_LEAD_URGENCIES as string[]).includes(rawUrgency)
    ? (rawUrgency as LeadUrgency)
    : 'normal';

  const preferredAppointmentWindow = sanitizeCustomerField(
    clean.preferredAppointmentWindow ??
      clean.preferred_appointment_window ??
      clean.preferredAppointmentTime ??
      clean.preferredSlot
  );

  const sourceCallId = sanitizeCustomerField(
    clean.sourceCallId ?? clean.source_call_id ?? clean.conversationId ?? clean.conversation_id
  );

  const requestedStatus = normalizeLeadStatusInput(clean.status);
  const defaultStatus: LeadStatus = preferredAppointmentWindow
    ? 'appointment_requested'
    : customerName && phone && serviceAddress
    ? 'qualified'
    : 'new';

  const status: LeadStatus = requestedStatus || defaultStatus;

  const rawSource = String(clean.source || 'web_chat').trim().toLowerCase();
  const source: 'web_chat' | 'web_voice' | 'telephony' =
    rawSource === 'telephony' || rawSource === 'web_voice' ? rawSource : 'web_chat';

  const missingCustomerFields: string[] = [];
  if (!customerName) missingCustomerFields.push('customerName');
  if (!phone) missingCustomerFields.push('phone');
  if (!serviceAddress && !cityArea) missingCustomerFields.push('serviceAddress');

  return {
    customerName,
    phone,
    serviceAddress,
    cityArea,
    serviceType,
    reportedIssue,
    urgency,
    preferredAppointmentWindow,
    sourceCallId,
    status,
    source,
    missingCustomerFields,
  };
}

const VALID_CONTACT_METHODS: ContactAttemptMethod[] = [
  'phone',
  'phone_call',
  'sms',
  'email',
  'voicemail',
  'in_person',
];

const VALID_CONTACT_OUTCOMES: ContactAttemptOutcome[] = [
  'reached',
  'connected',
  'voicemail',
  'left_voicemail',
  'no_answer',
  'scheduled',
  'scheduled_callback',
  'resolved',
  'other',
];

export interface ValidatedLeadPatchPayload {
  status?: LeadStatus;
  internalNoteText?: string;
  contactAttempt?: {
    method: ContactAttemptMethod;
    outcome: ContactAttemptOutcome;
    summary: string;
  };
  nextFollowUp?: {
    action: string;
    dueAt?: string | null;
    assignedTo?: string | null;
    completed: boolean;
  } | null;
  preferredAppointmentWindow?: string;
  humanEscalation?: {
    reason: string;
    urgency: LeadUrgency;
    summary?: string;
    callbackPhone?: string | null;
  };
  customerCorrection?: {
    customerName?: string;
    phone?: string;
    serviceAddress?: string;
    cityArea?: string;
    serviceType?: string;
    reportedIssue?: string;
  };
  redactPii?: boolean;
}

/**
 * Validates a PATCH payload for updating a lead's status, internal notes,
 * contact attempts, next follow-up action, preferred appointment window,
 * callback escalation, or customer record corrections/privacy redaction.
 */
export function validateLeadPatchPayload(
  rawBody: Record<string, unknown>,
  currentStatus: LeadStatus
): {
  valid: boolean;
  code?: 'INVALID_STATUS' | 'INVALID_STATUS_TRANSITION' | 'VALIDATION_ERROR';
  error?: string;
  payload?: ValidatedLeadPatchPayload;
} {
  const clean = stripUntrustedTenantIds(rawBody);
  const result: ValidatedLeadPatchPayload = {};
  let hasAnyUpdate = false;

  // 1. Validate status if provided
  if (clean.status !== undefined) {
    const transitionCheck = validateLeadStatusTransition(currentStatus, clean.status);
    if (!transitionCheck.valid || !transitionCheck.status) {
      return {
        valid: false,
        code: transitionCheck.code || 'INVALID_STATUS',
        error: transitionCheck.error || 'Invalid lead status.',
      };
    }
    result.status = transitionCheck.status;
    hasAnyUpdate = true;
  }

  // 2. Validate internalNote / note if provided
  const rawNote = clean.internalNote ?? clean.note;
  if (rawNote !== undefined) {
    if (typeof rawNote !== 'string' || !rawNote.trim()) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'Internal note text must be a non-empty string.',
      };
    }
    if (rawNote.trim().length > 2000) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'Internal note cannot exceed 2000 characters.',
      };
    }
    result.internalNoteText = minimizeCustomerText(rawNote.trim());
    hasAnyUpdate = true;
  }

  // 3. Validate contactAttempt if provided
  if (clean.contactAttempt !== undefined) {
    if (!clean.contactAttempt || typeof clean.contactAttempt !== 'object') {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'contactAttempt must be a valid object with method, outcome, and summary.',
      };
    }
    const ca = clean.contactAttempt as Record<string, unknown>;
    const method = String(ca.method || 'phone_call').trim().toLowerCase() as ContactAttemptMethod;
    const outcome = String(ca.outcome || 'connected').trim().toLowerCase() as ContactAttemptOutcome;
    const summary = typeof ca.summary === 'string' ? ca.summary.trim() : '';

    if (!VALID_CONTACT_METHODS.includes(method)) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: `Invalid contact method "${method}". Allowed: ${VALID_CONTACT_METHODS.join(', ')}`,
      };
    }
    if (!VALID_CONTACT_OUTCOMES.includes(outcome)) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: `Invalid contact outcome "${outcome}". Allowed: ${VALID_CONTACT_OUTCOMES.join(', ')}`,
      };
    }
    if (!summary) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'Contact attempt summary is required.',
      };
    }

    result.contactAttempt = {
      method,
      outcome,
      summary: minimizeCustomerText(summary.slice(0, 1000)),
    };
    hasAnyUpdate = true;
  }

  // 4. Validate nextFollowUp if provided
  if (clean.nextFollowUp !== undefined) {
    if (clean.nextFollowUp === null) {
      result.nextFollowUp = null;
      hasAnyUpdate = true;
    } else if (typeof clean.nextFollowUp === 'object') {
      const nf = clean.nextFollowUp as Record<string, unknown>;
      const action = typeof nf.action === 'string' ? nf.action.trim() : '';
      if (!action) {
        return {
          valid: false,
          code: 'VALIDATION_ERROR',
          error: 'Next follow-up action description is required.',
        };
      }
      result.nextFollowUp = {
        action: minimizeCustomerText(action.slice(0, 500)),
        dueAt: typeof nf.dueAt === 'string' && nf.dueAt.trim() ? nf.dueAt.trim() : null,
        assignedTo:
          typeof nf.assignedTo === 'string' && nf.assignedTo.trim()
            ? nf.assignedTo.trim().slice(0, 120)
            : null,
        completed: Boolean(nf.completed),
      };
      hasAnyUpdate = true;
    } else {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'nextFollowUp must be an object or null.',
      };
    }
  }

  // 5. Validate preferredAppointmentWindow if provided
  const rawWindow = clean.preferredAppointmentWindow ?? clean.preferred_appointment_window;
  if (rawWindow !== undefined) {
    if (typeof rawWindow !== 'string') {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'preferredAppointmentWindow must be a string.',
      };
    }
    result.preferredAppointmentWindow = minimizeCustomerText(rawWindow.trim().slice(0, 300));
    hasAnyUpdate = true;
  }

  // 6. Validate humanEscalation / callbackRequest if provided
  const rawEsc = clean.humanEscalation ?? clean.callbackRequest;
  if (rawEsc !== undefined) {
    if (!rawEsc || typeof rawEsc !== 'object') {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'humanEscalation must be an object.',
      };
    }
    const esc = rawEsc as Record<string, unknown>;
    const reason = typeof esc.reason === 'string' ? esc.reason.trim() : '';
    if (!reason) {
      return {
        valid: false,
        code: 'VALIDATION_ERROR',
        error: 'Escalation reason is required.',
      };
    }
    const rawUrg = String(esc.urgency || 'urgent').trim().toLowerCase();
    const urgency: LeadUrgency = (VALID_LEAD_URGENCIES as string[]).includes(rawUrg)
      ? (rawUrg as LeadUrgency)
      : 'urgent';

    result.humanEscalation = {
      reason: minimizeCustomerText(reason.slice(0, 500)),
      urgency,
      summary:
        typeof esc.summary === 'string'
          ? minimizeCustomerText(esc.summary.trim().slice(0, 1000))
          : undefined,
      callbackPhone:
        typeof esc.callbackPhone === 'string' && esc.callbackPhone.trim()
          ? esc.callbackPhone.trim()
          : null,
    };
    hasAnyUpdate = true;
  }

  // 7. Customer Record Correction / Privacy Redaction
  const rawCustomerName = clean.customerName ?? clean.customer_name;
  const rawPhone = clean.phone ?? clean.callbackPhone;
  const rawAddress = clean.serviceAddress ?? clean.service_address;
  const rawCityArea = clean.cityArea ?? clean.city_area;
  const rawServiceType = clean.serviceType ?? clean.service_type;
  const rawReportedIssue = clean.reportedIssue ?? clean.reported_issue;

  if (
    rawCustomerName !== undefined ||
    rawPhone !== undefined ||
    rawAddress !== undefined ||
    rawCityArea !== undefined ||
    rawServiceType !== undefined ||
    rawReportedIssue !== undefined
  ) {
    result.customerCorrection = {};
    if (rawCustomerName !== undefined) {
      result.customerCorrection.customerName = sanitizeCustomerField(rawCustomerName);
    }
    if (rawPhone !== undefined) {
      result.customerCorrection.phone = sanitizeCustomerField(rawPhone);
    }
    if (rawAddress !== undefined) {
      result.customerCorrection.serviceAddress = sanitizeCustomerField(rawAddress);
    }
    if (rawCityArea !== undefined) {
      result.customerCorrection.cityArea = sanitizeCustomerField(rawCityArea);
    }
    if (rawServiceType !== undefined) {
      result.customerCorrection.serviceType = sanitizeCustomerField(rawServiceType);
    }
    if (rawReportedIssue !== undefined) {
      result.customerCorrection.reportedIssue = sanitizeCustomerField(rawReportedIssue);
    }
    hasAnyUpdate = true;
  }

  if (clean.redactPii === true) {
    result.redactPii = true;
    hasAnyUpdate = true;
  }

  if (!hasAnyUpdate) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error:
        'No valid lead update fields provided. Specify status, internalNote, contactAttempt, nextFollowUp, preferredAppointmentWindow, humanEscalation, customerCorrection fields, or redactPii.',
    };
  }

  return {
    valid: true,
    payload: result,
  };
}

/**
 * Enriches a database or ledger lead record with normalized Phase 8 fields
 * (workflow status, preferred appointment window, source call ID, follow-up notes,
 * contact attempts, next follow-up action, human escalation, and appointment confirmation notice).
 */
export function enrichLeadRecord<T extends Record<string, unknown>>(
  lead: T,
  appointments?: Array<Record<string, unknown>> | null
): T & {
  status: LeadStatus;
  preferred_appointment_window: string | null;
  source_call_id: string | null;
  missing_customer_fields: string[];
  internal_notes: LeadInternalNote[];
  contact_attempts: LeadContactAttempt[];
  next_follow_up: LeadNextFollowUp | null;
  human_escalation: LeadHumanEscalation | null;
  status_history: LeadStatusHistoryEntry[];
  appointment_confirmation_message: string | null;
  appointment: Record<string, unknown> | null;
} {
  const meta: EnrichedLeadMetadata =
    lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata)
      ? (lead.metadata as EnrichedLeadMetadata)
      : {};

  const effectiveStatus =
    normalizeLeadStatusInput(meta.workflowStatus) ||
    normalizeLeadStatusInput(lead.status) ||
    'new';

  const apptList = Array.isArray(appointments) ? appointments : [];
  const primaryAppt =
    apptList.length > 0
      ? apptList[0]
      : lead.appointment && typeof lead.appointment === 'object'
      ? (lead.appointment as Record<string, unknown>)
      : null;

  const preferredWindow =
    (typeof meta.preferredAppointmentWindow === 'string' && meta.preferredAppointmentWindow.trim()
      ? meta.preferredAppointmentWindow.trim()
      : null) ||
    (primaryAppt && typeof primaryAppt.requested_slot === 'string'
      ? primaryAppt.requested_slot
      : null) ||
    (typeof lead.preferred_appointment_window === 'string'
      ? lead.preferred_appointment_window
      : null);

  const hasAppointmentRequest =
    Boolean(primaryAppt) ||
    Boolean(preferredWindow) ||
    effectiveStatus === 'appointment_requested';

  const isExternallyBooked = Boolean(meta.schedulingIntegrationBooked === true);

  const confirmationMessage =
    hasAppointmentRequest && !isExternallyBooked
      ? APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE
      : null;

  const enrichedPrimaryAppt = primaryAppt
    ? {
        ...primaryAppt,
        status: isExternallyBooked ? primaryAppt.status : 'requested',
        confirmation_required: !isExternallyBooked,
        confirmation_message: !isExternallyBooked
          ? APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE
          : null,
      }
    : null;

  const sourceCallId =
    (typeof meta.sourceCallId === 'string' && meta.sourceCallId.trim()
      ? meta.sourceCallId.trim()
      : null) ||
    (typeof lead.conversation_id === 'string' && lead.conversation_id.trim()
      ? lead.conversation_id.trim()
      : null);

  return {
    ...lead,
    status: effectiveStatus,
    preferred_appointment_window: preferredWindow,
    source_call_id: sourceCallId,
    missing_customer_fields: Array.isArray(meta.missingCustomerFields)
      ? meta.missingCustomerFields
      : [],
    internal_notes: Array.isArray(meta.internalNotes) ? meta.internalNotes : [],
    contact_attempts: Array.isArray(meta.contactAttempts) ? meta.contactAttempts : [],
    next_follow_up: meta.nextFollowUp || null,
    human_escalation: meta.humanEscalation || null,
    status_history: Array.isArray(meta.statusHistory) ? meta.statusHistory : [],
    appointment_confirmation_message: confirmationMessage,
    appointment: enrichedPrimaryAppt,
  };
}
