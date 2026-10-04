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

import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from '../ai/contractorConfig';
import { PILOT_CONFIG } from '../config/pilotConfig';

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
  serviceAreas: PILOT_CONFIG.serviceAreas,
  servicesOffered: PILOT_CONFIG.services,
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: PILOT_CONFIG.emergencyService,
  afterHoursInstructions: PILOT_CONFIG.afterHoursPolicy,
  transferInstructions: PILOT_CONFIG.transferInstructions,
  transferPhoneNumber: PILOT_CONFIG.phone,
};

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
