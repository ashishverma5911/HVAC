import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from '@/lib/ai/contractorConfig';

export type TenantResolutionResult =
  | {
      success: true;
      isDemo: true;
      config: ContractorBusinessConfig;
      businessId?: undefined;
      user?: undefined;
    }
  | {
      success: true;
      isDemo: false;
      config: ContractorBusinessConfig;
      businessId: string;
      user: { id: string; email?: string };
    }
  | {
      success: false;
      status: number;
      error: string;
      category: string;
    };

/**
 * Resolves the tenant / business context for incoming server requests.
 *
 * CRITICAL AUTHORIZATION SAFEGUARDS:
 * 1. An explicitly unauthenticated request uses the isolated Summit HVAC demo sandbox.
 * 2. If a user is authenticated via Supabase session, their business_id MUST be resolved
 *    from the database (users.business_id).
 * 3. If an authenticated user has no business_id or the business cannot be found,
 *    this function returns an authorization error (403) and NEVER falls back to demo mode.
 * 4. Client-supplied business_id parameters are NEVER consulted or trusted.
 */
export async function resolveTenantContext(): Promise<TenantResolutionResult> {
  // Check if Supabase is configured in environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase is unconfigured, fall back to demo mode for local development/preflight
    return {
      success: true,
      isDemo: true,
      config: DEFAULT_SUMMIT_HVAC_CONFIG,
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // 1. Unauthenticated Visitor -> Demo Sandbox
    if (authError || !user) {
      return {
        success: true,
        isDemo: true,
        config: DEFAULT_SUMMIT_HVAC_CONFIG,
      };
    }

    // 2. Authenticated User -> MUST have valid business_id
    const { data: member, error: memberError } = await supabase
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      // SAFEGUARD 1: Do NOT fall back to demo mode for authenticated users with missing profile
      return {
        success: false,
        status: 403,
        error: 'User is authenticated but has no associated business profile in the organization.',
        category: 'MISSING_BUSINESS_PROFILE',
      };
    }

    // 3. Load Business Details & Settings
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', member.business_id)
      .maybeSingle();

    if (bizError || !business) {
      return {
        success: false,
        status: 403,
        error: 'The business associated with your user account does not exist or has been removed.',
        category: 'BUSINESS_NOT_FOUND',
      };
    }

    const { data: settings } = await supabase
      .from('business_settings')
      .select('*')
      .eq('business_id', member.business_id)
      .maybeSingle();

    const hours = (settings?.business_hours as Record<string, string>) || {};

    const config: ContractorBusinessConfig = {
      id: business.id,
      name: business.name,
      slug: business.slug,
      phone: business.phone,
      address: business.address || undefined,
      city: business.city || undefined,
      state: business.state || undefined,
      serviceAreas: settings?.service_areas || [],
      supportedZips: settings?.supported_zips || [],
      servicesOffered: settings?.services_offered || [],
      businessHours: {
        weekdays: hours.weekdays || '8:00 AM – 6:00 PM',
        saturday: hours.saturday,
        sunday: hours.sunday,
      },
      emergencyServiceEnabled: settings?.emergency_service_enabled ?? true,
      afterHoursInstructions: settings?.after_hours_instructions || undefined,
      transferPhoneNumber: settings?.transfer_phone_number || business.phone,
      transferInstructions: settings?.transfer_instructions || undefined,
      customGreeting: settings?.custom_greeting || undefined,
    };

    return {
      success: true,
      isDemo: false,
      config,
      businessId: business.id,
      user: { id: user.id, email: user.email },
    };
  } catch (err: unknown) {
    console.error('[TenantResolution] Unexpected error resolving tenant context:', err);
    // On unexpected database connection failures, fail closed if credentials were provided
    return {
      success: false,
      status: 500,
      error: 'Internal authorization error while resolving tenant.',
      category: 'TENANT_RESOLUTION_ERROR',
    };
  }
}
