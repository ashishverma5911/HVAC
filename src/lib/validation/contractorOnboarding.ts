export interface OnboardingInput {
  name: string;
  phone: string;
  address: string;
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

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates a US phone number string.
 * Must contain at least 10 digits.
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/**
 * Server and client-side validator for contractor onboarding inputs.
 */
export function validateOnboardingInput(input: unknown): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: { _general: 'Invalid request body. Expected a JSON object.' },
    };
  }

  const data = input as Partial<OnboardingInput>;

  // 1. Business Name
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    errors.name = 'Business name is required and must be at least 2 characters.';
  }

  // 2. Business Phone
  if (!data.phone || typeof data.phone !== 'string' || !isValidPhoneNumber(data.phone)) {
    errors.phone = 'A valid 10-digit business phone number is required (e.g., (214) 555-0100).';
  }

  // 3. Address
  if (!data.address || typeof data.address !== 'string' || data.address.trim().length < 4) {
    errors.address = 'A valid business street address is required.';
  }

  // 4. City (optional but if provided must be >= 2 chars)
  if (data.city !== undefined && typeof data.city === 'string' && data.city.trim().length > 0 && data.city.trim().length < 2) {
    errors.city = 'City must be at least 2 characters.';
  }

  // 5. State (optional but if provided should be 2 characters)
  if (data.state !== undefined && typeof data.state === 'string' && data.state.trim().length > 0) {
    const trimmedState = data.state.trim().toUpperCase();
    if (trimmedState.length !== 2) {
      errors.state = 'State must be a 2-letter postal code (e.g. TX, CA).';
    }
  }

  // 6. Service Areas (at least 1 required)
  if (
    !Array.isArray(data.serviceAreas) ||
    data.serviceAreas.filter((a) => typeof a === 'string' && a.trim().length > 0).length === 0
  ) {
    errors.serviceAreas = 'At least one service area (e.g., Dallas, Fort Worth) is required.';
  }

  // 7. Services Offered (at least 1 required)
  if (
    !Array.isArray(data.servicesOffered) ||
    data.servicesOffered.filter((s) => typeof s === 'string' && s.trim().length > 0).length === 0
  ) {
    errors.servicesOffered = 'At least one HVAC service (e.g., AC Repair, Heating Installation) is required.';
  }

  // 8. Business Hours
  if (!data.businessHours || typeof data.businessHours !== 'object') {
    errors.businessHours = 'Business hours configuration is required.';
  } else {
    const hours = data.businessHours;
    if (!hours.weekdays || typeof hours.weekdays !== 'string' || hours.weekdays.trim().length < 3) {
      errors.businessHours = 'Weekday business hours are required (e.g., 8:00 AM – 6:00 PM).';
    }
  }

  // 9. Emergency Service Enabled
  if (typeof data.emergencyServiceEnabled !== 'boolean') {
    errors.emergencyServiceEnabled = 'Emergency service setting must be a boolean (true or false).';
  }

  // 10. Transfer Phone Number (optional, but if provided must be valid)
  if (data.transferPhoneNumber && typeof data.transferPhoneNumber === 'string' && data.transferPhoneNumber.trim().length > 0) {
    if (!isValidPhoneNumber(data.transferPhoneNumber)) {
      errors.transferPhoneNumber = 'Human transfer phone must be a valid 10-digit phone number.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
