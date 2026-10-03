import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase environment is not configured.', code: 'UNCONFIGURED' },
      { status: 503 }
    );
  }

  try {
    // 1. Authenticate caller strictly via Supabase Auth Session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to access contractor dashboard.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    // 2. Resolve business_id from verified user profile
    const { data: member, error: memberError } = await supabase
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
    const admin = createAdminClient();

    // 3. Query contractor business details
    const { data: business } = await admin
      .from('businesses')
      .select('id, name, slug, phone, city, state')
      .eq('id', businessId)
      .maybeSingle();

    // 4. Aggregated Queries Scoped Strictly to Verified businessId
    const [callsRes, leadsRes, apptsRes, urgentRes, recentLeadsRes] = await Promise.all([
      // Total calls / conversations
      admin
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      // Total leads
      admin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      // Total appointment requests (strictly status 'requested')
      admin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      // Urgent & emergency requests
      admin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .in('urgency', ['urgent', 'emergency']),

      // Recent leads (up to 10)
      admin
        .from('leads')
        .select('id, customer_name, phone, service_address, city_area, service_type, reported_issue, urgency, status, created_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      success: true,
      business: {
        id: businessId,
        name: business?.name || 'Contractor Organization',
        slug: business?.slug || '',
        phone: business?.phone || '',
        city: business?.city || '',
        state: business?.state || '',
      },
      metrics: {
        totalCalls: callsRes.count || 0,
        totalLeads: leadsRes.count || 0,
        appointmentsRequested: apptsRes.count || 0,
        urgentRequests: urgentRes.count || 0,
      },
      recentLeads: recentLeadsRes.data || [],
    });
  } catch (err: unknown) {
    console.error('[ContractorDashboardAPI] Error loading dashboard data:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve contractor dashboard data.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
