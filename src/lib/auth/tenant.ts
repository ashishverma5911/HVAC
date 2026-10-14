import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from '@/lib/ai/contractorConfig';
import { normalizeIndustry } from '@/lib/ai/industryTemplates';
import { UserRole } from '@/lib/supabase/types';
import { extractExtendedSettingsMetadata } from '@/lib/services/contractorConfigMapper';

export type TenantResolutionResult =
  | {
      success: true;
      isDemo: true;
      config: ContractorBusinessConfig;
      businessId?: undefined;
      contractorId?: undefined;
      user?: undefined;
      role?: undefined;
    }
  | {
      success: true;
      isDemo: false;
      config: ContractorBusinessConfig;
      businessId: string;
      contractorId: string;
      user: { id: string; email?: string };
      role: UserRole;
    }
  | {
      success: false;
      status: number;
      error: string;
      category: string;
    };

export type ContractorAuthResult =
  | {
      authorized: true;
      businessId: string;
      contractorId: string;
      userId: string;
      email: string;
      role: UserRole;
    }
  | {
      authorized: false;
      status: 401 | 403 | 500 | 503;
      code:
        | 'UNCONFIGURED'
        | 'UNAUTHENTICATED'
        | 'MISSING_BUSINESS_PROFILE'
        | 'BUSINESS_NOT_FOUND'
        | 'INSUFFICIENT_ROLE'
        | 'INTERNAL_ERROR';
      error: string;
    };

import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';

export { stripUntrustedTenantIds };

const VALID_ROLES: Set<UserRole> = new Set([
  'owner',
  'admin',
  'dispatcher',
  'technician',
  'viewer',
]);

/**
 * Deterministically evaluates whether a contractor member role satisfies the required roles
 * for a sensitive operation (e.g. owner/admin for settings or phone setup, owner/admin/dispatcher for lead/call mutations).
 */
export function evaluateContractorRolePermission(
  memberRole: string | undefined | null,
  allowedRoles?: UserRole[]
): { allowed: true; role: UserRole } | { allowed: false; status: 403; code: 'INSUFFICIENT_ROLE'; error: string } {
  const normalizedRole: UserRole =
    memberRole && VALID_ROLES.has(memberRole as UserRole)
      ? (memberRole as UserRole)
      : 'viewer';

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) {
    return {
      allowed: false,
      status: 403,
      code: 'INSUFFICIENT_ROLE',
      error: `Forbidden: Role "${normalizedRole}" does not have permission for this operation. Required: ${allowedRoles.join(', ')}.`,
    };
  }

  return {
    allowed: true,
    role: normalizedRole,
  };
}

/**
 * Sanitizes an untrusted redirect query parameter to prevent open-redirect vulnerabilities.
 * Only permits internal paths starting with a single '/' and matching known application routes.
 */
export function sanitizeInternalRedirectPath(
  rawRedirect: string | null | undefined,
  fallback: string = '/dashboard'
): string {
  if (!rawRedirect || typeof rawRedirect !== 'string') {
    return fallback;
  }
  const trimmed = rawRedirect.trim();
  // Reject protocol-relative ('//...'), backslash ('/\...'), or absolute URLs ('http://...', 'javascript:...')
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)
  ) {
    return fallback;
  }

  if (trimmed === '/' || trimmed.startsWith('/?')) {
    return trimmed;
  }

  const allowedPrefixes = ['/dashboard', '/leads', '/settings', '/onboarding'];
  const matchesAllowed = allowedPrefixes.some(
    (prefix) =>
      trimmed === prefix ||
      trimmed.startsWith(`${prefix}/`) ||
      trimmed.startsWith(`${prefix}?`)
  );

  return matchesAllowed ? trimmed : fallback;
}

/**
 * Resolves the authenticated user's contractor membership (`business_id` and `role`)
 * from `public.users` or `public.contractor_members`.
 */
async function resolveUserMembership(
  client: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ businessId: string; role: UserRole } | null> {
  const { data: userRow } = await client
    .from('users')
    .select('business_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (userRow && userRow.business_id) {
    return {
      businessId: userRow.business_id,
      role: (userRow.role as UserRole) || 'owner',
    };
  }

  try {
    const { data: memberRow } = await client
      .from('contractor_members')
      .select('business_id, role')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memberRow && memberRow.business_id) {
      return {
        businessId: memberRow.business_id,
        role: (memberRow.role as UserRole) || 'owner',
      };
    }
  } catch {
    // Fallback gracefully if contractor_members table migration hasn't been applied yet
  }

  return null;
}

/**
 * Authoritative server-side guard for contractor-only API endpoints (`/api/contractor/*`).
 * Strictly validates the Supabase Auth session, resolves the contractor's verified `business_id`,
 * and optionally enforces role-based access control (`allowedRoles`).
 */
export async function requireContractorAuth(
  allowedRoles?: UserRole[]
): Promise<ContractorAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      authorized: false,
      status: 503,
      code: 'UNCONFIGURED',
      error: 'Supabase environment is not configured.',
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        authorized: false,
        status: 401,
        code: 'UNAUTHENTICATED',
        error: 'Authentication required to access contractor resources.',
      };
    }

    const admin = createAdminClient();
    const membership = await resolveUserMembership(admin, user.id);

    if (!membership || !membership.businessId) {
      return {
        authorized: false,
        status: 403,
        code: 'MISSING_BUSINESS_PROFILE',
        error: 'User is authenticated but has no associated business profile.',
      };
    }

    // Verify that the business record actually exists in `businesses`
    const { data: businessRow } = await admin
      .from('businesses')
      .select('id')
      .eq('id', membership.businessId)
      .maybeSingle();

    if (!businessRow) {
      return {
        authorized: false,
        status: 403,
        code: 'BUSINESS_NOT_FOUND',
        error: 'The contractor organization associated with this account does not exist.',
      };
    }

    const roleCheck = evaluateContractorRolePermission(membership.role, allowedRoles);
    if (!roleCheck.allowed) {
      return {
        authorized: false,
        status: roleCheck.status,
        code: roleCheck.code,
        error: roleCheck.error,
      };
    }

    return {
      authorized: true,
      businessId: membership.businessId,
      contractorId: membership.businessId,
      userId: user.id,
      email: user.email || '',
      role: roleCheck.role,
    };
  } catch (err) {
    console.error('[ContractorAuth] Unexpected authorization error:', err);
    return {
      authorized: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      error: 'Internal authorization error while verifying contractor access.',
    };
  }
}

/**
 * Resolves the tenant / business context for incoming server requests (chat, voice token, tools).
 *
 * CRITICAL AUTHORIZATION SAFEGUARDS:
 * 1. An explicitly unauthenticated request uses the isolated Summit HVAC demo sandbox.
 * 2. If a user is authenticated via Supabase session, their business_id MUST be resolved
 *    from the database (users.business_id or contractor_members.business_id).
 * 3. If an authenticated user has no business_id or the business cannot be found,
 *    this function returns an authorization error (403) and NEVER falls back to demo mode.
 * 4. Client-supplied business_id parameters are NEVER consulted or trusted.
 */
export async function resolveTenantContext(): Promise<TenantResolutionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
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

    // 2. Authenticated User -> MUST have valid business_id in users or contractor_members
    const membership = await resolveUserMembership(supabase, user.id);

    if (!membership || !membership.businessId) {
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
      .eq('id', membership.businessId)
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
      .eq('business_id', membership.businessId)
      .maybeSingle();

    const ext = extractExtendedSettingsMetadata(
      settings?.business_hours,
      settings?.industry_config,
      business.timezone
    );

    const config: ContractorBusinessConfig = {
      id: business.id,
      name: business.name,
      slug: business.slug,
      industry: normalizeIndustry(business.industry),
      phone: business.phone,
      businessEmail: ext.businessEmail || undefined,
      website: ext.website || undefined,
      address: business.address || undefined,
      city: business.city || undefined,
      state: business.state || undefined,
      postalCode: business.postal_code || undefined,
      timezone: ext.timezone,
      serviceAreas: settings?.service_areas || [],
      supportedZips: settings?.supported_zips || [],
      servicesOffered: settings?.services_offered || [],
      businessHours: {
        weekdays: ext.weekdays,
        saturday: ext.saturday || undefined,
        sunday: ext.sunday || undefined,
      },
      emergencyServiceEnabled: settings?.emergency_service_enabled ?? true,
      afterHoursBehavior: ext.afterHoursBehavior,
      afterHoursInstructions: settings?.after_hours_instructions || undefined,
      callbackInstructions: ext.callbackInstructions || settings?.transfer_instructions || undefined,
      appointmentRequestRules: ext.appointmentRequestRules || undefined,
      transferPhoneNumber: settings?.transfer_phone_number || business.phone,
      transferInstructions: settings?.transfer_instructions || undefined,
      customGreeting: settings?.custom_greeting || undefined,
      pronunciationGuide: ext.pronunciationGuide || undefined,
      conversationPreferences: ext.conversationPreferences || undefined,
      supportedLanguages: ext.supportedLanguages,
      callerIntakeQuestions: ext.callerIntakeQuestions,
      businessFaqs: ext.businessFaqs,
    };

    return {
      success: true,
      isDemo: false,
      config,
      businessId: business.id,
      contractorId: business.id,
      user: { id: user.id, email: user.email },
      role: membership.role,
    };
  } catch (err: unknown) {
    console.error('[TenantResolution] Unexpected error resolving tenant context:', err);
    return {
      success: false,
      status: 500,
      error: 'Internal authorization error while resolving tenant.',
      category: 'TENANT_RESOLUTION_ERROR',
    };
  }
}

/**
 * Deterministic server-side guard verifying that an authenticated contractor or
 * unauthenticated browser caller can NEVER load or override another contractor's configuration.
 *
 * - Strips any untrusted tenant IDs or config payloads from `untrustedPayload`.
 * - If an authenticated user belongs to `sessionBusinessId`, returns ONLY the server-loaded
 *   `ContractorBusinessConfig` matching `sessionBusinessId`.
 * - If `sessionBusinessId` does not match the available verified business record, rejects with 403.
 */
export function resolveVerifiedContractorConfig(params: {
  isAuthenticated: boolean;
  sessionBusinessId?: string | null;
  availableConfigsById: Record<string, ContractorBusinessConfig>;
  untrustedPayload?: Record<string, unknown>;
}): TenantResolutionResult {
  // Always strip untrusted IDs and config overrides from any caller/browser payload
  if (params.untrustedPayload) {
    stripUntrustedTenantIds(params.untrustedPayload);
  }

  if (!params.isAuthenticated) {
    return {
      success: true,
      isDemo: true,
      config: DEFAULT_SUMMIT_HVAC_CONFIG,
    };
  }

  if (!params.sessionBusinessId) {
    return {
      success: false,
      status: 403,
      error: 'User is authenticated but has no associated business profile in the organization.',
      category: 'MISSING_BUSINESS_PROFILE',
    };
  }

  const verifiedConfig = params.availableConfigsById[params.sessionBusinessId];
  if (!verifiedConfig || verifiedConfig.id !== params.sessionBusinessId) {
    return {
      success: false,
      status: 403,
      error: 'The business associated with your user account does not exist or access is denied.',
      category: 'BUSINESS_NOT_FOUND',
    };
  }

  return {
    success: true,
    isDemo: false,
    config: verifiedConfig,
    businessId: verifiedConfig.id,
    contractorId: verifiedConfig.id,
    user: { id: `user-for-${verifiedConfig.id}` },
    role: 'owner',
  };
}

