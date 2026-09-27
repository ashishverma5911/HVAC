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
 * Computes the leadStatus in application code deterministically based on
 * collected customer details, appointment signals, and emergency flags.
 */
export function calculateLeadStatus(
  currentStatus: LeadStatus,
  extracted: ExtractedCustomerData,
  accumulatedInfo: CustomerInfo
): LeadStatus {
  // If already transferred or completed, preserve state unless new emergency
  if (extracted.isEmergencySafetyHazard) {
    return 'transferred';
  }

  // Appointment requested takes precedence if an explicit appointment request or time is present
  const hasApptTime = Boolean(extracted.preferredAppointmentTime || accumulatedInfo.preferredAppointmentTime);
  const explicitApptReq = Boolean(extracted.hasCustomerRequestedAppointment);

  if (explicitApptReq || (hasApptTime && accumulatedInfo.name)) {
    return 'appointment_requested';
  }

  // Qualified: customer has provided a reported issue AND (customer name OR phone OR service address)
  const hasIssue = Boolean(accumulatedInfo.problemDescription || extracted.reportedIssue);
  const hasContact = Boolean(
    accumulatedInfo.name ||
      extracted.customerName ||
      accumulatedInfo.phone ||
      extracted.phone ||
      accumulatedInfo.address ||
      extracted.address
  );

  if (hasIssue && hasContact) {
    return 'qualified';
  }

  // If already at a higher status, don't downgrade back to 'new'
  if (currentStatus === 'appointment_requested' || currentStatus === 'qualified') {
    return currentStatus;
  }

  return 'new';
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
 * Merges newly extracted data into existing CustomerInfo state conservatively.
 * Never overwrites existing valid information with null or empty strings.
 */
export function mergeCustomerInfo(
  existing: CustomerInfo,
  extracted: ExtractedCustomerData
): CustomerInfo {
  const merged: CustomerInfo = { ...existing };

  const name = sanitizeExtractedString(extracted.customerName);
  if (name.length > 1) {
    merged.name = name;
  }

  const phone = sanitizeExtractedString(extracted.phone);
  if (phone.length > 3) {
    merged.phone = phone;
  }

  const address = sanitizeExtractedString(extracted.address);
  if (address.length > 2) {
    merged.address = address;
  }

  const serviceType = sanitizeExtractedString(extracted.serviceType);
  if (serviceType.length > 0) {
    merged.serviceType = serviceType;
  }

  const reportedIssue = sanitizeExtractedString(extracted.reportedIssue);
  if (reportedIssue.length > 0) {
    merged.problemDescription = reportedIssue;
  }

  if (extracted.urgency) {
    const validUrgencies: UrgencyLevel[] = ['normal', 'urgent', 'emergency'];
    if (validUrgencies.includes(extracted.urgency)) {
      // Emergency / urgent always take priority over normal
      if (extracted.urgency === 'emergency' || merged.urgency !== 'emergency') {
        merged.urgency = extracted.urgency;
      }
    }
  }

  if (extracted.preferredAppointmentTime && extracted.preferredAppointmentTime.trim().length > 0) {
    merged.preferredAppointmentTime = extracted.preferredAppointmentTime.trim();
  }

  return merged;
}
