import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractExtendedSettingsMetadata } from '@/lib/services/contractorConfigMapper';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({
      authenticated: false,
      hasBusiness: false,
      onboardingCompleted: false,
      onboardingStep: 1,
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
        onboardingCompleted: false,
        onboardingStep: 1,
        isConfigured: true,
      });
    }

    const admin = createAdminClient();

    // Check if user has an associated business profile
    const { data: member, error: memberError } = await admin
      .from('users')
      .select('business_id, role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError || !member || !member.business_id) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: (user.user_metadata?.full_name as string) || null,
        },
        hasBusiness: false,
        onboardingCompleted: false,
        onboardingStep: 2,
        isConfigured: true,
      });
    }

    // Fetch business & settings details to check if onboarding is completed or a resumable draft
    const [{ data: business }, { data: settings }] = await Promise.all([
      admin
        .from('businesses')
        .select('id, name, slug')
        .eq('id', member.business_id)
        .maybeSingle(),
      admin
        .from('business_settings')
        .select('business_hours, industry_config')
        .eq('business_id', member.business_id)
        .maybeSingle(),
    ]);

    const ext = extractExtendedSettingsMetadata(
      settings?.business_hours,
      settings?.industry_config
    );

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: member.full_name || (user.user_metadata?.full_name as string) || null,
      },
      hasBusiness: true,
      onboardingCompleted: ext.onboardingCompleted,
      onboardingStep: ext.onboardingStep,
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
        onboardingCompleted: false,
        onboardingStep: 1,
        isConfigured: true,
        error: 'Failed to verify session.',
      },
      { status: 500 }
    );
  }
}
