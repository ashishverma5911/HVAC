import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAppBaseUrl, sanitizeRedirectPath } from '@/lib/auth/redirectUrl';
import { type EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /auth/callback
 * Handles Supabase email verification confirmation, PKCE code exchange, and OTP token verification.
 * Strictly guarantees redirects point to the production domain and never to localhost.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const baseUrl = getAppBaseUrl();

  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = sanitizeRedirectPath(rawNext, '/dashboard');

  // Supabase error parameters (e.g. expired, revoked, or already-used tokens)
  const authError = requestUrl.searchParams.get('error');
  const errorCode = requestUrl.searchParams.get('error_code');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // 1. Handle error parameters returned directly from Supabase Auth
  if (authError || errorCode) {
    console.warn(`[AuthCallback] Supabase Auth error encountered: ${errorCode || authError} - ${errorDescription}`);
    const loginRedirect = new URL('/login', baseUrl);
    loginRedirect.searchParams.set('error', 'verification_failed');
    loginRedirect.searchParams.set('error_code', errorCode || authError || 'expired');
    loginRedirect.searchParams.set(
      'error_description',
      errorDescription || 'Your verification link is invalid or has expired. Please request a new verification email.'
    );
    return NextResponse.redirect(loginRedirect);
  }

  // 2. PKCE Code Exchange Flow
  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('[AuthCallback] Code exchange failed:', error.message);
        const loginRedirect = new URL('/login', baseUrl);
        loginRedirect.searchParams.set('error', 'verification_failed');
        loginRedirect.searchParams.set('error_code', 'code_exchange_failed');
        loginRedirect.searchParams.set(
          'error_description',
          error.message.includes('expired')
            ? 'This confirmation code has expired. Please request a new confirmation email.'
            : 'Could not verify your email address. Please try signing in or requesting a new confirmation link.'
        );
        return NextResponse.redirect(loginRedirect);
      }

      // Success: redirect to login page with clear verified status and safe redirect target
      const verifiedRedirect = new URL('/login', baseUrl);
      verifiedRedirect.searchParams.set('verified', 'true');
      if (safeNext !== '/dashboard') {
        verifiedRedirect.searchParams.set('redirect', safeNext);
      }
      return NextResponse.redirect(verifiedRedirect);
    } catch (err: unknown) {
      console.error('[AuthCallback] Unexpected error during code exchange:', err);
      const loginRedirect = new URL('/login', baseUrl);
      loginRedirect.searchParams.set('error', 'verification_failed');
      loginRedirect.searchParams.set('error_description', 'An unexpected error occurred during verification.');
      return NextResponse.redirect(loginRedirect);
    }
  }

  // 3. Token Hash (OTP / Magic Link / Email Confirmation) Flow
  if (tokenHash && type) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        console.error('[AuthCallback] Token hash verification failed:', error.message);
        const loginRedirect = new URL('/login', baseUrl);
        loginRedirect.searchParams.set('error', 'verification_failed');
        loginRedirect.searchParams.set('error_code', 'token_verification_failed');
        loginRedirect.searchParams.set(
          'error_description',
          error.message.includes('expired')
            ? 'Your verification token has expired. Please request a new verification email.'
            : 'Could not verify your email token. Please request a new confirmation link.'
        );
        return NextResponse.redirect(loginRedirect);
      }

      // Success: redirect to login page with clear verified status
      const verifiedRedirect = new URL('/login', baseUrl);
      verifiedRedirect.searchParams.set('verified', 'true');
      if (safeNext !== '/dashboard') {
        verifiedRedirect.searchParams.set('redirect', safeNext);
      }
      return NextResponse.redirect(verifiedRedirect);
    } catch (err: unknown) {
      console.error('[AuthCallback] Unexpected error during OTP verification:', err);
      const loginRedirect = new URL('/login', baseUrl);
      loginRedirect.searchParams.set('error', 'verification_failed');
      loginRedirect.searchParams.set('error_description', 'An unexpected error occurred during verification.');
      return NextResponse.redirect(loginRedirect);
    }
  }

  // 4. Fallback: No authorization parameters supplied, return to login page
  const defaultRedirect = new URL('/login', baseUrl);
  return NextResponse.redirect(defaultRedirect);
}
