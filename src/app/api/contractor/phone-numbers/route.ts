import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  resolveTenantContext,
  requireContractorAuth,
  stripUntrustedTenantIds,
} from '@/lib/auth/tenant';
import {
  ContractorPersistenceService,
  isValidTwilioPhoneSid,
} from '@/lib/services/contractorPersistence';
import {
  extractExtendedSettingsMetadata,
  resolvePhoneIntegrationStatus,
} from '@/lib/services/contractorConfigMapper';
import {
  formatE164UsPhone,
  listRegisteredDestinationRoutes,
  normalizeUsPhoneDigits,
} from '@/lib/telephony/tenantPhoneMapping';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/phone-numbers
 * Lists provisioned destination numbers and current routing verification status
 * for the authenticated contractor.
 */
export async function GET() {
  try {
    const auth = await requireContractorAuth();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    const businessId = auth.businessId;
    const admin = createAdminClient();

    const { data: business } = await admin
      .from('businesses')
      .select('id, name, phone, timezone')
      .eq('id', businessId)
      .maybeSingle();

    const { data: settings } = await admin
      .from('business_settings')
      .select('business_hours, industry_config')
      .eq('business_id', businessId)
      .maybeSingle();

    let dbPhoneRows: Array<{
      id?: string;
      phone_number: string;
      normalized_digits: string;
      label: string;
      provider: string;
      twilio_sid: string | null;
      is_active: boolean;
    }> = [];

    try {
      const { data: rows } = await admin
        .from('phone_numbers')
        .select('id, phone_number, normalized_digits, label, provider, twilio_sid, is_active')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      if (rows) {
        dbPhoneRows = rows;
      }
    } catch {
      // Fallback if phone_numbers migration is not applied
    }

    const runtimeRoutes = listRegisteredDestinationRoutes(businessId);
    for (const rt of runtimeRoutes) {
      if (!dbPhoneRows.some((r) => r.normalized_digits === rt.normalizedDigits)) {
        dbPhoneRows.push({
          phone_number: rt.phoneNumber,
          normalized_digits: rt.normalizedDigits,
          label: rt.label || 'AERIS Inbound Destination',
          provider: 'twilio',
          twilio_sid: rt.twilioSid || null,
          is_active: rt.isActive,
        });
      }
    }

    const provisionedRow =
      dbPhoneRows.find((r) => isValidTwilioPhoneSid(r.twilio_sid) && r.is_active) ||
      dbPhoneRows.find((r) => r.is_active) ||
      null;

    const ext = extractExtendedSettingsMetadata(
      settings?.business_hours,
      settings?.industry_config,
      business?.timezone
    );

    const phoneIntegration = resolvePhoneIntegrationStatus({
      businessPhone: business?.phone || null,
      forwardingEnabled: ext.forwardingEnabled,
      twilioSid: provisionedRow?.twilio_sid || null,
      isActiveRoute: Boolean(provisionedRow?.is_active),
      inboundAerisNumber: provisionedRow?.twilio_sid ? provisionedRow.phone_number : null,
    });

    return NextResponse.json({
      success: true,
      businessId,
      phoneNumbers: dbPhoneRows,
      phoneIntegration,
    });
  } catch (err: unknown) {
    console.error('[ContractorPhoneNumbers:GET] Error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve contractor phone numbers.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contractor/phone-numbers
 * Allows an authorized administrator or contractor owner to associate a provisioned
 * Twilio destination number with their contractor organization.
 *
 * Security & Honesty Rules:
 * - Never invents phone numbers.
 * - Requires owner or admin role.
 * - Strips untrusted tenant IDs and binds strictly to the authenticated contractor.
 * - Prevents claiming a destination number owned by another contractor.
 * - Does not mark contractor as connected_and_verified until Twilio SID, active route, and forwarding are verified.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireContractorAuth(['owner', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

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
        : {};

    const rawPhone =
      typeof body.destinationPhoneNumber === 'string'
        ? body.destinationPhoneNumber.trim()
        : typeof body.phoneNumber === 'string'
        ? body.phoneNumber.trim()
        : '';

    const normalizedDigits = normalizeUsPhoneDigits(rawPhone);
    const e164Phone = formatE164UsPhone(rawPhone);

    if (!rawPhone || normalizedDigits.length !== 10 || !e164Phone) {
      return NextResponse.json(
        {
          error:
            'Please provide a valid 10-digit US or E.164 provisioned destination phone number (e.g., +19725550140).',
          code: 'INVALID_DESTINATION_NUMBER',
        },
        { status: 400 }
      );
    }

    const rawTwilioSid =
      typeof body.twilioSid === 'string' && body.twilioSid.trim().length > 0
        ? body.twilioSid.trim()
        : null;

    if (rawTwilioSid && !isValidTwilioPhoneSid(rawTwilioSid)) {
      return NextResponse.json(
        {
          error:
            'Invalid Twilio IncomingPhoneNumber SID format. Expected a 34-character SID starting with "PN".',
          code: 'INVALID_TWILIO_SID',
        },
        { status: 400 }
      );
    }

    const label =
      typeof body.label === 'string' && body.label.trim().length > 0
        ? body.label.trim().slice(0, 80)
        : 'AERIS Inbound Destination';
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;

    const tenantRes = await resolveTenantContext();
    const businessConfig = tenantRes.success ? tenantRes.config : undefined;

    try {
      const associated = await ContractorPersistenceService.associateProvisionedPhoneNumber({
        businessId: auth.businessId,
        phoneNumber: e164Phone,
        twilioSid: rawTwilioSid,
        label,
        isActive,
        businessConfig,
      });

      const admin = createAdminClient();
      const { data: settings } = await admin
        .from('business_settings')
        .select('business_hours, industry_config')
        .eq('business_id', auth.businessId)
        .maybeSingle();

      const ext = extractExtendedSettingsMetadata(
        settings?.business_hours,
        settings?.industry_config,
        businessConfig?.timezone
      );

      const phoneIntegration = resolvePhoneIntegrationStatus({
        businessPhone: businessConfig?.phone,
        forwardingEnabled: ext.forwardingEnabled,
        twilioSid: associated.twilioSid,
        isActiveRoute: associated.isActive,
        inboundAerisNumber: associated.twilioSidVerified ? associated.phoneNumber : null,
      });

      return NextResponse.json({
        success: true,
        associatedNumber: associated,
        phoneIntegration,
      });
    } catch (assocErr: unknown) {
      const rawMsg = assocErr instanceof Error ? assocErr.message : 'Failed to associate phone number.';
      const isConflict = rawMsg.includes('already assigned to another contractor');
      const safeErrorMsg = isConflict
        ? 'This destination phone number is already assigned to another contractor.'
        : 'Failed to associate phone number. Please verify the number and try again.';
      return NextResponse.json(
        {
          error: safeErrorMsg,
          code: isConflict ? 'PHONE_NUMBER_CONFLICT' : 'ASSOCIATION_FAILED',
        },
        { status: isConflict ? 409 : 400 }
      );
    }
  } catch (err: unknown) {
    console.error('[ContractorPhoneNumbers:POST] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
