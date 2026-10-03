import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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

    // 2. Resolve business_id from user profile
    const { data: member, error: memberError } = await supabase
      .from('users')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json(
        { error: 'User does not belong to an active contractor organization.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const businessId = member.business_id;
    const admin = createAdminClient();

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
      .eq('business_id', businessId);

    return NextResponse.json({
      success: true,
      lead,
      appointments: appointments || [],
    });
  } catch (err: unknown) {
    console.error('[ContractorLeadDetailAPI] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve lead details.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
