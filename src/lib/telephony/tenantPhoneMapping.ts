/**
 * Server-controlled Tenant Phone Mapping for Twilio PSTN integration.
 * 
 * Strict Security Rules:
 * 1. The business context is resolved exclusively from the incoming phone number (calledPhone/To)
 *    and server-side environment configuration.
 * 2. Caller, LLM, or client-supplied business_id is NEVER trusted or consulted.
 * 3. For the pilot phase, maps the configured Twilio number to the verified pilot contractor
 *    (ABC Cooling & Heating).
 */

import {
  ContractorBusinessConfig,
  DEFAULT_APPOINTMENT_REQUEST_RULES,
  DEFAULT_BUSINESS_FAQS,
  DEFAULT_CONVERSATION_PREFERENCES,
  DEFAULT_SUMMIT_HVAC_CONFIG,
} from '../ai/contractorConfig';
import { PILOT_CONFIG } from '../config/pilotConfig';
import { createAdminClient } from '../supabase/admin';
import { ContractorRow } from '../supabase/types';
import { extractExtendedSettingsMetadata } from '../services/contractorConfigMapper';
import { stripUntrustedTenantIds } from '../validation/tenantSanitizer';

export interface ResolvedTelephonyTenant {
  businessId: string;
  businessConfig: ContractorBusinessConfig;
  isPilot: boolean;
}

/**
 * Standard reference configuration for the ABC Cooling & Heating pilot account.
 */
export const PILOT_CONTRACTOR_CONFIG: ContractorBusinessConfig = {
  id: process.env.PILOT_BUSINESS_ID || 'pilot-abc-cooling',
  name: PILOT_CONFIG.name,
  slug: PILOT_CONFIG.slug,
  phone: PILOT_CONFIG.phone,
  address: `${PILOT_CONFIG.address}, ${PILOT_CONFIG.city}, ${PILOT_CONFIG.state} ${PILOT_CONFIG.postalCode}`,
  city: PILOT_CONFIG.city,
  state: PILOT_CONFIG.state,
  postalCode: PILOT_CONFIG.postalCode,
  timezone: 'America/Chicago',
  serviceAreas: PILOT_CONFIG.serviceAreas,
  servicesOffered: PILOT_CONFIG.services,
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: PILOT_CONFIG.emergencyService,
  afterHoursBehavior: 'emergency_dispatch',
  afterHoursInstructions: PILOT_CONFIG.afterHoursPolicy,
  callbackInstructions: PILOT_CONFIG.transferInstructions,
  appointmentRequestRules: DEFAULT_APPOINTMENT_REQUEST_RULES,
  transferInstructions: PILOT_CONFIG.transferInstructions,
  transferPhoneNumber: PILOT_CONFIG.phone,
  customGreeting: `Hi, thanks for calling ${PILOT_CONFIG.name}! This is AERIS, our AI receptionist. How can I help with your heating or cooling today?`,
  conversationPreferences: DEFAULT_CONVERSATION_PREFERENCES,
  supportedLanguages: ['en-US', 'es-US'],
  businessFaqs: DEFAULT_BUSINESS_FAQS,
};

/**
 * Deterministically routes an inbound phone call to the matching contractor configuration
 * based strictly on server-verified phone routing records, ignoring any caller-supplied
 * tenant IDs or configuration overrides.
 */
export function resolveTelephonyContractorByPhone(
  calledPhone: string | null | undefined,
  phoneRoutes: Array<{ phoneNumber: string; isActive: boolean; config: ContractorBusinessConfig }>,
  untrustedCallerPayload?: Record<string, unknown>
): ResolvedTelephonyTenant | null {
  if (untrustedCallerPayload) {
    stripUntrustedTenantIds(untrustedCallerPayload);
  }

  const normalizedCalled = calledPhone ? calledPhone.replace(/\D/g, '').slice(-10) : '';
  if (normalizedCalled.length !== 10) {
    return null;
  }

  const matched = phoneRoutes.find(
    (route) => route.isActive && route.phoneNumber.replace(/\D/g, '').slice(-10) === normalizedCalled
  );

  if (!matched) {
    return null;
  }

  return {
    businessId: matched.config.id,
    businessConfig: matched.config,
    isPilot: matched.config.slug === PILOT_CONFIG.slug,
  };
}

/**
 * Resolves the contractor business context for an incoming PSTN telephone call.
 * 
 * @param calledPhone - The destination E.164 phone number received from Twilio (e.g. "+19725550199")
 */
export function resolveTelephonyTenant(calledPhone?: string | null): ResolvedTelephonyTenant {
  const configuredTwilioNumber = process.env.TWILIO_PHONE_NUMBER?.trim() || '';
  const normalizedCalled = calledPhone ? calledPhone.replace(/\D/g, '') : '';
  const normalizedConfigured = configuredTwilioNumber.replace(/\D/g, '');

  // If the called number matches the configured Twilio number or in pilot mode,
  // map directly to ABC Cooling & Heating
  if (
    normalizedConfigured &&
    normalizedCalled &&
    (normalizedCalled === normalizedConfigured || normalizedCalled.endsWith(normalizedConfigured.slice(-10)))
  ) {
    return {
      businessId: PILOT_CONTRACTOR_CONFIG.id,
      businessConfig: PILOT_CONTRACTOR_CONFIG,
      isPilot: true,
    };
  }

  // Default pilot fallback when TWILIO_PHONE_NUMBER is configured or during pilot testing
  if (process.env.PILOT_BUSINESS_ID || process.env.NODE_ENV !== 'production' || !normalizedConfigured) {
    return {
      businessId: PILOT_CONTRACTOR_CONFIG.id,
      businessConfig: PILOT_CONTRACTOR_CONFIG,
      isPilot: true,
    };
  }

  // Fallback to Summit HVAC reference config if unmatched
  return {
    businessId: DEFAULT_SUMMIT_HVAC_CONFIG.id,
    businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
    isPilot: false,
  };
}

export type InboundDestinationRouteSource =
  | 'phone_numbers_table'
  | 'business_phone_column'
  | 'configured_twilio_number'
  | 'registered_route';

export type InboundDestinationResolution =
  | {
      matched: true;
      destinationPhone: string;
      normalizedDigits: string;
      businessId: string;
      businessConfig: ContractorBusinessConfig;
      isPilot: boolean;
      routeSource: InboundDestinationRouteSource;
    }
  | {
      matched: false;
      destinationPhone: string;
      normalizedDigits: string;
      reason:
        | 'MISSING_DESTINATION_NUMBER'
        | 'INVALID_DESTINATION_NUMBER'
        | 'UNASSIGNED_DESTINATION_NUMBER';
    };

export interface ProvisionedPhoneRouteEntry {
  phoneNumber: string;
  normalizedDigits: string;
  twilioSid?: string | null;
  label?: string;
  isActive: boolean;
  config: ContractorBusinessConfig;
}

const registeredDestinationRoutes = new Map<string, ProvisionedPhoneRouteEntry>();

/**
 * Normalizes a US phone number (E.164 or formatted) into its 10-digit subscriber number.
 * Returns empty string if the input does not contain at least 10 digits.
 */
export function normalizeUsPhoneDigits(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return '';
}

/**
 * Formats a 10-digit or E.164 US phone number into canonical E.164 (+1XXXXXXXXXX).
 */
export function formatE164UsPhone(phone?: string | null): string | null {
  const digits = normalizeUsPhoneDigits(phone);
  if (digits.length !== 10) {
    return null;
  }
  return `+1${digits}`;
}

/**
 * Registers or updates an active provisioned destination route in the runtime routing table.
 * Enforces uniqueness across contractors: an active destination number cannot be claimed
 * by a different contractor without explicitly deactivating/re-assigning.
 */
export function registerProvisionedDestinationRoute(entry: {
  phoneNumber: string;
  twilioSid?: string | null;
  label?: string;
  isActive?: boolean;
  config: ContractorBusinessConfig;
}): ProvisionedPhoneRouteEntry {
  const normalizedDigits = normalizeUsPhoneDigits(entry.phoneNumber);
  if (normalizedDigits.length !== 10) {
    throw new Error(`Invalid destination phone number: ${entry.phoneNumber}`);
  }
  const existing = registeredDestinationRoutes.get(normalizedDigits);
  if (existing && existing.isActive && existing.config.id !== entry.config.id) {
    throw new Error(
      `Destination number ${entry.phoneNumber} is already assigned to another contractor.`
    );
  }
  const record: ProvisionedPhoneRouteEntry = {
    phoneNumber: formatE164UsPhone(entry.phoneNumber) || entry.phoneNumber,
    normalizedDigits,
    twilioSid: entry.twilioSid ?? null,
    label: entry.label || 'aeris_destination',
    isActive: entry.isActive ?? true,
    config: entry.config,
  };
  registeredDestinationRoutes.set(normalizedDigits, record);
  return record;
}

export function clearRegisteredDestinationRoutes(): void {
  registeredDestinationRoutes.clear();
}

export function listRegisteredDestinationRoutes(businessId?: string): ProvisionedPhoneRouteEntry[] {
  const all = Array.from(registeredDestinationRoutes.values());
  if (!businessId) return all;
  return all.filter((r) => r.config.id === businessId);
}

function buildLiveContractorConfigFromRow(
  matchedBusiness: ContractorRow,
  settings:
    | {
        business_hours?: unknown;
        industry_config?: unknown;
        service_areas?: string[] | null;
        supported_zips?: string[] | null;
        services_offered?: string[] | null;
        emergency_service_enabled?: boolean | null;
        after_hours_instructions?: string | null;
        transfer_instructions?: string | null;
        transfer_phone_number?: string | null;
        custom_greeting?: string | null;
      }
    | null
    | undefined,
  fallbackConfig: ContractorBusinessConfig = PILOT_CONTRACTOR_CONFIG
): ContractorBusinessConfig {
  const ext = extractExtendedSettingsMetadata(
    settings?.business_hours,
    settings?.industry_config,
    matchedBusiness.timezone
  );

  return {
    id: matchedBusiness.id,
    name: matchedBusiness.name,
    slug: matchedBusiness.slug,
    industry: matchedBusiness.industry || 'hvac',
    phone: matchedBusiness.phone,
    businessEmail: ext.businessEmail || undefined,
    website: ext.website || undefined,
    address: [
      matchedBusiness.address,
      matchedBusiness.city,
      matchedBusiness.state,
      matchedBusiness.postal_code,
    ]
      .filter(Boolean)
      .join(', '),
    city: matchedBusiness.city || fallbackConfig.city,
    state: matchedBusiness.state || fallbackConfig.state,
    postalCode: matchedBusiness.postal_code || fallbackConfig.postalCode,
    timezone: ext.timezone || fallbackConfig.timezone,
    serviceAreas:
      Array.isArray(settings?.service_areas) && settings.service_areas.length > 0
        ? settings.service_areas
        : fallbackConfig.serviceAreas,
    supportedZips: Array.isArray(settings?.supported_zips) ? settings.supported_zips : [],
    servicesOffered:
      Array.isArray(settings?.services_offered) && settings.services_offered.length > 0
        ? settings.services_offered
        : fallbackConfig.servicesOffered,
    businessHours: {
      weekdays: ext.weekdays || fallbackConfig.businessHours.weekdays,
      saturday: ext.saturday || fallbackConfig.businessHours.saturday,
      sunday: ext.sunday || fallbackConfig.businessHours.sunday,
    },
    emergencyServiceEnabled:
      settings?.emergency_service_enabled ?? fallbackConfig.emergencyServiceEnabled,
    afterHoursBehavior: ext.afterHoursBehavior || fallbackConfig.afterHoursBehavior,
    afterHoursInstructions:
      settings?.after_hours_instructions || fallbackConfig.afterHoursInstructions,
    callbackInstructions:
      ext.callbackInstructions ||
      settings?.transfer_instructions ||
      fallbackConfig.callbackInstructions,
    appointmentRequestRules:
      ext.appointmentRequestRules || fallbackConfig.appointmentRequestRules,
    transferPhoneNumber: settings?.transfer_phone_number || matchedBusiness.phone,
    transferInstructions:
      settings?.transfer_instructions || fallbackConfig.transferInstructions,
    customGreeting: settings?.custom_greeting || undefined,
    pronunciationGuide: ext.pronunciationGuide || undefined,
    conversationPreferences: ext.conversationPreferences || undefined,
    supportedLanguages: ext.supportedLanguages,
    callerIntakeQuestions: ext.callerIntakeQuestions,
    businessFaqs: ext.businessFaqs,
  };
}

/**
 * Strictly resolves an inbound destination phone number (from trusted Twilio `To` / `Called`)
 * to the assigned contractor configuration.
 *
 * Security invariants:
 * - Strips and ignores any untrusted client/caller-supplied `businessId` or `contractorId`.
 * - Rejects missing, malformed, or unassigned destination numbers (`matched: false`).
 */
export function resolveInboundDestinationRoute(
  calledPhone: string | null | undefined,
  options?: {
    routes?: Array<{ phoneNumber: string; isActive: boolean; config: ContractorBusinessConfig }>;
    untrustedPayload?: Record<string, unknown>;
    allowPilotDefaultNumber?: boolean;
  }
): InboundDestinationResolution {
  if (options?.untrustedPayload) {
    stripUntrustedTenantIds(options.untrustedPayload);
  }

  const rawDestination = (calledPhone ?? '').trim();
  if (!rawDestination) {
    return {
      matched: false,
      destinationPhone: '',
      normalizedDigits: '',
      reason: 'MISSING_DESTINATION_NUMBER',
    };
  }

  const normalizedDigits = normalizeUsPhoneDigits(rawDestination);
  if (normalizedDigits.length !== 10) {
    return {
      matched: false,
      destinationPhone: rawDestination,
      normalizedDigits,
      reason: 'INVALID_DESTINATION_NUMBER',
    };
  }

  // 1. Check explicit route overrides if provided
  if (options?.routes && options.routes.length > 0) {
    const matchedExplicit = options.routes.find(
      (r) => r.isActive && normalizeUsPhoneDigits(r.phoneNumber) === normalizedDigits
    );
    if (matchedExplicit) {
      return {
        matched: true,
        destinationPhone: rawDestination,
        normalizedDigits,
        businessId: matchedExplicit.config.id,
        businessConfig: matchedExplicit.config,
        isPilot: matchedExplicit.config.slug === PILOT_CONFIG.slug,
        routeSource: 'registered_route',
      };
    }
    // When an explicit route table is passed (e.g. strict multi-tenant routing table), do not fall through to unrelated defaults
    return {
      matched: false,
      destinationPhone: rawDestination,
      normalizedDigits,
      reason: 'UNASSIGNED_DESTINATION_NUMBER',
    };
  }

  // 2. Check runtime registered destination routes
  const registered = registeredDestinationRoutes.get(normalizedDigits);
  if (registered && registered.isActive) {
    return {
      matched: true,
      destinationPhone: rawDestination,
      normalizedDigits,
      businessId: registered.config.id,
      businessConfig: registered.config,
      isPilot: registered.config.slug === PILOT_CONFIG.slug,
      routeSource: 'registered_route',
    };
  }

  // 3. Check configured TWILIO_PHONE_NUMBER environment variable
  const configuredTwilioDigits = normalizeUsPhoneDigits(process.env.TWILIO_PHONE_NUMBER);
  if (configuredTwilioDigits.length === 10 && normalizedDigits === configuredTwilioDigits) {
    return {
      matched: true,
      destinationPhone: rawDestination,
      normalizedDigits,
      businessId: PILOT_CONTRACTOR_CONFIG.id,
      businessConfig: PILOT_CONTRACTOR_CONFIG,
      isPilot: true,
      routeSource: 'configured_twilio_number',
    };
  }

  // 4. Check known pilot / reference contractor phone numbers when allowed
  if (options?.allowPilotDefaultNumber !== false) {
    const pilotDigits = normalizeUsPhoneDigits(PILOT_CONFIG.phone);
    if (pilotDigits.length === 10 && normalizedDigits === pilotDigits) {
      return {
        matched: true,
        destinationPhone: rawDestination,
        normalizedDigits,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        isPilot: true,
        routeSource: 'business_phone_column',
      };
    }

    const summitDigits = normalizeUsPhoneDigits(DEFAULT_SUMMIT_HVAC_CONFIG.phone);
    if (summitDigits.length === 10 && normalizedDigits === summitDigits) {
      return {
        matched: true,
        destinationPhone: rawDestination,
        normalizedDigits,
        businessId: DEFAULT_SUMMIT_HVAC_CONFIG.id,
        businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
        isPilot: false,
        routeSource: 'business_phone_column',
      };
    }
  }

  return {
    matched: false,
    destinationPhone: rawDestination,
    normalizedDigits,
    reason: 'UNASSIGNED_DESTINATION_NUMBER',
  };
}

/**
 * Asynchronously resolves an inbound destination phone number against Supabase
 * (`phone_numbers` and `businesses` + `business_settings`) as well as registered routes.
 * Unknown/unassigned numbers return `{ matched: false, reason: 'UNASSIGNED_DESTINATION_NUMBER' }`.
 */
export async function resolveInboundDestinationRouteAsync(
  calledPhone: string | null | undefined,
  options?: {
    routes?: Array<{ phoneNumber: string; isActive: boolean; config: ContractorBusinessConfig }>;
    untrustedPayload?: Record<string, unknown>;
    allowPilotDefaultNumber?: boolean;
  }
): Promise<InboundDestinationResolution> {
  if (options?.untrustedPayload) {
    stripUntrustedTenantIds(options.untrustedPayload);
  }

  const rawDestination = (calledPhone ?? '').trim();
  if (!rawDestination) {
    return {
      matched: false,
      destinationPhone: '',
      normalizedDigits: '',
      reason: 'MISSING_DESTINATION_NUMBER',
    };
  }

  const normalizedDigits = normalizeUsPhoneDigits(rawDestination);
  if (normalizedDigits.length !== 10) {
    return {
      matched: false,
      destinationPhone: rawDestination,
      normalizedDigits,
      reason: 'INVALID_DESTINATION_NUMBER',
    };
  }

  // 1. If explicit routes or registered runtime routes match, resolve immediately
  if (options?.routes && options.routes.length > 0) {
    return resolveInboundDestinationRoute(calledPhone, options);
  }

  const registered = registeredDestinationRoutes.get(normalizedDigits);
  if (registered && registered.isActive) {
    return {
      matched: true,
      destinationPhone: rawDestination,
      normalizedDigits,
      businessId: registered.config.id,
      businessConfig: registered.config,
      isPilot: registered.config.slug === PILOT_CONFIG.slug,
      routeSource: 'registered_route',
    };
  }

  // 2. Check Supabase phone_numbers and businesses tables when configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      let matchedBusiness: ContractorRow | null = null;
      let routeSource: InboundDestinationRouteSource = 'phone_numbers_table';

      try {
        const { data: phoneRow } = await admin
          .from('phone_numbers')
          .select('business_id')
          .eq('normalized_digits', normalizedDigits)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (phoneRow?.business_id) {
          const { data: bizByPhoneTable } = await admin
            .from('businesses')
            .select('*')
            .eq('id', phoneRow.business_id)
            .maybeSingle();
          if (bizByPhoneTable) {
            matchedBusiness = bizByPhoneTable;
            routeSource = 'phone_numbers_table';
          }
        }
      } catch {
        // Fallback if phone_numbers table is not migrated
      }

      if (!matchedBusiness) {
        const { data: businesses } = await admin.from('businesses').select('*');
        if (businesses && businesses.length > 0) {
          const matchedByPhone =
            businesses.find(
              (b) =>
                typeof b.phone === 'string' &&
                normalizeUsPhoneDigits(b.phone) === normalizedDigits
            ) || null;
          if (matchedByPhone) {
            matchedBusiness = matchedByPhone;
            routeSource = 'business_phone_column';
          }
        }
      }

      if (matchedBusiness) {
        const { data: settings } = await admin
          .from('business_settings')
          .select('*')
          .eq('business_id', matchedBusiness.id)
          .maybeSingle();

        const liveConfig = buildLiveContractorConfigFromRow(matchedBusiness, settings);
        return {
          matched: true,
          destinationPhone: rawDestination,
          normalizedDigits,
          businessId: matchedBusiness.id,
          businessConfig: liveConfig,
          isPilot: matchedBusiness.slug === PILOT_CONFIG.slug,
          routeSource,
        };
      }
    } catch (err) {
      console.warn('[TenantPhoneMapping] Supabase destination lookup failed, checking local routes:', err);
    }
  }

  // 3. Fall back to synchronous route resolution (configured TWILIO_PHONE_NUMBER or pilot number)
  return resolveInboundDestinationRoute(calledPhone, options);
}

/**
 * Asynchronously resolves the contractor business context from Supabase by matching the called phone number
 * or pilot business record, falling back cleanly to resolveTelephonyTenant(calledPhone).
 */
export async function resolveTelephonyTenantAsync(calledPhone?: string | null): Promise<ResolvedTelephonyTenant> {
  const strictRes = await resolveInboundDestinationRouteAsync(calledPhone);
  if (strictRes.matched) {
    return {
      businessId: strictRes.businessId,
      businessConfig: strictRes.businessConfig,
      isPilot: strictRes.isPilot,
    };
  }

  const fallback = resolveTelephonyTenant(calledPhone);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallback;
  }

  try {
    const admin = createAdminClient();
    if (fallback.isPilot) {
      const { data: pilotBiz } = await admin
        .from('businesses')
        .select('*')
        .eq('slug', PILOT_CONFIG.slug)
        .maybeSingle();

      if (pilotBiz) {
        const { data: settings } = await admin
          .from('business_settings')
          .select('*')
          .eq('business_id', pilotBiz.id)
          .maybeSingle();

        return {
          businessId: pilotBiz.id,
          businessConfig: buildLiveContractorConfigFromRow(pilotBiz, settings, fallback.businessConfig),
          isPilot: true,
        };
      }
    }
    return fallback;
  } catch (err) {
    console.warn('[TenantPhoneMapping] Supabase lookup failed, using fallback config:', err);
    return fallback;
  }
}

