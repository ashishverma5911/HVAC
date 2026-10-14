import {
  isValidPhoneNumber,
  isValidEmailAddress,
  isValidWebsiteUrl,
  OnboardingForwardingMode,
} from './contractorOnboarding';
import { ContractorIndustry } from '@/lib/supabase/types';
import { SUPPORTED_INDUSTRIES, normalizeIndustry } from '@/lib/ai/industryTemplates';
import {
  AfterHoursBehavior,
  ContractorFaqItem,
  PhoneIntegrationStatus,
  SupportedVoiceLanguage,
  SUPPORTED_VOICE_LANGUAGES,
} from '@/lib/ai/contractorConfig';
import { stripUntrustedTenantIds } from './tenantSanitizer';

export interface ContractorSettingsInput {
  name: string;
  industry?: ContractorIndustry;
  phone: string;
  businessEmail?: string;
  website?: string;
  address?: string;
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
  callbackInstructions?: string;
  appointmentRequestRules?: string;
  transferPhoneNumber?: string;
  transferInstructions?: string;
  customGreeting?: string;
  pronunciationGuide?: string;
  conversationPreferences?: string;
  supportedLanguages?: SupportedVoiceLanguage[];
  callerIntakeQuestions?: string[];
  businessFaqs?: ContractorFaqItem[];
  forwardingEnabled?: boolean;
  forwardingMode?: OnboardingForwardingMode;
  carrierName?: string;
  phoneSetupStatus?: PhoneIntegrationStatus;
  onboardingStep?: number;
  onboardingCompleted?: boolean;
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  sanitized?: ContractorSettingsInput;
}

const VALID_VOICE_LANGUAGE_CODES = SUPPORTED_VOICE_LANGUAGES.map((l) => l.code);
const VALID_AFTER_HOURS_BEHAVIORS: AfterHoursBehavior[] = [
  'emergency_dispatch',
  'next_day_callback',
  'live_transfer',
];

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

  const data = stripUntrustedTenantIds(input as Record<string, unknown>);

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

  // 2b. Optional Business Email
  const businessEmail =
    typeof data.businessEmail === 'string' && data.businessEmail.trim().length > 0
      ? data.businessEmail.trim()
      : undefined;
  if (businessEmail && !isValidEmailAddress(businessEmail)) {
    errors.businessEmail = 'Please enter a valid business email address.';
  }

  // 2c. Optional Website
  const website =
    typeof data.website === 'string' && data.website.trim().length > 0
      ? data.website.trim()
      : undefined;
  if (website && !isValidWebsiteUrl(website)) {
    errors.website = 'Please enter a valid website URL (e.g., https://yourcompany.com).';
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

  // 6. Postal Code & Timezone (optional)
  const postalCode = typeof data.postalCode === 'string' ? data.postalCode.trim() : undefined;
  const timezone =
    typeof data.timezone === 'string' && data.timezone.trim().length > 0
      ? data.timezone.trim()
      : undefined;

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
    saturday:
      typeof rawHours?.saturday === 'string' && rawHours.saturday.trim().length > 0
        ? rawHours.saturday.trim()
        : undefined,
    sunday:
      typeof rawHours?.sunday === 'string' && rawHours.sunday.trim().length > 0
        ? rawHours.sunday.trim()
        : undefined,
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

  // 13. Text & Receptionist Behavior Fields
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

  const pronunciationGuide =
    typeof data.pronunciationGuide === 'string' && data.pronunciationGuide.trim().length > 0
      ? data.pronunciationGuide.trim()
      : undefined;

  const callbackInstructions =
    typeof data.callbackInstructions === 'string' && data.callbackInstructions.trim().length > 0
      ? data.callbackInstructions.trim()
      : undefined;

  const appointmentRequestRules =
    typeof data.appointmentRequestRules === 'string' && data.appointmentRequestRules.trim().length > 0
      ? data.appointmentRequestRules.trim()
      : undefined;

  const conversationPreferences =
    typeof data.conversationPreferences === 'string' && data.conversationPreferences.trim().length > 0
      ? data.conversationPreferences.trim()
      : undefined;

  let businessFaqs: ContractorFaqItem[] | undefined = undefined;
  if (Array.isArray(data.businessFaqs)) {
    businessFaqs = data.businessFaqs
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).question === 'string' &&
          typeof (item as Record<string, unknown>).answer === 'string' &&
          ((item as Record<string, unknown>).question as string).trim().length > 0 &&
          ((item as Record<string, unknown>).answer as string).trim().length > 0
      )
      .map((item) => ({
        question: (item.question as string).trim(),
        answer: (item.answer as string).trim(),
      }));
  }

  let afterHoursBehavior: AfterHoursBehavior | undefined = undefined;
  if (
    typeof data.afterHoursBehavior === 'string' &&
    data.afterHoursBehavior.trim().length > 0
  ) {
    const rawBehavior = data.afterHoursBehavior.trim() as AfterHoursBehavior;
    if (!VALID_AFTER_HOURS_BEHAVIORS.includes(rawBehavior)) {
      errors.afterHoursBehavior = `Unsupported after-hours behavior. Supported values: ${VALID_AFTER_HOURS_BEHAVIORS.join(', ')}.`;
    } else {
      afterHoursBehavior = rawBehavior;
    }
  }

  let supportedLanguages: SupportedVoiceLanguage[] | undefined = undefined;
  if (data.supportedLanguages !== undefined) {
    if (!Array.isArray(data.supportedLanguages) || data.supportedLanguages.length === 0) {
      errors.supportedLanguages = 'At least one supported voice language (en-US) is required.';
    } else {
      const invalidLangs = data.supportedLanguages.filter(
        (l) => !(VALID_VOICE_LANGUAGE_CODES as string[]).includes(String(l))
      );
      if (invalidLangs.length > 0) {
        errors.supportedLanguages = `Unsupported voice language(s): ${invalidLangs.join(', ')}. Supported: ${VALID_VOICE_LANGUAGE_CODES.join(', ')}.`;
      } else {
        supportedLanguages = data.supportedLanguages.map((l) => String(l) as SupportedVoiceLanguage);
      }
    }
  }

  let callerIntakeQuestions: string[] | undefined = undefined;
  if (Array.isArray(data.callerIntakeQuestions)) {
    callerIntakeQuestions = data.callerIntakeQuestions
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .map((q) => q.trim());
  }

  const forwardingEnabled =
    typeof data.forwardingEnabled === 'boolean' ? data.forwardingEnabled : undefined;
  const forwardingMode =
    typeof data.forwardingMode === 'string' &&
    [
      'unconditional',
      'busy_no_answer',
      'manual',
      'conditional_busy_no_answer',
      'unconditional_all_calls',
      'after_hours_only',
    ].includes(data.forwardingMode)
      ? (data.forwardingMode as OnboardingForwardingMode)
      : undefined;
  const carrierName =
    typeof data.carrierName === 'string' && data.carrierName.trim().length > 0
      ? data.carrierName.trim()
      : undefined;

  let industry: ContractorIndustry | undefined = undefined;
  if (data.industry !== undefined && data.industry !== null && String(data.industry).trim().length > 0) {
    const rawIndustry = String(data.industry).trim().toLowerCase() as ContractorIndustry;
    if (!SUPPORTED_INDUSTRIES.includes(rawIndustry)) {
      errors.industry = `Unsupported contractor industry. Supported values: ${SUPPORTED_INDUSTRIES.join(', ')}.`;
    } else {
      industry = normalizeIndustry(rawIndustry);
    }
  }

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
      ...(industry ? { industry } : {}),
      phone,
      ...(businessEmail ? { businessEmail } : {}),
      ...(website ? { website } : {}),
      address,
      city,
      state,
      postalCode,
      ...(timezone ? { timezone } : {}),
      serviceAreas,
      supportedZips,
      servicesOffered,
      businessHours,
      emergencyServiceEnabled,
      ...(afterHoursBehavior ? { afterHoursBehavior } : {}),
      afterHoursInstructions,
      ...(callbackInstructions ? { callbackInstructions } : {}),
      ...(appointmentRequestRules ? { appointmentRequestRules } : {}),
      transferPhoneNumber,
      transferInstructions,
      customGreeting,
      ...(pronunciationGuide ? { pronunciationGuide } : {}),
      ...(conversationPreferences ? { conversationPreferences } : {}),
      ...(supportedLanguages ? { supportedLanguages } : {}),
      ...(callerIntakeQuestions ? { callerIntakeQuestions } : {}),
      ...(businessFaqs ? { businessFaqs } : {}),
      ...(forwardingEnabled !== undefined ? { forwardingEnabled } : {}),
      ...(forwardingMode ? { forwardingMode } : {}),
      ...(carrierName ? { carrierName } : {}),
    },
  };
}
