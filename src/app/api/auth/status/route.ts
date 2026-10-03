import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({
      authenticated: false,
      hasBusiness: false,
      isConfigured: false,
      message: 'Supabase credentials not configured in environment.',
    });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        authenticated: false,
        hasBusiness: false,
        isConfigured: true,
      });
    }

    // Check if user has an associated business profile
    const { data: member, error: memberError } = await supabase
      .from('users')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
        },
        hasBusiness: false,
        isConfigured: true,
      });
    }

    // Fetch business basic details
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, slug')
      .eq('id', member.business_id)
      .maybeSingle();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
      hasBusiness: true,
      businessId: member.business_id,
      businessName: business?.name || null,
      businessSlug: business?.slug || null,
      role: member.role,
      isConfigured: true,
    });
  } catch (error: unknown) {
    console.error('[AuthStatus] Failed to retrieve auth status:', error);
    return NextResponse.json(
      {
        authenticated: false,
        hasBusiness: false,
        isConfigured: true,
        error: 'Failed to verify session.',
      },
      { status: 500 }
    );
  }
}
