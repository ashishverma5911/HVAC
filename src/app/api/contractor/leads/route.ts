import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LeadStatus, LeadUrgency } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: LeadStatus[] = ['new', 'qualified', 'appointment_requested', 'transferred', 'completed'];
const VALID_URGENCIES: LeadUrgency[] = ['normal', 'urgent', 'emergency'];

/**
 * GET /api/contractor/leads
 * Retrieves filtered, paginated leads for the authenticated contractor.
 * Strictly derives the target business_id from the session.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate caller session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to view contractor leads.', code: 'UNAUTHENTICATED' },
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
        {
          error: 'User is authenticated but has no associated business profile.',
          code: 'MISSING_BUSINESS_PROFILE',
        },
        { status: 403 }
      );
    }

    const businessId = member.business_id;

    // 3. Parse query parameters
    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get('status')?.trim().toLowerCase();
    const urgencyParam = searchParams.get('urgency')?.trim().toLowerCase();
    const serviceTypeParam = searchParams.get('serviceType')?.trim();
    const cityParam = searchParams.get('city')?.trim();
    const searchParam = searchParams.get('search')?.trim();

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10));
    const offset = (page - 1) * limit;

    // 4. Build scoped query
    let query = admin
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId);

    if (statusParam && (VALID_STATUSES as string[]).includes(statusParam)) {
      query = query.eq('status', statusParam as LeadStatus);
    }

    if (urgencyParam && (VALID_URGENCIES as string[]).includes(urgencyParam)) {
      query = query.eq('urgency', urgencyParam as LeadUrgency);
    }

    if (serviceTypeParam) {
      query = query.eq('service_type', serviceTypeParam);
    }

    if (cityParam) {
      query = query.ilike('city_area', `%${cityParam}%`);
    }

    if (searchParam) {
      // Clean query string for safe ILIKE
      const cleanSearch = searchParam.replace(/[%_,]/g, '');
      if (cleanSearch) {
        query = query.or(`customer_name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,service_address.ilike.%${cleanSearch}%`);
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

    // 5. Fetch associated appointments for these leads
    const appointmentsByLeadId: Record<string, { id: string; requested_date: string; requested_slot: string; status: string }> = {};

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
            status: appt.status,
          };
        }
      }
    }

    // 6. Map leads with appointment payload
    const enrichedLeads = leadList.map((lead) => ({
      ...lead,
      appointment: appointmentsByLeadId[lead.id] || null,
    }));

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
