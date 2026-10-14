import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireContractorAuth, stripUntrustedTenantIds } from '@/lib/auth/tenant';
import {
  APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
  enrichLeadRecord,
} from '@/lib/validation/contractorLeads';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/leads/[id]
 * Retrieves lead details, associated appointments, follow-up notes/attempts,
 * and originating conversation/call history + audit events.
 * Strictly derives target business_id from the session.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await context.params;

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing required lead ID parameter.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    // 1. Authenticate caller and resolve verified business_id
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

    const businessId = auth.businessId;
    const admin = createAdminClient();

    // 2. Query lead strictly scoped by verified businessId
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (leadError || !lead) {
      // Check in-memory ledger fallback (strictly scoped by businessId)
      const ledgerDetail = ContractorPersistenceService.getContractorLeadDetailFromLedger(
        businessId,
        leadId
      );
      if (ledgerDetail) {
        return NextResponse.json({
          success: true,
          lead: ledgerDetail.lead,
          appointments: ledgerDetail.appointments.map((appt) => ({
            ...appt,
            status: 'requested',
            confirmation_message: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
          })),
          conversation: ledgerDetail.conversation,
          appointmentConfirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
        });
      }

      // Return 404 to avoid leaking whether another contractor's lead exists
      return NextResponse.json(
        { error: 'Lead not found or access denied.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 3. Query associated appointments for this lead
    const { data: appointments } = await admin
      .from('appointments')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    const enrichedAppointments = (appointments || []).map((appt) => ({
      ...appt,
      status: 'requested',
      confirmation_message: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
    }));

    // 4. Query associated conversation / originating call
    let convData: Record<string, unknown> | null = null;
    let messages: Array<{ id: string; sender: string; text: string; created_at: string }> = [];
    let auditEvents: Array<{
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: string;
    }> = [];

    if (lead.conversation_id) {
      const { data: conv } = await admin
        .from('conversations')
        .select('*')
        .eq('id', lead.conversation_id)
        .eq('business_id', businessId)
        .maybeSingle();

      convData = conv as Record<string, unknown> | null;
    }

    if (!convData) {
      // Fallback: check if any conversation references this lead_id
      const { data: convFallback } = await admin
        .from('conversations')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('business_id', businessId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      convData = convFallback as Record<string, unknown> | null;
    }

    if (convData && typeof convData.id === 'string') {
      // Query messages
      const { data: rawMessages } = await admin
        .from('conversation_messages')
        .select('id, sender, text, created_at')
        .eq('conversation_id', convData.id)
        .order('created_at', { ascending: true });

      messages = rawMessages || [];

      // Query audit events
      const { data: rawEvents } = await admin
        .from('call_events')
        .select('id, event_type, payload, created_at')
        .eq('conversation_id', convData.id)
        .eq('business_id', businessId)
        .order('created_at', { ascending: true });

      auditEvents = (rawEvents as typeof auditEvents) || [];
    }

    const enrichedLead = enrichLeadRecord(lead as Record<string, unknown>);
    if (!enrichedLead.preferred_appointment_window && enrichedAppointments[0]?.requested_slot) {
      enrichedLead.preferred_appointment_window = enrichedAppointments[0].requested_slot;
    }

    return NextResponse.json({
      success: true,
      lead: enrichedLead,
      appointments: enrichedAppointments,
      appointmentConfirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
      conversation: convData
        ? {
            id: convData.id,
            channel: convData.channel,
            status: convData.status,
            started_at: convData.started_at,
            ended_at: convData.ended_at,
            external_call_sid:
              (typeof convData.external_call_sid === 'string' && convData.external_call_sid) ||
              enrichedLead.source_call_id ||
              null,
            caller_identifier:
              typeof convData.caller_identifier === 'string' ? convData.caller_identifier : null,
            called_number:
              typeof convData.called_number === 'string' ? convData.called_number : null,
            duration_seconds:
              typeof convData.duration_seconds === 'number' ? convData.duration_seconds : null,
            messages,
            auditEvents,
          }
        : null,
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadDetailAPI:GET] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve lead details.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/contractor/leads/[id]
 * Updates lead status, internal notes, contact attempts, next follow-up action,
 * preferred appointment window, and human callback escalation with strict
 * server-side validation and tenant isolation.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await context.params;

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing required lead ID parameter.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    // 1. Authenticate caller and resolve verified business_id (owner, admin, or dispatcher required to mutate leads)
    const auth = await requireContractorAuth(['owner', 'admin', 'dispatcher']);
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

    const businessId = auth.businessId;

    // 2. Parse and validate body (stripping any untrusted tenant IDs)
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

    const result = await ContractorPersistenceService.updateLeadFollowUp(
      businessId,
      leadId,
      body,
      { email: auth.email, role: auth.role }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Lead updated (${result.lead.status}).`,
      lead: result.lead,
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadDetailAPI:PATCH] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to update lead.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/contractor/leads/[id]
 * Deletes a lead record and its associated appointment requests for the authenticated contractor.
 * Enforces strict tenant isolation and owner/admin role requirement so a contractor can never delete another contractor's lead.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await context.params;

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing required lead ID parameter.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    const auth = await requireContractorAuth(['owner', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    const result = await ContractorPersistenceService.deleteLeadRecord(
      auth.businessId,
      leadId
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      deletedLeadId: result.deletedLeadId,
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadDetailAPI:DELETE] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to delete lead.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}


