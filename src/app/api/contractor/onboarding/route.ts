import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateOnboardingInput, OnboardingInput } from '@/lib/validation/contractorOnboarding';

export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const rand = Math.random().toString(36).substring(2, 7);
  return `${base || 'contractor'}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller via Supabase Session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Authentication required. Please sign in to complete onboarding.',
          code: 'UNAUTHENTICATED',
        },
        { status: 401 }
      );
    }

    // 2. Parse and Validate Body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const validation = validateOnboardingInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Contractor onboarding validation failed.',
          code: 'VALIDATION_FAILED',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const input = body as OnboardingInput & { fullName?: string };
    const adminClient = createAdminClient();

    // 3. Duplicate Prevention: Check if this user is ALREADY associated with a business
    const { data: existingUser, error: checkError } = await adminClient
      .from('users')
      .select('id, business_id')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError) {
      console.error('[Onboarding] Error checking existing user mapping:', checkError);
      return NextResponse.json(
        { error: 'Database check failed during onboarding verification.', code: 'DB_ERROR' },
        { status: 500 }
      );
    }

    if (existingUser && existingUser.business_id) {
      return NextResponse.json(
        {
          error: 'Your account is already associated with an active HVAC contractor business.',
          code: 'DUPLICATE_BUSINESS_REGISTRATION',
          businessId: existingUser.business_id,
        },
        { status: 409 }
      );
    }

    const businessSlug = slugify(input.name);

    // 4. ATOMIC CREATION ATTEMPT 1: Stored Procedure RPC (if deployed in Supabase)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)(
        'onboard_contractor_business',
        {
          p_user_id: user.id,
          p_user_email: user.email || '',
          p_full_name: input.fullName?.trim() || (user.user_metadata?.full_name as string) || null,
          p_name: input.name.trim(),
          p_slug: businessSlug,
          p_phone: input.phone.trim(),
          p_address: input.address.trim(),
          p_city: input.city?.trim() || null,
          p_state: input.state?.trim().toUpperCase() || null,
          p_postal_code: input.postalCode?.trim() || null,
          p_service_areas: input.serviceAreas.map((a) => a.trim()).filter(Boolean),
          p_supported_zips: (input.supportedZips || []).map((z) => z.trim()).filter(Boolean),
          p_services_offered: input.servicesOffered.map((s) => s.trim()).filter(Boolean),
          p_business_hours: input.businessHours,
          p_emergency_service_enabled: Boolean(input.emergencyServiceEnabled),
          p_after_hours_instructions: input.afterHoursInstructions?.trim() || null,
          p_transfer_phone_number: input.transferPhoneNumber?.trim() || input.phone.trim(),
          p_transfer_instructions: input.transferInstructions?.trim() || null,
          p_custom_greeting: input.customGreeting?.trim() || null,
        }
      );

      if (!rpcError && rpcData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = rpcData as any;
        return NextResponse.json(
          {
            success: true,
            businessId: result.business_id,
            businessName: result.name,
            slug: result.slug,
            message: 'Contractor onboarding completed successfully.',
          },
          { status: 201 }
        );
      }

      if (rpcError && rpcError.message && rpcError.message.includes('DUPLICATE_BUSINESS_REGISTRATION')) {
        return NextResponse.json(
          {
            error: 'Your account is already associated with an active HVAC contractor business.',
            code: 'DUPLICATE_BUSINESS_REGISTRATION',
          },
          { status: 409 }
        );
      }
    } catch {
      // Fall through to programmatic multi-step rollback if RPC is unavailable
    }

    // 5. ATOMIC CREATION ATTEMPT 2: Programmatic Step-by-Step with Rollback Guard
    let createdBusinessId: string | null = null;
    let createdSettingsId: string | null = null;

    try {
      // Step A: Insert into businesses
      const { data: business, error: bizError } = await adminClient
        .from('businesses')
        .insert({
          name: input.name.trim(),
          slug: businessSlug,
          phone: input.phone.trim(),
          address: input.address.trim(),
          city: input.city?.trim() || null,
          state: input.state?.trim().toUpperCase() || null,
          postal_code: input.postalCode?.trim() || null,
        })
        .select()
        .single();

      if (bizError || !business) {
        console.error('[Onboarding] Failed to create business record:', bizError);
        throw new Error(bizError?.message || 'Failed to insert business record');
      }

      createdBusinessId = business.id;

      // Step B: Insert into business_settings
      const { data: settings, error: settingsError } = await adminClient
        .from('business_settings')
        .insert({
          business_id: business.id,
          service_areas: input.serviceAreas.map((a) => a.trim()).filter(Boolean),
          supported_zips: (input.supportedZips || []).map((z) => z.trim()).filter(Boolean),
          services_offered: input.servicesOffered.map((s) => s.trim()).filter(Boolean),
          business_hours: input.businessHours,
          emergency_service_enabled: Boolean(input.emergencyServiceEnabled),
          after_hours_instructions: input.afterHoursInstructions?.trim() || null,
          transfer_phone_number: input.transferPhoneNumber?.trim() || input.phone.trim(),
          transfer_instructions: input.transferInstructions?.trim() || null,
          custom_greeting: input.customGreeting?.trim() || null,
        })
        .select()
        .single();

      if (settingsError || !settings) {
        console.error('[Onboarding] Failed to create business settings record:', settingsError);
        throw new Error(settingsError?.message || 'Failed to insert business settings');
      }

      createdSettingsId = settings.id;

      // Step C: Assign business_id to authenticated user in public.users
      const { error: userError } = await adminClient.from('users').upsert({
        id: user.id,
        business_id: business.id,
        email: user.email || '',
        full_name: input.fullName?.trim() || (user.user_metadata?.full_name as string) || null,
        role: 'owner',
      });

      if (userError) {
        console.error('[Onboarding] Failed to update user profile with business_id:', userError);
        throw new Error(userError.message || 'Failed to assign business to user profile');
      }

      return NextResponse.json(
        {
          success: true,
          businessId: business.id,
          businessName: business.name,
          slug: business.slug,
          message: 'Contractor onboarding completed successfully.',
        },
        { status: 201 }
      );
    } catch (txError: unknown) {
      // ROLLBACK GUARD: Clean up any partially created records
      console.warn('[Onboarding] Rolling back partially created records due to error:', txError);

      if (createdSettingsId && createdBusinessId) {
        try {
          await adminClient.from('business_settings').delete().eq('id', createdSettingsId);
        } catch (cleanupErr) {
          console.error('[Onboarding Rollback] Failed to delete settings:', cleanupErr);
        }
      }

      if (createdBusinessId) {
        try {
          await adminClient.from('businesses').delete().eq('id', createdBusinessId);
        } catch (cleanupErr) {
          console.error('[Onboarding Rollback] Failed to delete business:', cleanupErr);
        }
      }

      const errorMessage = txError instanceof Error ? txError.message : 'Unknown database error';
      return NextResponse.json(
        {
          error: 'Failed to complete contractor onboarding. Transaction rolled back safely.',
          code: 'TRANSACTION_FAILED',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[Onboarding] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected internal error occurred.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
