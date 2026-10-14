import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireContractorAuth, stripUntrustedTenantIds } from '@/lib/auth/tenant';
import { validateSettingsInput } from '@/lib/validation/contractorSettings';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import { normalizeIndustry } from '@/lib/ai/industryTemplates';
import {
  buildBusinessHoursJsonb,
  extractExtendedSettingsMetadata,
  resolvePhoneIntegrationStatus,
} from '@/lib/services/contractorConfigMapper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/settings
 * Retrieves the current business details, receptionist behavior settings, and
 * accurate phone integration status for the authenticated contractor.
 */
export async function GET() {
  try {
    // 1. Authenticate caller and resolve verified business_id
    const auth = await requireContractorAuth();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    const businessId = auth.businessId;
    const adminClient = createAdminClient();

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

    // 4. Lookup of phone_numbers table for honest Twilio destination provisioning status
    let twilioSid: string | null = null;
    let isActiveRoute = false;
    let inboundAerisNumber: string | null = null;
    try {
      const { data: phoneRows } = await adminClient
        .from('phone_numbers')
        .select('phone_number, twilio_sid, is_active, label')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      if (phoneRows && phoneRows.length > 0) {
        const provisionedRow =
          phoneRows.find((r) => Boolean(r.twilio_sid && r.twilio_sid.trim().length > 0)) ||
          phoneRows[0];
        if (provisionedRow) {
          twilioSid = provisionedRow.twilio_sid;
          isActiveRoute = provisionedRow.is_active;
          if (provisionedRow.twilio_sid) {
            inboundAerisNumber = provisionedRow.phone_number;
          }
        }
      }
    } catch {
      // Non-fatal if phone_numbers migration is not yet applied
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
      inboundAerisNumber,
    });

    return NextResponse.json({
      success: true,
      settings: {
        id: business.id,
        name: business.name,
        industry: normalizeIndustry((business as { industry?: string }).industry),
        slug: business.slug,
        phone: business.phone,
        businessEmail: ext.businessEmail || auth.email || '',
        website: ext.website,
        address: business.address || '',
        city: business.city || '',
        state: business.state || '',
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
        callbackInstructions: ext.callbackInstructions || settings?.transfer_instructions || '',
        appointmentRequestRules: ext.appointmentRequestRules,
        transferPhoneNumber: settings?.transfer_phone_number || business.phone,
        transferInstructions: settings?.transfer_instructions || '',
        customGreeting: settings?.custom_greeting || '',
        pronunciationGuide: ext.pronunciationGuide,
        conversationPreferences: ext.conversationPreferences,
        supportedLanguages: ext.supportedLanguages,
        callerIntakeQuestions: ext.callerIntakeQuestions,
        businessFaqs: ext.businessFaqs,
        forwardingEnabled: ext.forwardingEnabled,
        forwardingMode: ext.forwardingMode,
        carrierName: ext.carrierName,
        onboardingCompleted: ext.onboardingCompleted,
        onboardingStep: ext.onboardingStep,
        phoneIntegration,
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
 * Updates business profile, receptionist behavior, and phone forwarding preferences
 * for the authenticated contractor. Strictly derives the target business_id from the session.
 */
export async function PUT(req: NextRequest) {
  try {
    // 1. Authenticate caller and resolve verified business_id (owner/admin required to mutate settings)
    const auth = await requireContractorAuth(['owner', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    const verifiedBusinessId = auth.businessId;
    const adminClient = createAdminClient();

    // 2. Parse and Validate Request Payload
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    // Strip any client-supplied tenant IDs before validation
    const body =
      rawBody && typeof rawBody === 'object'
        ? stripUntrustedTenantIds(rawBody as Record<string, unknown>)
        : rawBody;

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

    // 4. Load existing business_settings to preserve any omitted optional JSONB or ZIP fields
    const { data: existingSettings } = await adminClient
      .from('business_settings')
      .select('supported_zips, business_hours, industry_config')
      .eq('business_id', verifiedBusinessId)
      .maybeSingle();

    let resolvedSupportedZips = data.supportedZips || [];
    const rawBodyObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (!Array.isArray(rawBodyObj.supportedZips)) {
      if (Array.isArray(existingSettings?.supported_zips)) {
        resolvedSupportedZips = existingSettings.supported_zips;
      }
    }

    const enrichedHours = buildBusinessHoursJsonb(existingSettings?.business_hours, {
      weekdays: data.businessHours.weekdays,
      saturday: data.businessHours.saturday,
      sunday: data.businessHours.sunday,
      timezone: data.timezone,
      businessEmail: data.businessEmail,
      website: data.website,
      pronunciationGuide: data.pronunciationGuide,
      conversationPreferences: data.conversationPreferences,
      callbackInstructions: data.callbackInstructions || data.transferInstructions,
      appointmentRequestRules: data.appointmentRequestRules,
      supportedLanguages: data.supportedLanguages,
      callerIntakeQuestions: data.callerIntakeQuestions,
      businessFaqs: data.businessFaqs,
      afterHoursBehavior: data.afterHoursBehavior,
      forwardingEnabled: data.forwardingEnabled,
      forwardingMode: data.forwardingMode,
      carrierName: data.carrierName,
      onboardingCompleted: true,
      onboardingStep: 6,
    });

    // 5. Upsert/Update business_settings table for the authenticated business_id ONLY
    const { error: updateSettingsError } = await adminClient
      .from('business_settings')
      .upsert(
        {
          business_id: verifiedBusinessId,
          service_areas: data.serviceAreas,
          supported_zips: resolvedSupportedZips,
          services_offered: data.servicesOffered,
          business_hours: enrichedHours,
          emergency_service_enabled: data.emergencyServiceEnabled,
          after_hours_instructions: data.afterHoursInstructions || null,
          transfer_phone_number: data.transferPhoneNumber || data.phone,
          transfer_instructions: data.transferInstructions || data.callbackInstructions || null,
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

    // 6. Synchronize phone_numbers, services, and contractor_members tables
    await ContractorPersistenceService.syncContractorResources({
      businessId: verifiedBusinessId,
      userId: auth.userId,
      email: auth.email,
      role: auth.role,
      industry: data.industry || 'hvac',
      phone: data.phone,
      servicesOffered: data.servicesOffered,
    });

    const extAfterSave = extractExtendedSettingsMetadata(enrichedHours);
    const phoneIntegration = resolvePhoneIntegrationStatus({
      businessPhone: data.phone,
      forwardingEnabled: extAfterSave.forwardingEnabled,
    });

    return NextResponse.json({
      success: true,
      message: 'Contractor settings updated successfully.',
      settings: {
        id: verifiedBusinessId,
        ...data,
        businessEmail: extAfterSave.businessEmail,
        website: extAfterSave.website,
        timezone: extAfterSave.timezone,
        pronunciationGuide: extAfterSave.pronunciationGuide,
        conversationPreferences: extAfterSave.conversationPreferences,
        callbackInstructions: extAfterSave.callbackInstructions,
        appointmentRequestRules: extAfterSave.appointmentRequestRules,
        supportedLanguages: extAfterSave.supportedLanguages,
        callerIntakeQuestions: extAfterSave.callerIntakeQuestions,
        businessFaqs: extAfterSave.businessFaqs,
        afterHoursBehavior: extAfterSave.afterHoursBehavior,
        forwardingEnabled: extAfterSave.forwardingEnabled,
        forwardingMode: extAfterSave.forwardingMode,
        carrierName: extAfterSave.carrierName,
        supportedZips: resolvedSupportedZips,
        phoneIntegration,
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
