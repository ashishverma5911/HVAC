import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireContractorAuth, stripUntrustedTenantIds } from '@/lib/auth/tenant';
import { LeadStatus, LeadUrgency } from '@/lib/supabase/types';
import {
  APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
  VALID_LEAD_STATUSES,
  enrichLeadRecord,
  normalizeLeadStatusInput,
  sanitizeLeadCaptureInput,
} from '@/lib/validation/contractorLeads';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';

export const dynamic = 'force-dynamic';

const VALID_URGENCIES: LeadUrgency[] = ['normal', 'urgent', 'emergency'];

/**
 * GET /api/contractor/leads
 * Retrieves filtered, paginated leads for the authenticated contractor.
 * Strictly derives the target business_id from the session.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate caller and resolve verified business_id strictly from session
    const auth = await requireContractorAuth();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    if (ContractorPersistenceService.isSimulatedDatabaseFailure()) {
      return NextResponse.json(
        { error: 'Failed to retrieve leads from database.', code: 'DATABASE_FAILURE' },
        { status: 500 }
      );
    }

    const businessId = auth.businessId;
    const admin = createAdminClient();

    // 2. Parse query parameters (explicitly ignoring any business_id / contractor_id query params)
    const { searchParams } = req.nextUrl;
    const rawStatusParam = searchParams.get('status')?.trim();
    const normalizedStatusParam = rawStatusParam ? normalizeLeadStatusInput(rawStatusParam) : null;
    const urgencyParam = searchParams.get('urgency')?.trim().toLowerCase();
    const serviceTypeParam = searchParams.get('serviceType')?.trim();
    const cityParam = searchParams.get('city')?.trim();
    const searchParam = searchParams.get('search')?.trim();

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10));
    const offset = (page - 1) * limit;

    // 3. Build scoped query
    let query = admin
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId);

    if (normalizedStatusParam && (VALID_LEAD_STATUSES as string[]).includes(normalizedStatusParam)) {
      if (
        normalizedStatusParam === 'contacted' ||
        normalizedStatusParam === 'converted' ||
        normalizedStatusParam === 'closed_not_proceeding'
      ) {
        query = query.or(
          `status.eq.${normalizedStatusParam},metadata->>workflowStatus.eq.${normalizedStatusParam}`
        );
      } else {
        query = query.eq('status', normalizedStatusParam as LeadStatus);
      }
    }

    if (urgencyParam && (VALID_URGENCIES as string[]).includes(urgencyParam)) {
      query = query.eq('urgency', urgencyParam as LeadUrgency);
    }

    if (serviceTypeParam) {
      query = query.eq('service_type', serviceTypeParam);
    }

    if (cityParam) {
      const cleanCity = cityParam.replace(/[%_,.():\\'"*]/g, '').trim().slice(0, 80);
      if (cleanCity) {
        query = query.ilike('city_area', `%${cleanCity}%`);
      }
    }

    if (searchParam) {
      // Clean query string for safe PostgREST .or() ILIKE filter (strip operators, parentheses, dots, quotes, wildcards)
      const cleanSearch = searchParam.replace(/[%_,.():\\'"*]/g, '').trim().slice(0, 100);
      if (cleanSearch) {
        query = query.or(
          `customer_name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,service_address.ilike.%${cleanSearch}%`
        );
      }
    }

    // Deterministic ordering: created_at DESC, then id DESC as stable tie-breaker
    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: leads, count, error: queryError } = await query;

    if (queryError) {
      console.error('[ContractorLeadsAPI] Error querying leads:', queryError);
      return NextResponse.json(
        { error: 'Failed to retrieve leads from database.', code: 'QUERY_FAILED' },
        { status: 500 }
      );
    }

    const leadList = leads || [];
    const leadIds = leadList.map((l) => l.id);

    // 4. Fetch associated appointments for these leads
    const appointmentsByLeadId: Record<
      string,
      {
        id: string;
        requested_date: string;
        requested_slot: string;
        status: string;
        confirmation_message: string;
      }
    > = {};

    if (leadIds.length > 0) {
      const { data: appointments } = await admin
        .from('appointments')
        .select('id, lead_id, requested_date, requested_slot, status')
        .eq('business_id', businessId)
        .in('lead_id', leadIds);

      if (appointments) {
        for (const appt of appointments) {
          appointmentsByLeadId[appt.lead_id] = {
            id: appt.id,
            requested_date: appt.requested_date,
            requested_slot: appt.requested_slot,
            status: 'requested',
            confirmation_message: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
          };
        }
      }
    }

    // 5. Map leads with enriched follow-up metadata & appointment payload
    const enrichedLeads = leadList.map((lead) => {
      const enriched = enrichLeadRecord(lead as Record<string, unknown>);
      const appointment = appointmentsByLeadId[lead.id] || null;
      return {
        ...enriched,
        preferred_appointment_window:
          enriched.preferred_appointment_window || appointment?.requested_slot || null,
        appointment,
      };
    });

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      leads: enrichedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadsAPI] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected internal error occurred.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contractor/leads
 * Captures a lead for the authenticated contractor with server-side idempotency
 * and non-fabrication of missing customer fields.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireContractorAuth();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    if (ContractorPersistenceService.isSimulatedDatabaseFailure()) {
      return NextResponse.json(
        { error: 'Database persistence unavailable.', code: 'DATABASE_FAILURE' },
        { status: 500 }
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

    const sanitized = sanitizeLeadCaptureInput({
      customerName: body.customerName ?? body.customer_name,
      phone: body.phone ?? body.callbackPhone,
      serviceAddress: body.serviceAddress ?? body.service_address ?? body.cityArea ?? body.city_area,
      cityArea: body.cityArea ?? body.city_area,
      serviceType: body.serviceType ?? body.service_type,
      reportedIssue: body.reportedIssue ?? body.reported_issue ?? body.problemDescription,
      urgency: body.urgency,
      preferredAppointmentWindow:
        body.preferredAppointmentWindow ??
        body.preferred_appointment_window ??
        body.preferredSlot,
      sourceCallId: body.sourceCallId ?? body.source_call_id ?? body.conversationId ?? body.conversation_id,
      status: body.status,
      source: body.source,
    });

    const result = await ContractorPersistenceService.persistLead(auth.businessId, {
      conversationId:
        typeof (body.conversationId ?? body.conversation_id) === 'string'
          ? String(body.conversationId ?? body.conversation_id)
          : sanitized.sourceCallId || undefined,
      sourceCallId: sanitized.sourceCallId || undefined,
      customerName: sanitized.customerName,
      phone: sanitized.phone,
      serviceAddress: sanitized.serviceAddress,
      cityArea: sanitized.cityArea || undefined,
      serviceType: sanitized.serviceType,
      reportedIssue: sanitized.reportedIssue,
      urgency: sanitized.urgency,
      preferredAppointmentWindow: sanitized.preferredAppointmentWindow,
      status: sanitized.status,
      source: sanitized.source,
    });

    if (!result.leadId) {
      return NextResponse.json(
        { error: 'Failed to persist lead.', code: 'PERSIST_FAILED' },
        { status: 500 }
      );
    }

    let appointmentRecord = null;
    if (sanitized.preferredAppointmentWindow) {
      const apptRes = await ContractorPersistenceService.persistAppointment(auth.businessId, {
        leadId: result.leadId,
        conversationId: sanitized.sourceCallId || undefined,
        requestedSlot: sanitized.preferredAppointmentWindow,
        notes: `Appointment requested via lead capture${sanitized.customerName ? ` for ${sanitized.customerName}` : ''}`,
      });
      if (apptRes) {
        appointmentRecord = {
          id: apptRes.appointmentId,
          requested_slot: sanitized.preferredAppointmentWindow,
          status: apptRes.status,
          confirmation_message: apptRes.confirmationMessage,
        };
      }
    }

    const detail = ContractorPersistenceService.getContractorLeadDetailFromLedger(
      auth.businessId,
      result.leadId
    );

    return NextResponse.json(
      {
        success: true,
        deduplicated: result.deduplicated,
        deduplicationReason: result.deduplicationReason || null,
        leadId: result.leadId,
        lead: detail?.lead || null,
        appointment: appointmentRecord,
        appointmentConfirmationMessage: sanitized.preferredAppointmentWindow
          ? APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE
          : null,
      },
      { status: result.deduplicated ? 200 : 201 }
    );
  } catch (err: unknown) {
    console.error('[ContractorLeadsAPI:POST] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to create lead.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

