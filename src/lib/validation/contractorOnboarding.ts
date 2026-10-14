import { ContractorIndustry } from '@/lib/supabase/types';
import { SUPPORTED_INDUSTRIES } from '@/lib/ai/industryTemplates';
import {
  AfterHoursBehavior,
  PhoneIntegrationStatus,
  SupportedVoiceLanguage,
  SUPPORTED_VOICE_LANGUAGES,
} from '@/lib/ai/contractorConfig';

export type OnboardingForwardingMode =
  | 'unconditional'
  | 'busy_no_answer'
  | 'manual'
  | 'conditional_busy_no_answer'
  | 'unconditional_all_calls'
  | 'after_hours_only';

export interface OnboardingInput {
  action?: 'create' | 'join';
  organizationSlug?: string;
  verificationPhone?: string;
  memberRole?: string;
  name: string;
  industry?: ContractorIndustry;
  phone: string;
  businessEmail?: string;
  website?: string;
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  timezone?: string;
  serviceAreas: string[];
  supportedZips?: string[];
  servicesOffered: string[];
  businessHours: {
    weekdays: string;
    saturday?: string;
    sunday?: string;
  };
  emergencyServiceEnabled: boolean;
  afterHoursBehavior?: AfterHoursBehavior;
  afterHoursInstructions?: string;
  transferPhoneNumber?: string;
  transferInstructions?: string;
  customGreeting?: string;
  pronunciationGuide?: string;
  supportedLanguages?: SupportedVoiceLanguage[] | string[];
  callerIntakeQuestions?: string[];
  forwardingEnabled?: boolean;
  forwardingMode?: OnboardingForwardingMode;
  carrierName?: string;
  phoneSetupStatus?: PhoneIntegrationStatus;
  onboardingStep?: number;
  onboardingCompleted?: boolean;
  isDraft?: boolean;
  resumeUpdate?: boolean;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const VALID_VOICE_LANGUAGE_CODES = SUPPORTED_VOICE_LANGUAGES.map((l) => l.code);
const VALID_AFTER_HOURS_BEHAVIORS: AfterHoursBehavior[] = [
  'emergency_dispatch',
  'next_day_callback',
  'live_transfer',
];

/**
 * Validates a US phone number string.
 * Must contain at least 10 digits.
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidWebsiteUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    return Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

/**
 * Validates a specific step of the 6-step onboarding flow.
 */
export function validateOnboardingStep(step: number, input: Partial<OnboardingInput>): ValidationResult {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (input.action === 'join') {
      if (
        !input.organizationSlug ||
        typeof input.organizationSlug !== 'string' ||
        input.organizationSlug.trim().length < 2
      ) {
        errors.organizationSlug = 'Organization slug is required to join an existing contractor team.';
      }
      if (
        !input.verificationPhone ||
        typeof input.verificationPhone !== 'string' ||
        !isValidPhoneNumber(input.verificationPhone)
      ) {
        errors.verificationPhone = 'A valid 10-digit registered business phone is required for verification.';
      }
    }
  } else if (step === 2) {
    if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
      errors.name = 'Business name is required and must be at least 2 characters.';
    }
    if (!input.phone || typeof input.phone !== 'string' || !isValidPhoneNumber(input.phone)) {
      errors.phone = 'A valid 10-digit business phone number is required (e.g., (214) 555-0100).';
    }
    if (
      input.businessEmail !== undefined &&
      input.businessEmail.trim().length > 0 &&
      !isValidEmailAddress(input.businessEmail)
    ) {
      errors.businessEmail = 'Please enter a valid business email address.';
    }
    if (
      input.website !== undefined &&
      input.website.trim().length > 0 &&
      !isValidWebsiteUrl(input.website)
    ) {
      errors.website = 'Please enter a valid website URL (e.g., https://yourcompany.com).';
    }
    if (!input.address || typeof input.address !== 'string' || input.address.trim().length < 4) {
      errors.address = 'A valid business street address is required.';
    }
    if (
      input.city !== undefined &&
      typeof input.city === 'string' &&
      input.city.trim().length > 0 &&
      input.city.trim().length < 2
    ) {
      errors.city = 'City must be at least 2 characters.';
    }
    if (input.state !== undefined && typeof input.state === 'string' && input.state.trim().length > 0) {
      const trimmedState = input.state.trim().toUpperCase();
      if (trimmedState.length !== 2) {
        errors.state = 'State must be a 2-letter postal code (e.g. TX, CA).';
      }
    }
    if (
      !Array.isArray(input.serviceAreas) ||
      input.serviceAreas.filter((a) => typeof a === 'string' && a.trim().length > 0).length === 0
    ) {
      errors.serviceAreas = 'At least one service area (e.g., Dallas, Fort Worth) is required.';
    }
    if (!input.businessHours || typeof input.businessHours !== 'object') {
      errors.businessHours = 'Business hours configuration is required.';
    } else if (
      !input.businessHours.weekdays ||
      typeof input.businessHours.weekdays !== 'string' ||
      input.businessHours.weekdays.trim().length < 3
    ) {
      errors.businessHours = 'Weekday business hours are required (e.g., 8:00 AM – 6:00 PM).';
    }
  } else if (step === 3) {
    if (
      !Array.isArray(input.servicesOffered) ||
      input.servicesOffered.filter((s) => typeof s === 'string' && s.trim().length > 0).length === 0
    ) {
      errors.servicesOffered = 'At least one HVAC service (e.g., AC Repair, Heating Installation) is required.';
    }
  } else if (step === 4) {
    if (typeof input.emergencyServiceEnabled !== 'boolean') {
      errors.emergencyServiceEnabled = 'Emergency service setting must be a boolean (true or false).';
    }
    if (
      input.transferPhoneNumber &&
      typeof input.transferPhoneNumber === 'string' &&
      input.transferPhoneNumber.trim().length > 0 &&
      !isValidPhoneNumber(input.transferPhoneNumber)
    ) {
      errors.transferPhoneNumber = 'Human transfer phone must be a valid 10-digit phone number.';
    }
    if (Array.isArray(input.supportedLanguages)) {
      if (input.supportedLanguages.length === 0) {
        errors.supportedLanguages = 'At least one supported voice language (English US) must be enabled.';
      } else {
        const unsupported = input.supportedLanguages.filter(
          (lang) => !(VALID_VOICE_LANGUAGE_CODES as string[]).includes(String(lang))
        );
        if (unsupported.length > 0) {
          errors.supportedLanguages = `Unsupported voice language(s): ${unsupported.join(', ')}. Supported: ${VALID_VOICE_LANGUAGE_CODES.join(', ')}.`;
        }
      }
    }
    if (
      input.callerIntakeQuestions !== undefined &&
      (!Array.isArray(input.callerIntakeQuestions) ||
        input.callerIntakeQuestions.filter((q) => typeof q === 'string' && q.trim().length > 0).length === 0)
    ) {
      errors.callerIntakeQuestions = 'At least one caller intake question is required.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
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

  // 2b. Optional Business Email
  if (
    data.businessEmail !== undefined &&
    typeof data.businessEmail === 'string' &&
    data.businessEmail.trim().length > 0 &&
    !isValidEmailAddress(data.businessEmail)
  ) {
    errors.businessEmail = 'Please enter a valid business email address.';
  }

  // 2c. Optional Website
  if (
    data.website !== undefined &&
    typeof data.website === 'string' &&
    data.website.trim().length > 0 &&
    !isValidWebsiteUrl(data.website)
  ) {
    errors.website = 'Please enter a valid website URL (e.g., https://yourcompany.com).';
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

  // 7. Services Offered (at least 1 required unless saving Step 2 draft)
  if (!data.isDraft || (data.onboardingStep && data.onboardingStep >= 3)) {
    if (
      !Array.isArray(data.servicesOffered) ||
      data.servicesOffered.filter((s) => typeof s === 'string' && s.trim().length > 0).length === 0
    ) {
      errors.servicesOffered = 'At least one HVAC service (e.g., AC Repair, Heating Installation) is required.';
    }
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

  // 11. Industry (optional, defaults to 'hvac', must be valid if provided)
  if (data.industry !== undefined && data.industry !== null && String(data.industry).trim().length > 0) {
    const normalized = String(data.industry).trim().toLowerCase() as ContractorIndustry;
    if (!SUPPORTED_INDUSTRIES.includes(normalized)) {
      errors.industry = `Unsupported contractor industry. Supported values: ${SUPPORTED_INDUSTRIES.join(', ')}.`;
    }
  }

  // 12. Supported Voice Languages (optional, but if provided must only include supported codes)
  if (data.supportedLanguages !== undefined) {
    if (!Array.isArray(data.supportedLanguages) || data.supportedLanguages.length === 0) {
      errors.supportedLanguages = 'At least one supported voice language (en-US) is required.';
    } else {
      const invalidLangs = data.supportedLanguages.filter(
        (l) => !(VALID_VOICE_LANGUAGE_CODES as string[]).includes(String(l))
      );
      if (invalidLangs.length > 0) {
        errors.supportedLanguages = `Unsupported voice language(s): ${invalidLangs.join(', ')}. Supported: ${VALID_VOICE_LANGUAGE_CODES.join(', ')}.`;
      }
    }
  }

  // 13. After-Hours Behavior (optional, validated if provided)
  if (
    data.afterHoursBehavior !== undefined &&
    !(VALID_AFTER_HOURS_BEHAVIORS as string[]).includes(String(data.afterHoursBehavior))
  ) {
    errors.afterHoursBehavior = `Invalid after-hours behavior. Supported: ${VALID_AFTER_HOURS_BEHAVIORS.join(', ')}.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
