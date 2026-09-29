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
 * Infers customer intent using validated intent, conversation text, and executed tools.
 */
export function inferIntent(
  rawIntent: unknown,
  allUtterances: string,
  executedToolNames: string[] = []
): AllowedIntent {
  const lower = allUtterances.toLowerCase();
  const latestUtterance = allUtterances.split('\n').pop()?.toLowerCase() || lower;

  // 1. Safety Emergency
  if (
    lower.includes('gas') ||
    lower.includes('smoke') ||
    lower.includes('fire') ||
    lower.includes('spark')
  ) {
    return 'EMERGENCY';
  }

  // 2. Explicit Appointment / Booking Request
  const isAskingAppointment =
    /\b(come|schedule|appointment|book|slot|slots|tomorrow|today|available times|when can|visit)\b/i.test(
      latestUtterance
    );

  if (isAskingAppointment && !/\b(cooling|warm air|furnace|broken|stopped|leak)\b/i.test(latestUtterance)) {
    return 'APPOINTMENT';
  }

  // 3. Equipment Failures (Primary service inquiries)
  if (
    lower.includes('ac') ||
    lower.includes('cooling') ||
    lower.includes('cool') ||
    lower.includes('warm air') ||
    lower.includes('air condition')
  ) {
    return 'AC_COOLING_FAILURE';
  }

  if (lower.includes('heat') || lower.includes('furnace') || lower.includes('heater')) {
    return 'HEATING_FAILURE';
  }

  // 4. If latest was appointment request (even if issue was mentioned earlier)
  if (isAskingAppointment) {
    return 'APPOINTMENT';
  }

  // 5. Maintenance / Installation
  if (
    lower.includes('maintenance') ||
    lower.includes('tune-up') ||
    lower.includes('tune up') ||
    lower.includes('seasonal check')
  ) {
    return 'MAINTENANCE';
  }

  if (lower.includes('install') || lower.includes('replacement') || lower.includes('new system')) {
    return 'INSTALLATION';
  }

  // 6. Pricing
  if (
    lower.includes('cost') ||
    lower.includes('price') ||
    lower.includes('pricing') ||
    lower.includes('quote') ||
    lower.includes('diagnostic fee') ||
    lower.includes('charge')
  ) {
    return 'PRICING';
  }

  // 7. Service Area (when asking specifically about area coverage)
  if (
    lower.includes('service area') ||
    lower.includes('do you serve') ||
    lower.includes('do you cover') ||
    lower.includes('service dallas') ||
    lower.includes('service plano') ||
    lower.includes('service irving')
  ) {
    return 'SERVICE_AREA';
  }

  const valid = validateIntent(rawIntent);
  if (valid !== 'UNKNOWN') return valid;

  return 'GENERAL_QUESTION';
}

const DISALLOWED_NAME_FIRST_WORDS = new Set([
  'in', 'at', 'from', 'calling', 'located', 'living', 'live', 'having', 'experiencing',
  'wondering', 'looking', 'interested', 'asking', 'trying', 'reaching', 'hoping',
  'currently', 'just', 'on', 'with', 'here', 'there', 'out', 'near', 'not', 'my',
  'our', 'a', 'an', 'the', 'this', 'that', 'need', 'needs', 'want', 'wants',
  'seeing', 'checking', 'getting', 'reporting', 'telling', 'saying', 'speaking',
  'homeowner', 'customer', 'caller', 'resident', 'someone', 'me', 'ready',
  'fine', 'good', 'okay', 'ok', 'sure', 'sorry', 'happy', 'afraid', 'glad',
  'yes', 'no'
]);

const DISALLOWED_NAME_WORDS = new Set([
  'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
  'boulevard', 'blvd', 'way', 'court', 'ct', 'circle', 'cir', 'parkway', 'pkwy',
  'highway', 'hwy', 'houston', 'dallas', 'plano', 'irving', 'garland', 'richardson',
  'carrollton', 'austin', 'fort', 'worth', 'texas', 'tx', 'frisco', 'allen',
  'mckinney', 'arlington', 'denton', 'ac', 'hvac', 'heat', 'heating', 'cool',
  'cooling', 'unit', 'system', 'furnace', 'broken', 'repair', 'leak', 'leaking',
  'smoke', 'fire', 'gas', 'service', 'appointment', 'schedule', 'today', 'tomorrow',
  'morning', 'afternoon', 'evening', 'night', 'week', 'hour', 'hours', 'time',
  'person', 'human', 'dispatcher', 'manager', 'technician'
]);

/**
 * Validates whether a candidate string is an authentic customer person name.
 * Strictly rejects location phrases ("in Houston"), address snippets ("at 456 Oak Street"),
 * verbs, equipment issues, and prepositions.
 */
export function isValidCustomerName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  if (isAmbiguousName(trimmed)) return false;

  // Cannot contain numbers
  if (/\d/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
  if (words.length === 0 || words.length > 3) return false;

  if (DISALLOWED_NAME_FIRST_WORDS.has(words[0])) return false;

  for (const w of words) {
    if (w.length === 0) return false;
    if (DISALLOWED_NAME_WORDS.has(w)) return false;
    if (DISALLOWED_NAME_FIRST_WORDS.has(w)) return false;
  }

  return true;
}

/**
 * Deterministic fallback extractor for customer names from utterances.
 * Matches: "name Alex", "My name is Alex", "My name's Alex", "Name: Alex", "I'm Alex",
 * "This is Alex Miller", "Alex here", "John Smith speaking".
 * Strictly rejects location phrases like "I'm in Houston" or "I'm at 456 Oak Street".
 * Stops matching before delimiters like "address", "phone", "city", etc.
 */
export function extractFallbackName(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const delimiterWords = 'address|phone|number|city|street|service|problem|issue|at|in|my|and|is|live';
  const patterns = [
    new RegExp(`(?:my\\s+name(?:'s|\\s+is)?|name(?:\\s+is|:)?|call\\s+me|this\\s+is|I'm|I\\s+am)\\s+([A-Za-z]+)(?:\\s+(?!${delimiterWords}\\b)([A-Za-z]+))?`, 'i'),
    /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:here|speaking)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const first = match[1]?.trim();
      const second = match[2]?.trim();

      // Try full two-word candidate first if both valid
      if (first && second) {
        const fullCandidate = `${first} ${second}`;
        if (isValidCustomerName(fullCandidate)) {
          return fullCandidate;
        }
      }

      // Fallback to single first name if valid
      if (first && isValidCustomerName(first)) {
        return first;
      }
    }
  }

  return null;
}

/**
 * Deterministic fallback extractor for phone numbers.
 * Matches: 214-555-0199, (214) 555-0199, 214.555.0199, etc.
 */
export function extractFallbackPhone(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const pattern = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/;
  const match = text.match(pattern);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

/**
 * Deterministic fallback extractor for service types.
 */
export function extractFallbackServiceType(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  if (
    lower.includes('ac') ||
    lower.includes('cooling') ||
    lower.includes('cool') ||
    lower.includes('air condition')
  ) {
    if (lower.includes('install') || lower.includes('replace')) return 'AC Installation';
    return 'AC Repair';
  }
  if (lower.includes('heat') || lower.includes('furnace') || lower.includes('heater')) {
    return 'Heating Repair';
  }
  if (lower.includes('maintenance') || lower.includes('tune-up') || lower.includes('tune up')) {
    return 'HVAC Maintenance';
  }
  if (
    lower.includes('gas') ||
    lower.includes('spark') ||
    lower.includes('smoke') ||
    lower.includes('fire')
  ) {
    return 'Emergency Inspection';
  }
  return null;
}

/**
 * Deterministic fallback extractor for reported equipment issues.
 */
export function extractFallbackReportedIssue(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  if (
    lower.includes("isn't cooling") ||
    lower.includes('not cooling') ||
    lower.includes('stopped cooling')
  ) {
    return "AC isn't cooling";
  }
  if (lower.includes('blowing warm air') || lower.includes('warm air')) {
    return 'AC blowing warm air';
  }
  if (
    lower.includes('stopped working') ||
    lower.includes('not working') ||
    lower.includes("won't turn on")
  ) {
    return 'System not working';
  }
  if (
    lower.includes('making noise') ||
    lower.includes('rattling') ||
    lower.includes('squealing') ||
    lower.includes('buzzing')
  ) {
    return 'Unusual noise from unit';
  }
  if (lower.includes('leaking') || lower.includes('water leak')) {
    return 'Water leaking from system';
  }
  if (lower.includes('gas') || lower.includes('rotten egg') || lower.includes('sulfur')) {
    return 'Smell of gas near equipment';
  }
  if (lower.includes('maintenance') || lower.includes('tune-up')) {
    return 'Seasonal maintenance tune-up';
  }
  return null;
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
 * Validates and sanitizes a customer name. Returns empty string if ambiguous, invalid,
 * or contains location / preposition phrases (e.g. "in Houston", "Plano").
 */
export function sanitizeCustomerName(rawName: unknown): string {
  const str = sanitizeExtractedString(rawName);
  if (!str || !isValidCustomerName(str)) {
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

  // Pattern: Street number + street name + suffix (Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir) + optional (in City | , City)
  const pattern =
    /\b(\d{1,5}\s+[A-Za-z0-9\s.]+?\b(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir)\b)(?:[,\s]+(?:in\s+)?([A-Za-z]+))?/i;

  const match = text.match(pattern);
  if (match && match[1]) {
    const street = match[1].trim();
    const city = match[2]?.trim();

    // Verify city isn't an English conjunction or preposition
    if (city && !/^(?:and|the|my|our|with|for|but|or|so|then|please|tx|texas)$/i.test(city)) {
      return `${street}, ${city}`;
    }
    return street;
  }

  // Fallback: Explicit address patterns like "Address: 456 Oak Street, Plano"
  const explicitPattern =
    /(?:address is|address:)\s*([0-9]+\s+[A-Za-z0-9\s.,]+)/i;
  const matchExplicit = text.match(explicitPattern);
  if (matchExplicit && matchExplicit[1]) {
    let addr = matchExplicit[1].trim().replace(/\s+in\s+/i, ', ');
    addr = addr.replace(/[.,;]+$/, '').trim();
    if (addr.length > 5) return addr;
  }

  return null;
}

/**
 * Deterministic fallback extractor for bare cities/regions mentioned without a street address.
 * E.g. "I'm in Houston" -> "Houston", "calling from Plano" -> "Plano", "456 Oak Street in Plano" -> "Plano"
 */
export function extractFallbackCity(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Direct scan for known service cities & major metro areas
  const knownCities = [
    'Dallas', 'Plano', 'Irving', 'Garland', 'Richardson', 'Carrollton',
    'Houston', 'Austin', 'Fort Worth', 'Arlington', 'Frisco', 'Allen', 'McKinney'
  ];

  for (const city of knownCities) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(text)) {
      return city;
    }
  }

  // 2. Pattern: "in [City]", "from [City]", "near [City]", "calling from [City]"
  const pattern = /\b(?:in|from|near|at|calling from)\s+([A-Za-z]+)\b/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    const city = match[1].trim();
    if (!/^(?:and|the|my|our|with|for|but|or|so|then|please)$/i.test(city)) {
      return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    }
  }

  return null;
}

/**
 * Deterministic fallback extractor for appointment schedules requested by caller.
 * E.g., "Can someone come tomorrow?", "tomorrow morning", "Tuesday afternoon", "3 PM works for me", "3 PM"
 */
export function extractFallbackAppointmentTime(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Time + day or specific slot (e.g. "Tuesday 3:00 PM", "tomorrow at 3 PM")
  const specificSlotPattern =
    /\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|tomorrow|today)\s+(?:at\s+)?(?:[1-9]|1[0-2])(?::[0-5][0-9])?\s*(?:am|pm))\b/i;
  const matchSpecific = text.match(specificSlotPattern);
  if (matchSpecific && matchSpecific[1]) {
    return matchSpecific[1].trim();
  }

  // 2. Relative day with window (e.g. "tomorrow morning", "tomorrow", "today", "Tuesday afternoon")
  const relativePattern =
    /\b(tomorrow(?:\s+(?:morning|afternoon|evening))?|today(?:\s+(?:morning|afternoon|evening))?|this\s+(?:morning|afternoon|evening)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?)\b/i;
  const matchRelative = text.match(relativePattern);
  if (matchRelative && matchRelative[1]) {
    return matchRelative[1].trim();
  }

  // 3. Isolated time specification like "3 PM", "3:00 PM", "10 AM"
  const timePattern = /\b([1-9]|1[0-2])(?::[0-5][0-9])?\s*(?:am|pm)\b/i;
  const matchTime = text.match(timePattern);
  if (matchTime && matchTime[0]) {
    return matchTime[0].trim();
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

  // 3. Service Address (strictly requires street evidence, never bare city)
  const incomingAddress = sanitizeExtractedString(extracted.serviceAddress || extracted.address);
  if (incomingAddress.length > 2) {
    const incomingHasStreet = /\d+\s+[A-Za-z]/.test(incomingAddress);
    if (incomingHasStreet) {
      merged.address = incomingAddress;
      merged.serviceAddress = incomingAddress;
    }
  }

  // 3b. City / Area
  const incomingCity = sanitizeExtractedString(extracted.city || extracted.cityOrArea);
  if (incomingCity.length > 1) {
    merged.city = incomingCity;
    merged.cityOrArea = incomingCity;
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

/**
 * Extracts structured customer info and inferred intent directly from conversation utterances.
 * Can be called synchronously or as speech chunks are finalized in real-time voice sessions.
 */
export function extractStructuredCustomerData(
  allUtterances: string,
  existingInfo?: Partial<CustomerInfo>,
  currentLeadStatus: LeadStatus = 'new'
): {
  customerInfo: CustomerInfo;
  leadStatus: LeadStatus;
  intent: AllowedIntent;
} {
  const current: CustomerInfo = {
    name: existingInfo?.name || '',
    phone: existingInfo?.phone || '',
    address: existingInfo?.address || '',
    serviceAddress: existingInfo?.serviceAddress || '',
    city: existingInfo?.city || '',
    cityOrArea: existingInfo?.cityOrArea || '',
    serviceType: existingInfo?.serviceType || '',
    problemDescription: existingInfo?.problemDescription || '',
    urgency: existingInfo?.urgency || 'normal',
    preferredAppointmentTime: existingInfo?.preferredAppointmentTime || '',
  };

  const extracted: ExtractedCustomerData = {
    customerName: extractFallbackName(allUtterances) || current.name || null,
    phone: extractFallbackPhone(allUtterances) || current.phone || null,
    address: extractFallbackAddress(allUtterances) || current.address || null,
    serviceAddress: extractFallbackAddress(allUtterances) || current.serviceAddress || null,
    city: extractFallbackCity(allUtterances) || current.city || null,
    cityOrArea: extractFallbackCity(allUtterances) || current.cityOrArea || null,
    serviceType: extractFallbackServiceType(allUtterances) || current.serviceType || null,
    reportedIssue: extractFallbackReportedIssue(allUtterances) || current.problemDescription || null,
    urgency: normalizeUrgency(current.urgency, allUtterances),
    preferredAppointmentTime: extractFallbackAppointmentTime(allUtterances) || current.preferredAppointmentTime || null,
  };

  const merged = mergeCustomerInfo(current, extracted);
  const intent = inferIntent(null, allUtterances);
  const leadStatus = calculateLeadStatus(currentLeadStatus, extracted, merged);

  return { customerInfo: merged, leadStatus, intent };
}
