import { isValidPhoneNumber } from './contractorOnboarding';

export interface ContractorSettingsInput {
  name: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  serviceAreas: string[];
  supportedZips?: string[];
  servicesOffered: string[];
  businessHours: {
    weekdays: string;
    saturday?: string;
    sunday?: string;
  };
  emergencyServiceEnabled: boolean;
  afterHoursInstructions?: string;
  transferPhoneNumber?: string;
  transferInstructions?: string;
  customGreeting?: string;
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  sanitized?: ContractorSettingsInput;
}

/**
 * Validates contractor business settings payload.
 * Strictly ignores/strips any client-provided business_id or tenant ID.
 */
export function validateSettingsInput(input: unknown): SettingsValidationResult {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: { _general: 'Invalid request body. Expected a JSON object.' },
    };
  }

  const data = input as Record<string, unknown>;

  // 1. Business Name
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length < 2) {
    errors.name = 'Business name is required and must be at least 2 characters.';
  }

  // 2. Business Phone
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  if (!phone || !isValidPhoneNumber(phone)) {
    errors.phone = 'A valid 10-digit business phone number is required (e.g., (214) 555-0100).';
  }

  // 3. Address
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  if (!address || address.length < 4) {
    errors.address = 'A valid business street address is required.';
  }

  // 4. City (optional, but if provided must be >= 2 characters)
  const city = typeof data.city === 'string' ? data.city.trim() : undefined;
  if (city !== undefined && city.length > 0 && city.length < 2) {
    errors.city = 'City must be at least 2 characters.';
  }

  // 5. State (optional, 2 letters)
  const state = typeof data.state === 'string' ? data.state.trim().toUpperCase() : undefined;
  if (state !== undefined && state.length > 0 && state.length !== 2) {
    errors.state = 'State must be a 2-letter postal abbreviation (e.g. TX, CA).';
  }

  // 6. Postal Code (optional)
  const postalCode = typeof data.postalCode === 'string' ? data.postalCode.trim() : undefined;

  // 7. Service Areas (at least 1 required)
  const rawServiceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : [];
  const serviceAreas = rawServiceAreas
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());
  if (serviceAreas.length === 0) {
    errors.serviceAreas = 'At least one service area (e.g., Dallas, Plano) is required.';
  }

  // 8. Supported Zips (optional)
  const rawZips = Array.isArray(data.supportedZips) ? data.supportedZips : [];
  const supportedZips = rawZips
    .filter((z): z is string => typeof z === 'string' && z.trim().length > 0)
    .map((z) => z.trim());

  // 9. Services Offered (at least 1 required)
  const rawServices = Array.isArray(data.servicesOffered) ? data.servicesOffered : [];
  const servicesOffered = rawServices
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());
  if (servicesOffered.length === 0) {
    errors.servicesOffered = 'At least one HVAC service (e.g., AC Repair) is required.';
  }

  // 10. Business Hours
  const rawHours = data.businessHours as Record<string, unknown> | undefined;
  if (!rawHours || typeof rawHours !== 'object') {
    errors.businessHours = 'Business hours configuration is required.';
  } else if (!rawHours.weekdays || typeof rawHours.weekdays !== 'string' || rawHours.weekdays.trim().length < 3) {
    errors.businessHours = 'Weekday business hours are required (e.g., 8:00 AM – 6:00 PM).';
  }

  const businessHours = {
    weekdays: typeof rawHours?.weekdays === 'string' ? rawHours.weekdays.trim() : '',
    saturday: typeof rawHours?.saturday === 'string' && rawHours.saturday.trim().length > 0 ? rawHours.saturday.trim() : undefined,
    sunday: typeof rawHours?.sunday === 'string' && rawHours.sunday.trim().length > 0 ? rawHours.sunday.trim() : undefined,
  };

  // 11. Emergency Service Enabled
  if (typeof data.emergencyServiceEnabled !== 'boolean') {
    errors.emergencyServiceEnabled = 'Emergency service setting must be a boolean (true or false).';
  }
  const emergencyServiceEnabled = Boolean(data.emergencyServiceEnabled);

  // 12. Transfer Phone Number (optional, but if provided must be valid)
  const transferPhoneNumber =
    typeof data.transferPhoneNumber === 'string' && data.transferPhoneNumber.trim().length > 0
      ? data.transferPhoneNumber.trim()
      : undefined;
  if (transferPhoneNumber && !isValidPhoneNumber(transferPhoneNumber)) {
    errors.transferPhoneNumber = 'Human transfer phone must be a valid 10-digit phone number.';
  }

  // 13. Text Fields
  const afterHoursInstructions =
    typeof data.afterHoursInstructions === 'string' && data.afterHoursInstructions.trim().length > 0
      ? data.afterHoursInstructions.trim()
      : undefined;

  const transferInstructions =
    typeof data.transferInstructions === 'string' && data.transferInstructions.trim().length > 0
      ? data.transferInstructions.trim()
      : undefined;

  const customGreeting =
    typeof data.customGreeting === 'string' && data.customGreeting.trim().length > 0
      ? data.customGreeting.trim()
      : undefined;

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: {},
    sanitized: {
      name,
      phone,
      address,
      city,
      state,
      postalCode,
      serviceAreas,
      supportedZips,
      servicesOffered,
      businessHours,
      emergencyServiceEnabled,
      afterHoursInstructions,
      transferPhoneNumber,
      transferInstructions,
      customGreeting,
    },
  };
}
