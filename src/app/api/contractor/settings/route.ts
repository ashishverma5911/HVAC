import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateSettingsInput } from '@/lib/validation/contractorSettings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/settings
 * Retrieves the current business details and settings for the authenticated contractor.
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
        { error: 'Authentication required to access contractor settings.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Resolve business_id securely from users table
    const { data: member, error: memberError } = await adminClient
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json(
        {
          error: 'User is authenticated but has no associated business profile.',
          code: 'MISSING_BUSINESS_PROFILE',
        },
        { status: 403 }
      );
    }

    const businessId = member.business_id;

    // 2. Fetch business record
    const { data: business, error: bizError } = await adminClient
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    if (bizError || !business) {
      return NextResponse.json(
        { error: 'Associated business record not found.', code: 'BUSINESS_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 3. Fetch business settings record
    const { data: settings } = await adminClient
      .from('business_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    const hours = (settings?.business_hours as Record<string, string>) || {};

    return NextResponse.json({
      success: true,
      settings: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        phone: business.phone,
        address: business.address || '',
        city: business.city || '',
        state: business.state || '',
        postalCode: business.postal_code || '',
        serviceAreas: settings?.service_areas || [],
        supportedZips: settings?.supported_zips || [],
        servicesOffered: settings?.services_offered || [],
        businessHours: {
          weekdays: hours.weekdays || '8:00 AM – 6:00 PM',
          saturday: hours.saturday || '',
          sunday: hours.sunday || '',
        },
        emergencyServiceEnabled: settings?.emergency_service_enabled ?? true,
        afterHoursInstructions: settings?.after_hours_instructions || '',
        transferPhoneNumber: settings?.transfer_phone_number || business.phone,
        transferInstructions: settings?.transfer_instructions || '',
        customGreeting: settings?.custom_greeting || '',
      },
    });
  } catch (err: unknown) {
    console.error('[ContractorSettings:GET] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching settings.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/contractor/settings
 * Updates business profile and settings for the authenticated contractor.
 * Strictly derives the target business_id from the session.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to update contractor settings.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Resolve business_id securely from users table
    const { data: member, error: memberError } = await adminClient
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json(
        {
          error: 'User is authenticated but has no associated business profile.',
          code: 'MISSING_BUSINESS_PROFILE',
        },
        { status: 403 }
      );
    }

    const verifiedBusinessId = member.business_id;

    // 2. Parse and Validate Request Payload
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const validation = validateSettingsInput(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json(
        {
          error: 'Contractor settings validation failed.',
          code: 'VALIDATION_FAILED',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const data = validation.sanitized;
    const now = new Date().toISOString();

    // 3. Update businesses table for the authenticated business_id ONLY
    const { error: updateBizError } = await adminClient
      .from('businesses')
      .update({
        name: data.name,
        phone: data.phone,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        postal_code: data.postalCode || null,
        updated_at: now,
      })
      .eq('id', verifiedBusinessId);

    if (updateBizError) {
      console.error('[ContractorSettings:PUT] Failed to update business table:', updateBizError);
      return NextResponse.json(
        { error: 'Failed to update business profile.', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    // 4. Upsert/Update business_settings table for the authenticated business_id ONLY
    const { error: updateSettingsError } = await adminClient
      .from('business_settings')
      .upsert(
        {
          business_id: verifiedBusinessId,
          service_areas: data.serviceAreas,
          supported_zips: data.supportedZips || [],
          services_offered: data.servicesOffered,
          business_hours: data.businessHours,
          emergency_service_enabled: data.emergencyServiceEnabled,
          after_hours_instructions: data.afterHoursInstructions || null,
          transfer_phone_number: data.transferPhoneNumber || data.phone,
          transfer_instructions: data.transferInstructions || null,
          custom_greeting: data.customGreeting || null,
          updated_at: now,
        },
        { onConflict: 'business_id' }
      );

    if (updateSettingsError) {
      console.error('[ContractorSettings:PUT] Failed to update business settings:', updateSettingsError);
      return NextResponse.json(
        { error: 'Failed to update business configuration settings.', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Contractor settings updated successfully.',
      settings: {
        id: verifiedBusinessId,
        ...data,
      },
    });
  } catch (err: unknown) {
    console.error('[ContractorSettings:PUT] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected internal error occurred.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
