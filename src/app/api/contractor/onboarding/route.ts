import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  validateOnboardingInput,
  OnboardingInput,
  isValidPhoneNumber,
} from '@/lib/validation/contractorOnboarding';
import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';
import { evaluateContractorRolePermission } from '@/lib/auth/tenant';
import { sanitizeClientErrorMessage } from '@/lib/compliance/callPrivacyAndCompliance';
import { normalizeIndustry } from '@/lib/ai/industryTemplates';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import {
  buildBusinessHoursJsonb,
  extractExtendedSettingsMetadata,
  resolvePhoneIntegrationStatus,
} from '@/lib/services/contractorConfigMapper';

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

/**
 * GET /api/contractor/onboarding
 * Retrieves the authenticated user's onboarding state, saved draft (if incomplete),
 * and accurate phone integration status so the user can resume incomplete onboarding.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          authenticated: false,
          error: 'Authentication required to inspect onboarding progress.',
          code: 'UNAUTHENTICATED',
        },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id, business_id, role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingUser || !existingUser.business_id) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        hasBusiness: false,
        onboardingCompleted: false,
        onboardingStep: 2,
        user: {
          id: user.id,
          email: user.email || '',
          fullName: (user.user_metadata?.full_name as string) || '',
        },
        draft: null,
        phoneIntegration: resolvePhoneIntegrationStatus({}),
      });
    }

    const businessId = existingUser.business_id;
    const [{ data: business }, { data: settings }] = await Promise.all([
      adminClient.from('businesses').select('*').eq('id', businessId).maybeSingle(),
      adminClient
        .from('business_settings')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle(),
    ]);

    if (!business) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        hasBusiness: false,
        onboardingCompleted: false,
        onboardingStep: 2,
        user: {
          id: user.id,
          email: user.email || '',
          fullName: existingUser.full_name || (user.user_metadata?.full_name as string) || '',
        },
        draft: null,
        phoneIntegration: resolvePhoneIntegrationStatus({}),
      });
    }

    let twilioSid: string | null = null;
    let isActiveRoute = false;
    try {
      const { data: phoneRow } = await adminClient
        .from('phone_numbers')
        .select('twilio_sid, is_active')
        .eq('business_id', businessId)
        .limit(1)
        .maybeSingle();
      if (phoneRow) {
        twilioSid = phoneRow.twilio_sid;
        isActiveRoute = phoneRow.is_active;
      }
    } catch {
      // Non-fatal if phone_numbers table is not yet migrated
    }

    const ext = extractExtendedSettingsMetadata(
      settings?.business_hours,
      settings?.industry_config,
      business.timezone
    );

    const phoneIntegration = resolvePhoneIntegrationStatus({
      businessPhone: business.phone,
      forwardingEnabled: ext.forwardingEnabled,
      twilioSid,
      isActiveRoute,
    });

    return NextResponse.json({
      success: true,
      authenticated: true,
      hasBusiness: true,
      onboardingCompleted: ext.onboardingCompleted,
      onboardingStep: ext.onboardingStep,
      role: existingUser.role,
      user: {
        id: user.id,
        email: user.email || '',
        fullName: existingUser.full_name || (user.user_metadata?.full_name as string) || '',
      },
      draft: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        industry: normalizeIndustry(business.industry),
        phone: business.phone,
        businessEmail: ext.businessEmail || user.email || '',
        website: ext.website,
        address: business.address || '',
        city: business.city || '',
        state: business.state || 'TX',
        postalCode: business.postal_code || '',
        timezone: ext.timezone,
        serviceAreas: settings?.service_areas || [],
        supportedZips: settings?.supported_zips || [],
        servicesOffered: settings?.services_offered || [],
        businessHours: {
          weekdays: ext.weekdays,
          saturday: ext.saturday,
          sunday: ext.sunday,
        },
        emergencyServiceEnabled: settings?.emergency_service_enabled ?? true,
        afterHoursBehavior: ext.afterHoursBehavior,
        afterHoursInstructions: settings?.after_hours_instructions || '',
        transferPhoneNumber: settings?.transfer_phone_number || business.phone,
        transferInstructions: settings?.transfer_instructions || '',
        customGreeting: settings?.custom_greeting || '',
        pronunciationGuide: ext.pronunciationGuide,
        supportedLanguages: ext.supportedLanguages,
        callerIntakeQuestions: ext.callerIntakeQuestions,
        forwardingEnabled: ext.forwardingEnabled,
        forwardingMode: ext.forwardingMode,
        carrierName: ext.carrierName,
      },
      phoneIntegration,
    });
  } catch (err: unknown) {
    console.error('[Onboarding:GET] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve onboarding state.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
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

    // 2. Parse Request Body (strip any client-supplied tenant IDs)
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const body =
      rawBody && typeof rawBody === 'object'
        ? stripUntrustedTenantIds(rawBody as Record<string, unknown>)
        : rawBody;

    const adminClient = createAdminClient();

    // 2b. Check if this is a "Join Existing Organization" request (Step 1 option)
    const bodyRecord = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (bodyRecord.action === 'join') {
      const orgIdentifier =
        typeof bodyRecord.organizationSlug === 'string' ? bodyRecord.organizationSlug.trim() : '';
      const verificationPhone =
        typeof bodyRecord.verificationPhone === 'string' ? bodyRecord.verificationPhone.trim() : '';

      if (!orgIdentifier || orgIdentifier.length < 2) {
        return NextResponse.json(
          {
            error: 'Please enter a valid Organization Slug or ID to join.',
            code: 'VALIDATION_FAILED',
            details: { organizationSlug: 'Organization Slug is required.' },
          },
          { status: 400 }
        );
      }

      if (!verificationPhone || !isValidPhoneNumber(verificationPhone)) {
        return NextResponse.json(
          {
            error: 'Please enter the organization’s 10-digit business phone number to verify membership.',
            code: 'VALIDATION_FAILED',
            details: { verificationPhone: 'Valid 10-digit business phone is required for verification.' },
          },
          { status: 400 }
        );
      }

      // Check if user already belongs to an organization
      const { data: existingMember } = await adminClient
        .from('users')
        .select('id, business_id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingMember?.business_id) {
        return NextResponse.json(
          {
            error: 'Your account is already associated with an active contractor organization.',
            code: 'DUPLICATE_BUSINESS_REGISTRATION',
            businessId: existingMember.business_id,
          },
          { status: 409 }
        );
      }

      // Look up target business by slug
      const { data: targetBiz } = await adminClient
        .from('businesses')
        .select('id, name, slug, phone')
        .eq('slug', orgIdentifier.toLowerCase())
        .maybeSingle();

      const inputDigits = verificationPhone.replace(/\D/g, '').slice(-10);
      const targetDigits = targetBiz?.phone ? targetBiz.phone.replace(/\D/g, '').slice(-10) : '';

      if (!targetBiz || !targetDigits || inputDigits !== targetDigits) {
        return NextResponse.json(
          {
            error:
              'Could not verify organization membership. Check the organization slug and main business phone number.',
            code: 'ORGANIZATION_VERIFICATION_FAILED',
          },
          { status: 404 }
        );
      }

      const fullName =
        (typeof bodyRecord.fullName === 'string' && bodyRecord.fullName.trim()) ||
        (user.user_metadata?.full_name as string) ||
        null;

      const { error: joinError } = await adminClient.from('users').upsert({
        id: user.id,
        business_id: targetBiz.id,
        email: user.email || '',
        full_name: fullName,
        role: 'dispatcher',
      });

      if (joinError) {
        console.error('[Onboarding:Join] Failed to link user to organization:', joinError);
        return NextResponse.json(
          { error: 'Failed to join contractor organization.', code: 'DB_ERROR' },
          { status: 500 }
        );
      }

      await ContractorPersistenceService.syncContractorResources({
        businessId: targetBiz.id,
        userId: user.id,
        email: user.email || '',
        role: 'dispatcher',
      });

      return NextResponse.json(
        {
          success: true,
          joinedExisting: true,
          businessId: targetBiz.id,
          businessName: targetBiz.name,
          slug: targetBiz.slug,
          message: `Successfully joined ${targetBiz.name}.`,
        },
        { status: 200 }
      );
    }

    // 3. Validate Onboarding Input
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

    const input = body as OnboardingInput & { fullName?: string; resumeUpdate?: boolean };
    const normalizedIndustry = normalizeIndustry(input.industry);
    const isDraft = Boolean(input.isDraft);
    const onboardingCompleted = isDraft ? false : input.onboardingCompleted ?? true;
    const onboardingStep =
      typeof input.onboardingStep === 'number'
        ? input.onboardingStep
        : onboardingCompleted
        ? 6
        : 2;

    // 4. Check if this user is ALREADY associated with a business
    const { data: existingUser, error: checkError } = await adminClient
      .from('users')
      .select('id, business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError) {
      console.error('[Onboarding] Error checking existing user mapping:', checkError);
      return NextResponse.json(
        { error: 'Database check failed during onboarding verification.', code: 'DB_ERROR' },
        { status: 500 }
      );
    }

    const cleanServicesOffered =
      Array.isArray(input.servicesOffered) && input.servicesOffered.length > 0
        ? input.servicesOffered.map((s) => s.trim()).filter(Boolean)
        : ['AC Repair', 'Heating Repair', 'HVAC Maintenance', 'Emergency HVAC Service'];

    // If user already has a business_id, check whether it is an incomplete onboarding draft
    if (existingUser && existingUser.business_id) {
      const rolePerm = evaluateContractorRolePermission(existingUser.role, ['owner', 'admin']);
      if (!rolePerm.allowed) {
        return NextResponse.json(
          { error: rolePerm.error, code: rolePerm.code },
          { status: rolePerm.status }
        );
      }

      const { data: existingSettings } = await adminClient
        .from('business_settings')
        .select('business_hours, supported_zips')
        .eq('business_id', existingUser.business_id)
        .maybeSingle();

      const existingMeta = extractExtendedSettingsMetadata(existingSettings?.business_hours);

      // Allow updating in-place if resuming an incomplete onboarding OR saving a draft OR explicit resumeUpdate
      if (!existingMeta.onboardingCompleted || isDraft || input.resumeUpdate) {
        const verifiedBizId = existingUser.business_id;
        const now = new Date().toISOString();

        const enrichedHours = buildBusinessHoursJsonb(existingSettings?.business_hours, {
          weekdays: input.businessHours.weekdays,
          saturday: input.businessHours.saturday,
          sunday: input.businessHours.sunday,
          timezone: input.timezone || existingMeta.timezone || 'America/Chicago',
          businessEmail: input.businessEmail ?? existingMeta.businessEmail ?? user.email ?? '',
          website: input.website ?? existingMeta.website ?? '',
          pronunciationGuide: input.pronunciationGuide ?? existingMeta.pronunciationGuide ?? '',
          supportedLanguages: input.supportedLanguages || existingMeta.supportedLanguages,
          callerIntakeQuestions: input.callerIntakeQuestions || existingMeta.callerIntakeQuestions,
          afterHoursBehavior: input.afterHoursBehavior || existingMeta.afterHoursBehavior,
          forwardingEnabled: input.forwardingEnabled ?? existingMeta.forwardingEnabled,
          forwardingMode: input.forwardingMode || existingMeta.forwardingMode,
          carrierName: input.carrierName ?? existingMeta.carrierName ?? '',
          onboardingCompleted,
          onboardingStep,
        });

        const { data: updatedBiz, error: updateBizErr } = await adminClient
          .from('businesses')
          .update({
            name: input.name.trim(),
            phone: input.phone.trim(),
            address: input.address.trim(),
            city: input.city?.trim() || null,
            state: input.state?.trim().toUpperCase() || null,
            postal_code: input.postalCode?.trim() || null,
            updated_at: now,
          })
          .eq('id', verifiedBizId)
          .select('id, name, slug')
          .single();

        if (updateBizErr || !updatedBiz) {
          return NextResponse.json(
            { error: 'Failed to update onboarding business profile.', code: 'UPDATE_FAILED' },
            { status: 500 }
          );
        }

        const resolvedZips = Array.isArray(input.supportedZips)
          ? input.supportedZips.map((z) => z.trim()).filter(Boolean)
          : existingSettings?.supported_zips || [];

        const { error: updateSetErr } = await adminClient
          .from('business_settings')
          .upsert(
            {
              business_id: verifiedBizId,
              service_areas: input.serviceAreas.map((a) => a.trim()).filter(Boolean),
              supported_zips: resolvedZips,
              services_offered: cleanServicesOffered,
              business_hours: enrichedHours,
              emergency_service_enabled: Boolean(input.emergencyServiceEnabled),
              after_hours_instructions: input.afterHoursInstructions?.trim() || null,
              transfer_phone_number: input.transferPhoneNumber?.trim() || input.phone.trim(),
              transfer_instructions: input.transferInstructions?.trim() || null,
              custom_greeting: input.customGreeting?.trim() || null,
              updated_at: now,
            },
            { onConflict: 'business_id' }
          );

        if (updateSetErr) {
          return NextResponse.json(
            { error: 'Failed to save onboarding settings progress.', code: 'UPDATE_FAILED' },
            { status: 500 }
          );
        }

        await ContractorPersistenceService.syncContractorResources({
          businessId: verifiedBizId,
          userId: user.id,
          email: user.email || '',
          role: existingUser.role || 'owner',
          industry: normalizedIndustry,
          phone: input.phone.trim(),
          servicesOffered: cleanServicesOffered,
        });

        return NextResponse.json(
          {
            success: true,
            isDraft,
            onboardingCompleted,
            onboardingStep,
            businessId: updatedBiz.id,
            businessName: updatedBiz.name,
            slug: updatedBiz.slug,
            industry: normalizedIndustry,
            message: isDraft
              ? 'Onboarding progress saved. You can resume anytime.'
              : 'Contractor onboarding completed successfully.',
          },
          { status: 200 }
        );
      }

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
    const enrichedHours = buildBusinessHoursJsonb(null, {
      weekdays: input.businessHours.weekdays,
      saturday: input.businessHours.saturday,
      sunday: input.businessHours.sunday,
      timezone: input.timezone || 'America/Chicago',
      businessEmail: input.businessEmail || user.email || '',
      website: input.website || '',
      pronunciationGuide: input.pronunciationGuide || '',
      supportedLanguages: input.supportedLanguages || ['en-US'],
      callerIntakeQuestions: input.callerIntakeQuestions,
      afterHoursBehavior: input.afterHoursBehavior || 'emergency_dispatch',
      forwardingEnabled: input.forwardingEnabled ?? false,
      forwardingMode: input.forwardingMode || 'busy_no_answer',
      carrierName: input.carrierName || '',
      onboardingCompleted,
      onboardingStep,
    });

    // 5. ATOMIC CREATION ATTEMPT 1: Stored Procedure RPC (if deployed in Supabase)
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
          p_services_offered: cleanServicesOffered,
          p_business_hours: enrichedHours,
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
        await ContractorPersistenceService.syncContractorResources({
          businessId: result.business_id,
          userId: user.id,
          email: user.email || '',
          role: 'owner',
          industry: normalizedIndustry,
          phone: input.phone.trim(),
          servicesOffered: cleanServicesOffered,
        });

        return NextResponse.json(
          {
            success: true,
            isDraft,
            onboardingCompleted,
            onboardingStep,
            businessId: result.business_id,
            businessName: result.name,
            slug: result.slug,
            industry: normalizedIndustry,
            message: isDraft
              ? 'Onboarding progress saved. You can resume anytime.'
              : 'Contractor onboarding completed successfully.',
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

    // 6. ATOMIC CREATION ATTEMPT 2: Programmatic Step-by-Step with Rollback Guard
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
          services_offered: cleanServicesOffered,
          business_hours: enrichedHours,
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

      // Step D: Best-effort sync contractor_members, phone_numbers, and services tables
      await ContractorPersistenceService.syncContractorResources({
        businessId: business.id,
        userId: user.id,
        email: user.email || '',
        role: 'owner',
        industry: normalizedIndustry,
        phone: input.phone.trim(),
        servicesOffered: cleanServicesOffered,
      });

      return NextResponse.json(
        {
          success: true,
          isDraft,
          onboardingCompleted,
          onboardingStep,
          businessId: business.id,
          businessName: business.name,
          slug: business.slug,
          industry: normalizedIndustry,
          message: isDraft
            ? 'Onboarding progress saved. You can resume anytime.'
            : 'Contractor onboarding completed successfully.',
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

      const rawErrorMessage = txError instanceof Error ? txError.message : 'Unknown database error';
      return NextResponse.json(
        {
          error: 'Failed to complete contractor onboarding. Transaction rolled back safely.',
          code: 'TRANSACTION_FAILED',
          details: sanitizeClientErrorMessage(rawErrorMessage),
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
