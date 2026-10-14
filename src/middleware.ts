import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from '@/lib/supabase/types';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase credentials are not configured, allow requests through for local sandbox / preview
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh user session and get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. DASHBOARD, SETTINGS & LEADS ACCESS CONTROL
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings') || pathname.startsWith('/leads')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check business profile
    const { data: member } = await supabase
      .from('users')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!member || !member.business_id) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = '/onboarding';
      return NextResponse.redirect(onboardingUrl);
    }
  }

  // 2. ONBOARDING ACCESS CONTROL
  if (pathname.startsWith('/onboarding')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', '/onboarding');
      return NextResponse.redirect(loginUrl);
    }

    // If user already has a business, check if onboarding is still incomplete (draft) or explicitly resuming
    const { data: member } = await supabase
      .from('users')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle();

    if (member && member.business_id) {
      const resumeParam = request.nextUrl.searchParams.get('resume');
      if (resumeParam === '1') {
        return supabaseResponse;
      }

      const { data: settings } = await supabase
        .from('business_settings')
        .select('business_hours')
        .eq('business_id', member.business_id)
        .maybeSingle();

      const rawHours =
        settings?.business_hours && typeof settings.business_hours === 'object'
          ? (settings.business_hours as Record<string, unknown>)
          : {};

      // Allow staying on /onboarding if onboardingCompleted is explicitly false (resuming incomplete onboarding)
      if (rawHours.onboardingCompleted === false) {
        return supabaseResponse;
      }

      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // 3. LOGIN PAGE REDIRECTION (If already authenticated)
  if (pathname === '/login') {
    if (user) {
      const { data: member } = await supabase
        .from('users')
        .select('business_id')
        .eq('id', user.id)
        .maybeSingle();

      const rawRedirectParam = request.nextUrl.searchParams.get('redirect');
      const safeRedirectPath =
        rawRedirectParam &&
        rawRedirectParam.startsWith('/') &&
        !rawRedirectParam.startsWith('//') &&
        !rawRedirectParam.startsWith('/\\')
          ? rawRedirectParam.split('?')[0]
          : '/dashboard';
      const targetUrl = request.nextUrl.clone();

      if (member && member.business_id) {
        const { data: settings } = await supabase
          .from('business_settings')
          .select('business_hours')
          .eq('business_id', member.business_id)
          .maybeSingle();

        const rawHours =
          settings?.business_hours && typeof settings.business_hours === 'object'
            ? (settings.business_hours as Record<string, unknown>)
            : {};

        if (rawHours.onboardingCompleted === false) {
          targetUrl.pathname = '/onboarding';
        } else {
          targetUrl.pathname = safeRedirectPath || '/dashboard';
        }
      } else {
        targetUrl.pathname = '/onboarding';
      }
      targetUrl.searchParams.delete('redirect');
      return NextResponse.redirect(targetUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match dashboard, settings, onboarding, login routes, and exclude static assets
     */
    '/dashboard/:path*',
    '/settings/:path*',
    '/leads/:path*',
    '/onboarding/:path*',
    '/login',
  ],
};
