import {
  AllowedIntent,
  CustomerInfo,
  ExtractedCustomerData,
  LeadStatus,
  UrgencyLevel,
} from '@/types';

const ALLOWED_INTENTS: AllowedIntent[] = [
  'AC_COOLING_FAILURE',
  'HEATING_FAILURE',
  'MAINTENANCE',
  'INSTALLATION',
  'PRICING',
  'APPOINTMENT',
  'SERVICE_AREA',
  'EMERGENCY',
  'GENERAL_QUESTION',
  'UNKNOWN',
];

/**
 * Validates and normalizes raw intent returned by the LLM.
 */
export function validateIntent(rawIntent: unknown): AllowedIntent {
  if (typeof rawIntent === 'string') {
    const trimmed = rawIntent.trim().toUpperCase() as AllowedIntent;
    if (ALLOWED_INTENTS.includes(trimmed)) {
      return trimmed;
    }
  }
  return 'UNKNOWN';
}

/**
 * Sanitizes extracted strings to prevent literal "null", "undefined", or "none" values from polluting state.
 */
export function sanitizeExtractedString(val: unknown): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none' ||
    lower === 'n/a' ||
    lower === 'not provided' ||
    lower === 'unknown'
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Checks if a provided customer name is ambiguous (e.g. "John/Alex" or "Bob or Alice").
 * Ambiguous names must NOT be stored as verified customer names.
 */
export function isAmbiguousName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.includes('/')) return true;
  if (/\b(?:or|and)\b/i.test(trimmed)) return true;
  if (/^(?:customer|caller|homeowner|resident|unknown|me|someone)$/i.test(trimmed)) return true;
  return false;
}

/**
 * Validates and sanitizes a customer name. Returns empty string if ambiguous or invalid.
 */
export function sanitizeCustomerName(rawName: unknown): string {
  const str = sanitizeExtractedString(rawName);
  if (!str || isAmbiguousName(str)) {
    return '';
  }
  return str;
}

/**
 * Deterministic fallback extractor for physical US street addresses with optional city.
 * E.g., "My name is Alex. I'm at 456 Oak Street in Plano." -> "456 Oak Street, Plano"
 * or "Address: 456 Oak Street, Plano" -> "456 Oak Street, Plano"
 */
export function extractFallbackAddress(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // Pattern 1: Explicit address indicators ("I'm at 456 Oak Street in Plano", "Address: 456 Oak Street, Plano")
  const explicitPattern =
    /(?:I'm at|I am at|located at|address is|address:)\s+([0-9]+\s+[A-Za-z0-9\s.,]+?(?:in\s+[A-Za-z]+|[A-Za-z]+,\s*[A-Z]{2}|[A-Za-z]+))\b/i;
  const match1 = text.match(explicitPattern);
  if (match1 && match1[1]) {
    let addr = match1[1].trim().replace(/\s+in\s+/i, ', ');
    addr = addr.replace(/[.,;]+$/, '').trim();
    if (addr.length > 5) return addr;
  }

  // Pattern 2: Street suffix pattern ("456 Oak Street in Plano" or "456 Oak Street, Plano")
  const streetPattern =
    /\b(\d{1,5}\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir)\b(?:[,\s]+(?:in\s+)?[A-Za-z]+)?)/i;
  const match2 = text.match(streetPattern);
  if (match2 && match2[1]) {
    let addr = match2[1].trim().replace(/\s+in\s+/i, ', ');
    addr = addr.replace(/[.,;]+$/, '').trim();
    if (addr.length > 5) return addr;
  }

  return null;
}

/**
 * Deterministic fallback extractor for appointment schedules requested by caller.
 * E.g., "Can someone come tomorrow?", "tomorrow morning", "Tuesday afternoon"
 */
export function extractFallbackAppointmentTime(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const pattern =
    /\b(tomorrow(?:\s+(?:morning|afternoon|evening))?|today(?:\s+(?:morning|afternoon|evening))?|this\s+(?:morning|afternoon|evening)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?)\b/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Normalizes urgency strictly per requirements:
 * - Emergency: immediate safety danger (gas odor, smoke, fire, sparks).
 * - Urgent: customer explicitly indicates urgent/emergency request (e.g. "urgent", "ASAP").
 * - Normal: ordinary repair, maintenance, installation, or question (e.g. "AC isn't cooling").
 */
export function normalizeUrgency(rawUrgency: unknown, conversationText: string = ''): UrgencyLevel {
  const lowerText = conversationText.toLowerCase();

  // 1. Safety hazards
  if (
    lowerText.includes('gas') ||
    lowerText.includes('rotten egg') ||
    lowerText.includes('sulfur') ||
    lowerText.includes('spark') ||
    lowerText.includes('smoke') ||
    lowerText.includes('fire') ||
    lowerText.includes('carbon monoxide')
  ) {
    return 'emergency';
  }

  // 2. Explicit urgent request words
  const hasExplicitUrgentWords =
    /\b(urgent|urgently|emergency service|asap|right away|immediately|emergency technician|rush)\b/i.test(lowerText);

  if (hasExplicitUrgentWords) {
    return 'urgent';
  }

  if (rawUrgency === 'emergency') {
    return 'emergency';
  }

  if (rawUrgency === 'urgent' && hasExplicitUrgentWords) {
    return 'urgent';
  }

  // Default to normal for all ordinary equipment failures (e.g. AC not cooling, stopped working)
  return 'normal';
}

/**
 * Computes the leadStatus in application code deterministically based on
 * collected customer details, appointment signals, and emergency flags.
 * An appointment request is considered valid only when customer contact info exists.
 */
export function calculateLeadStatus(
  currentStatus: LeadStatus,
  extracted: ExtractedCustomerData,
  accumulatedInfo: CustomerInfo
): LeadStatus {
  // 1. Emergency safety hazard
  if (extracted.isEmergencySafetyHazard || accumulatedInfo.urgency === 'emergency') {
    return 'transferred';
  }

  const hasCustomerContact = Boolean(
    accumulatedInfo.name ||
    accumulatedInfo.phone ||
    accumulatedInfo.address ||
    accumulatedInfo.serviceAddress
  );

  const hasApptPreference = Boolean(
    extracted.preferredAppointmentTime ||
    accumulatedInfo.preferredAppointmentTime
  );

  const hasExplicitApptReq = Boolean(extracted.hasCustomerRequestedAppointment);

  // 2. Appointment Requested: ONLY when valid (customer explicitly requested appointment or time, AND contact info exists)
  if ((hasExplicitApptReq || hasApptPreference) && hasCustomerContact) {
    return 'appointment_requested';
  }

  // 3. Qualified: customer has provided a reported issue AND contact information
  const hasIssue = Boolean(accumulatedInfo.problemDescription || extracted.reportedIssue);
  if (hasIssue && hasCustomerContact) {
    return 'qualified';
  }

  // If already at a higher status, do not downgrade
  if (currentStatus === 'appointment_requested' || currentStatus === 'qualified') {
    return currentStatus;
  }

  return 'new';
}

/**
 * Merges newly extracted data into existing CustomerInfo state conservatively.
 * Never overwrites existing valid information with null, empty, unknown, or ambiguous strings.
 */
export function mergeCustomerInfo(
  existing: CustomerInfo,
  extracted: ExtractedCustomerData
): CustomerInfo {
  const merged: CustomerInfo = { ...existing };

  // 1. Customer Name (reject ambiguous like "John/Alex")
  const validName = sanitizeCustomerName(extracted.customerName);
  if (validName.length > 1) {
    merged.name = validName;
  }

  // 2. Phone
  const validPhone = sanitizeExtractedString(extracted.phone);
  if (validPhone.length > 3) {
    merged.phone = validPhone;
  }

  // 3. Service Address (support both serviceAddress and address)
  const incomingAddress = sanitizeExtractedString(extracted.serviceAddress || extracted.address);
  if (incomingAddress.length > 2) {
    merged.address = incomingAddress;
    merged.serviceAddress = incomingAddress;
  }

  // 4. Service Type
  const validServiceType = sanitizeExtractedString(extracted.serviceType);
  if (validServiceType.length > 0) {
    merged.serviceType = validServiceType;
  }

  // 5. Reported Issue
  const validIssue = sanitizeExtractedString(extracted.reportedIssue);
  if (validIssue.length > 0) {
    merged.problemDescription = validIssue;
  }

  // 6. Urgency (emergency > urgent > normal)
  if (extracted.urgency) {
    const validUrgencies: UrgencyLevel[] = ['normal', 'urgent', 'emergency'];
    if (validUrgencies.includes(extracted.urgency)) {
      if (extracted.urgency === 'emergency') {
        merged.urgency = 'emergency';
      } else if (extracted.urgency === 'urgent' && merged.urgency !== 'emergency') {
        merged.urgency = 'urgent';
      } else if (!merged.urgency) {
        merged.urgency = extracted.urgency;
      }
    }
  }

  // 7. Preferred Appointment Time
  const validApptTime = sanitizeExtractedString(extracted.preferredAppointmentTime);
  if (validApptTime.length > 0) {
    merged.preferredAppointmentTime = validApptTime;
  }

  return merged;
}
