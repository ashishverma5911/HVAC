import { ContractorIndustry } from '@/lib/supabase/types';

export type SupportedVoiceLanguage = 'en-US' | 'es-US';

export type AfterHoursBehavior =
  | 'emergency_dispatch'
  | 'next_day_callback'
  | 'live_transfer';

export type PhoneIntegrationStatus =
  | 'not_configured'
  | 'setup_required'
  | 'configuration_pending'
  | 'connected_and_verified';

export interface ContractorFaqItem {
  question: string;
  answer: string;
}

export const SUPPORTED_VOICE_LANGUAGES: ReadonlyArray<{
  code: SupportedVoiceLanguage;
  label: string;
  description: string;
}> = [
  {
    code: 'en-US',
    label: 'English (US)',
    description: 'Native US English voice & text receptionist (AERIS Native Audio)',
  },
  {
    code: 'es-US',
    label: 'Spanish (US)',
    description: 'Bilingual US Spanish caller intake & emergency triage support',
  },
] as const;

export const US_CONTRACTOR_TIMEZONES: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: 'America/New_York', label: 'Eastern Time (ET — New York, Atlanta, Miami)' },
  { value: 'America/Chicago', label: 'Central Time (CT — Dallas, Houston, Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (MT — Denver, Salt Lake City)' },
  { value: 'America/Phoenix', label: 'Mountain Standard Time (MST — Phoenix, No DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT — Los Angeles, Seattle)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT — Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST — Honolulu)' },
] as const;

export const DEFAULT_CALLER_INTAKE_QUESTIONS: string[] = [
  'What is your full name and best callback phone number?',
  'What is the street address and city where service is needed?',
  'What issue are you experiencing with your heating or cooling system?',
  'How urgent is the issue (normal, urgent, or safety emergency)?',
  'Do you have a preferred day or time window for a technician visit?',
];

export const DEFAULT_APPOINTMENT_REQUEST_RULES =
  'Service area eligibility and required lead intake details (customer name, phone, street address, service type, and reported issue) must be verified before requesting an appointment. All scheduled windows are recorded strictly as an appointment REQUEST ("requested" status, never "confirmed") until a human dispatcher reviews the route and confirms with the customer.';

export const DEFAULT_CONVERSATION_PREFERENCES =
  'Greet the caller warmly, keep responses concise (1 to 3 sentences per turn), ask one or two intake questions at a time, and handle unclear audio, silence, or interruptions politely without repeating previous questions.';

export const DEFAULT_BUSINESS_FAQS: ContractorFaqItem[] = [
  {
    question: 'Do you service both residential and light commercial HVAC systems?',
    answer:
      'Yes, our certified technicians service residential homes and light commercial properties within our configured service areas.',
  },
  {
    question: 'How does appointment scheduling work?',
    answer:
      'I can check our open arrival windows and submit an appointment request for your preferred time. Our dispatch team will then review the technician route and contact you to confirm.',
  },
  {
    question: 'What happens if my system breaks down after regular business hours?',
    answer:
      'We follow our configured after-hours protocol—urgent heating or cooling emergencies can be escalated to our on-call team, while routine maintenance requests are scheduled for the next business day.',
  },
];

export interface ContractorBusinessHours {
  weekdays: string;
  saturday?: string;
  sunday?: string;
}

export interface ContractorBusinessConfig {
  id: string;
  name: string;
  slug: string;
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
  businessHours: ContractorBusinessHours;
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
  phoneSetupStatus?: PhoneIntegrationStatus;
  assignedAerisNumber?: string | null;
}

/**
 * Default reference configuration for the anonymous Summit HVAC demonstration sandbox.
 * Used exclusively for unauthenticated demo visitors on the landing page simulator.
 */
export const DEFAULT_SUMMIT_HVAC_CONFIG: ContractorBusinessConfig = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Summit HVAC',
  slug: 'summit-hvac',
  industry: 'hvac',
  phone: '(214) 555-0100',
  businessEmail: 'dispatch@summithvac-demo.com',
  website: 'https://summithvac-demo.com',
  address: '1000 Main Street',
  city: 'Dallas',
  state: 'TX',
  postalCode: '75201',
  timezone: 'America/Chicago',
  serviceAreas: ['Dallas', 'Plano', 'Irving', 'Garland', 'Richardson', 'Carrollton'],
  supportedZips: [
    '75001',
    '75023',
    '75024',
    '75025',
    '75075',
    '75080',
    '75081',
    '75082',
    '75201',
    '75202',
    '75204',
    '75205',
  ],
  servicesOffered: [
    'AC Repair',
    'AC Installation',
    'Heating & Furnace Repair',
    'HVAC Seasonal Maintenance & Tune-ups',
    '24/7 Emergency Service',
  ],
  businessHours: {
    weekdays: '8:00 AM – 6:00 PM',
    saturday: 'On-Call Emergency',
    sunday: 'On-Call Emergency',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'emergency_dispatch',
  afterHoursInstructions:
    'Immediate dispatch for emergency cooling, heating loss, or gas/safety hazards.',
  callbackInstructions:
    'Have our on-call dispatcher call the customer back within 15 minutes for urgent issues or first thing next business morning for routine inquiries.',
  appointmentRequestRules: DEFAULT_APPOINTMENT_REQUEST_RULES,
  transferPhoneNumber: '(214) 555-0199',
  transferInstructions:
    'Transfer to human dispatcher on duty when safety hazard is detected or customer requests manager.',
  customGreeting:
    "Hi, you've reached Summit HVAC. I'm AERIS, your AI receptionist. How can I help you today?",
  pronunciationGuide: 'Summit H-V-A-C',
  conversationPreferences: DEFAULT_CONVERSATION_PREFERENCES,
  supportedLanguages: ['en-US'],
  callerIntakeQuestions: DEFAULT_CALLER_INTAKE_QUESTIONS,
  businessFaqs: DEFAULT_BUSINESS_FAQS,
  phoneSetupStatus: 'not_configured',
  assignedAerisNumber: null,
};

export interface ContractorConfigValidationResult {
  valid: boolean;
  reason?: string;
  errors: string[];
  config: ContractorBusinessConfig | null;
  normalizedConfig: ContractorBusinessConfig | null;
}

/**
 * Validates and normalizes a contractor configuration before starting an AI receptionist session.
 * Rejects missing, null, or malformed configurations (e.g. missing id or business name)
 * while safely normalizing optional arrays/objects.
 */
export function validateContractorConfiguration(
  rawConfig: unknown
): ContractorConfigValidationResult {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return {
      valid: false,
      reason: 'INVALID_CONTRACTOR_CONFIGURATION',
      errors: ['Contractor configuration object is missing or invalid.'],
      config: null,
      normalizedConfig: null,
    };
  }

  const candidate = rawConfig as Partial<ContractorBusinessConfig> & {
    invalidConfiguration?: boolean;
  };
  const errors: string[] = [];

  if (candidate.invalidConfiguration === true) {
    errors.push('Contractor configuration is marked invalid.');
  }

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';

  if (!id) {
    errors.push('Missing required contractor id.');
  }
  if (!name) {
    errors.push('Missing required contractor business name.');
  }
  if (
    candidate.businessHours !== undefined &&
    (candidate.businessHours === null ||
      typeof candidate.businessHours !== 'object' ||
      typeof candidate.businessHours.weekdays !== 'string' ||
      !candidate.businessHours.weekdays.trim())
  ) {
    errors.push('Invalid contractor businessHours configuration.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      reason: 'INVALID_CONTRACTOR_CONFIGURATION',
      errors,
      config: null,
      normalizedConfig: null,
    };
  }

  const normalizedConfig: ContractorBusinessConfig = {
    ...DEFAULT_SUMMIT_HVAC_CONFIG,
    ...candidate,
    id,
    name,
    slug:
      typeof candidate.slug === 'string' && candidate.slug.trim()
        ? candidate.slug.trim()
        : id.toLowerCase(),
    phone: typeof candidate.phone === 'string' ? candidate.phone.trim() : '',
    serviceAreas: Array.isArray(candidate.serviceAreas)
      ? candidate.serviceAreas.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    servicesOffered: Array.isArray(candidate.servicesOffered)
      ? candidate.servicesOffered.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    businessHours:
      candidate.businessHours &&
      typeof candidate.businessHours === 'object' &&
      typeof candidate.businessHours.weekdays === 'string' &&
      candidate.businessHours.weekdays.trim()
        ? candidate.businessHours
        : { weekdays: '8:00 AM - 6:00 PM' },
    emergencyServiceEnabled:
      typeof candidate.emergencyServiceEnabled === 'boolean'
        ? candidate.emergencyServiceEnabled
        : true,
  };

  return {
    valid: true,
    errors: [],
    config: normalizedConfig,
    normalizedConfig,
  };
}

