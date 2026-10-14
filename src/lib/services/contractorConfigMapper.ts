import {
  AfterHoursBehavior,
  ContractorFaqItem,
  DEFAULT_APPOINTMENT_REQUEST_RULES,
  DEFAULT_BUSINESS_FAQS,
  DEFAULT_CALLER_INTAKE_QUESTIONS,
  DEFAULT_CONVERSATION_PREFERENCES,
  PhoneIntegrationStatus,
  SupportedVoiceLanguage,
} from '@/lib/ai/contractorConfig';
import { Json } from '@/lib/supabase/types';

export type ForwardingMode =
  | 'unconditional'
  | 'busy_no_answer'
  | 'manual'
  | 'conditional_busy_no_answer'
  | 'unconditional_all_calls'
  | 'after_hours_only';

export interface ExtendedSettingsMetadata {
  weekdays: string;
  saturday: string;
  sunday: string;
  businessHours: {
    weekdays: string;
    saturday: string;
    sunday: string;
  };
  timezone: string;
  businessEmail: string;
  website: string;
  pronunciationGuide: string;
  conversationPreferences: string;
  callbackInstructions: string;
  appointmentRequestRules: string;
  supportedLanguages: SupportedVoiceLanguage[];
  callerIntakeQuestions: string[];
  businessFaqs: ContractorFaqItem[];
  afterHoursBehavior: AfterHoursBehavior;
  forwardingEnabled: boolean;
  forwardingMode: ForwardingMode;
  carrierName: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
}

const VALID_FORWARDING_MODES: ForwardingMode[] = [
  'unconditional',
  'busy_no_answer',
  'manual',
  'conditional_busy_no_answer',
  'unconditional_all_calls',
  'after_hours_only',
];

/**
 * Extracts structured hours and extended receptionist/onboarding metadata
 * from `business_settings.business_hours` (JSONB) and optional `industry_config` (JSONB).
 * Works seamlessly whether or not optional columns from later migrations exist.
 */
export function extractExtendedSettingsMetadata(
  rawBusinessHours: unknown,
  rawIndustryConfig?: unknown,
  fallbackTimezone?: string | null
): ExtendedSettingsMetadata {
  const hoursObj =
    rawBusinessHours && typeof rawBusinessHours === 'object'
      ? (rawBusinessHours as Record<string, unknown>)
      : {};
  const configObj =
    rawIndustryConfig && typeof rawIndustryConfig === 'object'
      ? (rawIndustryConfig as Record<string, unknown>)
      : {};

  const pickString = (key: string, defaultVal = ''): string => {
    if (typeof hoursObj[key] === 'string' && (hoursObj[key] as string).trim().length > 0) {
      return (hoursObj[key] as string).trim();
    }
    if (typeof configObj[key] === 'string' && (configObj[key] as string).trim().length > 0) {
      return (configObj[key] as string).trim();
    }
    return defaultVal;
  };

  const rawLangs = Array.isArray(hoursObj.supportedLanguages)
    ? hoursObj.supportedLanguages
    : Array.isArray(configObj.supportedLanguages)
    ? configObj.supportedLanguages
    : ['en-US'];

  const supportedLanguages = rawLangs.filter(
    (l): l is SupportedVoiceLanguage => l === 'en-US' || l === 'es-US'
  );

  const rawQuestions = Array.isArray(hoursObj.callerIntakeQuestions)
    ? hoursObj.callerIntakeQuestions
    : Array.isArray(configObj.callerIntakeQuestions)
    ? configObj.callerIntakeQuestions
    : DEFAULT_CALLER_INTAKE_QUESTIONS;

  const callerIntakeQuestions = rawQuestions
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim());

  const rawFaqs = Array.isArray(hoursObj.businessFaqs)
    ? hoursObj.businessFaqs
    : Array.isArray(configObj.businessFaqs)
    ? configObj.businessFaqs
    : DEFAULT_BUSINESS_FAQS;

  const businessFaqs: ContractorFaqItem[] = rawFaqs
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).question === 'string' &&
        typeof (item as Record<string, unknown>).answer === 'string'
    )
    .map((item) => ({
      question: String(item.question).trim(),
      answer: String(item.answer).trim(),
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);

  const rawBehavior = pickString('afterHoursBehavior', 'emergency_dispatch');
  const afterHoursBehavior: AfterHoursBehavior =
    rawBehavior === 'next_day_callback' || rawBehavior === 'live_transfer'
      ? rawBehavior
      : 'emergency_dispatch';

  const rawForwardingMode = pickString('forwardingMode', 'busy_no_answer') as ForwardingMode;
  const forwardingMode: ForwardingMode = VALID_FORWARDING_MODES.includes(rawForwardingMode)
    ? rawForwardingMode
    : 'busy_no_answer';

  const forwardingEnabled =
    typeof hoursObj.forwardingEnabled === 'boolean'
      ? hoursObj.forwardingEnabled
      : typeof configObj.forwardingEnabled === 'boolean'
      ? configObj.forwardingEnabled
      : false;

  const onboardingCompleted =
    typeof hoursObj.onboardingCompleted === 'boolean'
      ? hoursObj.onboardingCompleted
      : typeof configObj.onboardingCompleted === 'boolean'
      ? configObj.onboardingCompleted
      : true;

  const onboardingStep =
    typeof hoursObj.onboardingStep === 'number'
      ? hoursObj.onboardingStep
      : typeof configObj.onboardingStep === 'number'
      ? configObj.onboardingStep
      : onboardingCompleted
      ? 6
      : 2;

  const weekdays = pickString('weekdays', '8:00 AM – 6:00 PM');
  const saturday = pickString('saturday', '');
  const sunday = pickString('sunday', '');

  const rawWebsite = pickString('website', '');
  const website =
    rawWebsite.length > 0 && !/^https?:\/\//i.test(rawWebsite)
      ? `https://${rawWebsite}`
      : rawWebsite;

  return {
    weekdays,
    saturday,
    sunday,
    businessHours: {
      weekdays,
      saturday,
      sunday,
    },
    timezone: pickString('timezone', fallbackTimezone || 'America/Chicago'),
    businessEmail: pickString('businessEmail', ''),
    website,
    pronunciationGuide: pickString('pronunciationGuide', ''),
    conversationPreferences: pickString(
      'conversationPreferences',
      DEFAULT_CONVERSATION_PREFERENCES
    ),
    callbackInstructions: pickString('callbackInstructions', ''),
    appointmentRequestRules: pickString(
      'appointmentRequestRules',
      DEFAULT_APPOINTMENT_REQUEST_RULES
    ),
    supportedLanguages: supportedLanguages.length > 0 ? supportedLanguages : ['en-US'],
    callerIntakeQuestions:
      callerIntakeQuestions.length > 0 ? callerIntakeQuestions : DEFAULT_CALLER_INTAKE_QUESTIONS,
    businessFaqs: businessFaqs.length > 0 ? businessFaqs : DEFAULT_BUSINESS_FAQS,
    afterHoursBehavior,
    forwardingEnabled,
    forwardingMode,
    carrierName: pickString('carrierName', ''),
    onboardingCompleted,
    onboardingStep,
  };
}

/**
 * Serializes `business_hours` JSONB payload while preserving all existing and newly updated fields.
 */
export function buildBusinessHoursJsonb(
  existingHoursRaw: unknown,
  updates: {
    weekdays: string;
    saturday?: string;
    sunday?: string;
    timezone?: string;
    businessEmail?: string;
    website?: string;
    pronunciationGuide?: string;
    conversationPreferences?: string;
    callbackInstructions?: string;
    appointmentRequestRules?: string;
    supportedLanguages?: SupportedVoiceLanguage[] | string[];
    callerIntakeQuestions?: string[];
    businessFaqs?: ContractorFaqItem[];
    afterHoursBehavior?: AfterHoursBehavior;
    forwardingEnabled?: boolean;
    forwardingMode?: ForwardingMode;
    carrierName?: string;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
  }
): { [key: string]: Json | undefined } {
  const prev = extractExtendedSettingsMetadata(existingHoursRaw);

  const rawWebsite = updates.website !== undefined ? updates.website.trim() : prev.website;
  const normalizedWebsite =
    rawWebsite.length > 0 && !/^https?:\/\//i.test(rawWebsite)
      ? `https://${rawWebsite}`
      : rawWebsite;

  const filteredLanguages = updates.supportedLanguages
    ? updates.supportedLanguages.filter(
        (l): l is SupportedVoiceLanguage => l === 'en-US' || l === 'es-US'
      )
    : [];

  const serializedFaqs = (
    updates.businessFaqs && updates.businessFaqs.length > 0
      ? updates.businessFaqs
      : prev.businessFaqs
  ).map((f) => ({
    question: f.question,
    answer: f.answer,
  }));

  return {
    weekdays: updates.weekdays || prev.weekdays || '8:00 AM – 6:00 PM',
    ...(updates.saturday !== undefined
      ? updates.saturday
        ? { saturday: updates.saturday }
        : {}
      : prev.saturday
      ? { saturday: prev.saturday }
      : {}),
    ...(updates.sunday !== undefined
      ? updates.sunday
        ? { sunday: updates.sunday }
        : {}
      : prev.sunday
      ? { sunday: prev.sunday }
      : {}),
    timezone: updates.timezone !== undefined ? updates.timezone : prev.timezone,
    businessEmail:
      updates.businessEmail !== undefined ? updates.businessEmail : prev.businessEmail,
    website: normalizedWebsite,
    pronunciationGuide:
      updates.pronunciationGuide !== undefined
        ? updates.pronunciationGuide
        : prev.pronunciationGuide,
    conversationPreferences:
      updates.conversationPreferences !== undefined
        ? updates.conversationPreferences
        : prev.conversationPreferences,
    callbackInstructions:
      updates.callbackInstructions !== undefined
        ? updates.callbackInstructions
        : prev.callbackInstructions,
    appointmentRequestRules:
      updates.appointmentRequestRules !== undefined
        ? updates.appointmentRequestRules
        : prev.appointmentRequestRules,
    supportedLanguages:
      filteredLanguages.length > 0 ? filteredLanguages : prev.supportedLanguages,
    callerIntakeQuestions:
      updates.callerIntakeQuestions && updates.callerIntakeQuestions.length > 0
        ? updates.callerIntakeQuestions
        : prev.callerIntakeQuestions,
    businessFaqs: serializedFaqs,
    afterHoursBehavior:
      updates.afterHoursBehavior !== undefined
        ? updates.afterHoursBehavior
        : prev.afterHoursBehavior,
    forwardingEnabled:
      updates.forwardingEnabled !== undefined
        ? updates.forwardingEnabled
        : prev.forwardingEnabled,
    forwardingMode:
      updates.forwardingMode !== undefined ? updates.forwardingMode : prev.forwardingMode,
    carrierName: updates.carrierName !== undefined ? updates.carrierName : prev.carrierName,
    onboardingCompleted:
      updates.onboardingCompleted !== undefined
        ? updates.onboardingCompleted
        : prev.onboardingCompleted,
    onboardingStep:
      updates.onboardingStep !== undefined ? updates.onboardingStep : prev.onboardingStep,
  };
}

/**
 * Computes the accurate, non-fabricated phone integration status for a contractor.
 * Never claims a phone number is provisioned if it has not been provisioned.
 */
export function resolvePhoneIntegrationStatus(params: {
  businessPhone?: string | null;
  forwardingEnabled?: boolean;
  twilioSid?: string | null;
  isActiveRoute?: boolean;
  inboundAerisNumber?: string | null;
}): {
  status: PhoneIntegrationStatus;
  assignedAerisNumber: string | null;
  forwardingNumber: string | null;
  twilioProvisioned: boolean;
  twilioSidVerified: boolean;
  statusLabel: string;
  statusDescription: string;
  statusReason: string;
} {
  const envTwilioPhone =
    params.inboundAerisNumber?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim() || null;
  const envTwilioSid = process.env.TWILIO_ACCOUNT_SID?.trim() || null;
  const hasRealTwilioProvisioning = Boolean(
    envTwilioPhone &&
      ((params.twilioSid && params.twilioSid.trim().length > 0 && params.isActiveRoute) ||
        (envTwilioSid && params.isActiveRoute))
  );
  const assignedAerisNumber = hasRealTwilioProvisioning ? envTwilioPhone : null;

  if (!params.businessPhone || params.businessPhone.trim().length === 0) {
    const desc =
      'Enter your primary business phone number in Step 2 to initialize phone routing.';
    return {
      status: 'not_configured',
      assignedAerisNumber: null,
      forwardingNumber: null,
      twilioProvisioned: false,
      twilioSidVerified: false,
      statusLabel: 'Not configured',
      statusDescription: desc,
      statusReason: desc,
    };
  }

  if (hasRealTwilioProvisioning && params.forwardingEnabled) {
    const desc =
      'Your dedicated AERIS inbound line is provisioned and active for PSTN call forwarding.';
    return {
      status: 'connected_and_verified',
      assignedAerisNumber,
      forwardingNumber: params.businessPhone,
      twilioProvisioned: true,
      twilioSidVerified: true,
      statusLabel: 'Connected and verified',
      statusDescription: desc,
      statusReason: desc,
    };
  }

  if (params.forwardingEnabled || hasRealTwilioProvisioning) {
    const desc = hasRealTwilioProvisioning
      ? 'Your AERIS routing number is assigned, but carrier call forwarding has not been verified yet.'
      : 'Your call forwarding preferences are saved. A dedicated AERIS inbound number has not been provisioned on Twilio yet; browser voice & chat receptionist are active.';
    return {
      status: 'configuration_pending',
      assignedAerisNumber,
      forwardingNumber: params.businessPhone,
      twilioProvisioned: hasRealTwilioProvisioning,
      twilioSidVerified: hasRealTwilioProvisioning,
      statusLabel: 'Configuration pending',
      statusDescription: desc,
      statusReason: desc,
    };
  }

  const desc =
    'Your business phone is recorded, but PSTN call forwarding and an assigned AERIS Twilio number are not yet configured.';
  return {
    status: 'setup_required',
    assignedAerisNumber: null,
    forwardingNumber: params.businessPhone,
    twilioProvisioned: false,
    twilioSidVerified: false,
    statusLabel: 'Setup required',
    statusDescription: desc,
    statusReason: desc,
  };
}
