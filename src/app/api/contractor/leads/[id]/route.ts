import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LeadStatus } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: LeadStatus[] = ['new', 'qualified', 'appointment_requested', 'transferred', 'completed'];

/**
 * GET /api/contractor/leads/[id]
 * Retrieves lead details, associated appointments, and conversation history + audit events.
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

    // 1. Authenticate caller session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to inspect lead details.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    // 2. Resolve business_id from user profile
    const { data: member, error: memberError } = await admin
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json(
        { error: 'User does not belong to an active contractor organization.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const businessId = member.business_id;

    // 3. Query lead strictly scoped by verified businessId
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (leadError || !lead) {
      // Return 404 to avoid leaking whether another contractor's lead exists
      return NextResponse.json(
        { error: 'Lead not found or access denied.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 4. Query associated appointments for this lead
    const { data: appointments } = await admin
      .from('appointments')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    // 5. Query associated conversation
    let convData = null;
    let messages: Array<{ id: string; sender: string; text: string; created_at: string }> = [];
    let auditEvents: Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }> = [];

    if (lead.conversation_id) {
      const { data: conv } = await admin
        .from('conversations')
        .select('*')
        .eq('id', lead.conversation_id)
        .eq('business_id', businessId)
        .maybeSingle();

      convData = conv;
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

      convData = convFallback;
    }

    if (convData) {
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

    return NextResponse.json({
      success: true,
      lead,
      appointments: appointments || [],
      conversation: convData
        ? {
            id: convData.id,
            channel: convData.channel,
            status: convData.status,
            started_at: convData.started_at,
            ended_at: convData.ended_at,
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
 * Updates lead status with strict server-side validation.
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

    // 1. Authenticate caller session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to update lead status.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    // 2. Resolve business_id from user profile
    const { data: member, error: memberError } = await admin
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json(
        { error: 'User does not belong to an active contractor organization.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const businessId = member.business_id;

    // 3. Parse and validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { status } = (body || {}) as { status?: string };
    const cleanStatus = status?.trim().toLowerCase();

    if (!cleanStatus || !(VALID_STATUSES as string[]).includes(cleanStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status "${status}". Allowed values: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS',
        },
        { status: 400 }
      );
    }

    // 4. Update lead scoped by verifiedBusinessId
    const now = new Date().toISOString();
    const { data: updatedLead, error: updateError } = await admin
      .from('leads')
      .update({
        status: cleanStatus as LeadStatus,
        updated_at: now,
      })
      .eq('id', leadId)
      .eq('business_id', businessId)
      .select('*')
      .maybeSingle();

    if (updateError || !updatedLead) {
      return NextResponse.json(
        { error: 'Lead not found or access denied.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Lead status updated to ${cleanStatus}.`,
      lead: updatedLead,
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadDetailAPI:PATCH] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to update lead status.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
