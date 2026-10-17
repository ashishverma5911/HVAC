import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl, sanitizeRedirectPath } from '@/lib/auth/redirectUrl';
import { type EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Safely verifies whether the user's email address has been confirmed in the Supabase database.
 * Used to provide reliable evidence before asserting to the user that verification succeeded.
 */
async function checkEmailConfirmedStatus(email?: string | null): Promise<boolean> {
  if (!email || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    const admin = createAdminClient();
    const cleanEmail = email.trim().toLowerCase();

    // Query users to verify confirmation timestamp
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 4) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
      if (error || !data?.users || data.users.length === 0) {
        break;
      }
      const match = data.users.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (match) {
        return Boolean(match.email_confirmed_at);
      }
      if (data.users.length < 50) {
        hasMore = false;
      } else {
        page++;
      }
    }
    return false;
  } catch (err) {
    console.warn('[AuthCallback] Failed to verify email confirmed status in database:', err);
    return false;
  }
}

/**
 * GET /auth/callback
 * Handles Supabase email verification confirmation, PKCE code exchange, and OTP token verification.
 * Gracefully handles cross-device mobile confirmations where email is verified by Supabase
 * but the initiating PKCE code verifier cookie was stored on another device/browser.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const baseUrl = getAppBaseUrl();

  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = sanitizeRedirectPath(rawNext, '/dashboard');
  const emailHint = requestUrl.searchParams.get('email');

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

    const isExpiredOrUsed =
      errorCode === 'otp_expired' ||
      errorDescription?.toLowerCase().includes('expired') ||
      errorDescription?.toLowerCase().includes('already');

    loginRedirect.searchParams.set(
      'error_description',
      isExpiredOrUsed
        ? 'Your verification link has expired or has already been used. If your account is already verified, please sign in below. Otherwise, request a new verification email.'
        : errorDescription || 'Your verification link is invalid or has expired.'
    );

    if (emailHint) {
      loginRedirect.searchParams.set('email', emailHint);
    }
    return NextResponse.redirect(loginRedirect);
  }

  // 2. PKCE Code Exchange Flow (Email Confirmation Link Redirect)
  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      // Case 2A: Same-device / same-browser PKCE code exchange succeeded
      if (!error && data?.session) {
        console.log('[AuthCallback] PKCE session exchange succeeded on same device');
        const verifiedRedirect = new URL('/login', baseUrl);
        verifiedRedirect.searchParams.set('verified', 'true');
        verifiedRedirect.searchParams.set('session', 'active');
        if (emailHint) {
          verifiedRedirect.searchParams.set('email', emailHint);
        }
        if (safeNext !== '/dashboard') {
          verifiedRedirect.searchParams.set('redirect', safeNext);
        }
        return NextResponse.redirect(verifiedRedirect);
      }

      // Case 2B: PKCE code exchange failed
      // Distinguish cross-device / missing code_verifier / mail scanner consumption
      const errMsg = error?.message?.toLowerCase() || '';
      const isMissingVerifier =
        error?.name === 'AuthPKCECodeVerifierMissingError' ||
        (error as any)?.code === 'pkce_code_verifier_not_found' ||
        errMsg.includes('code verifier') ||
        errMsg.includes('different browser or device');

      const isAlreadyConsumedOrInvalid =
        errMsg.includes('already been used') ||
        errMsg.includes('invalid grant') ||
        errMsg.includes('invalid code') ||
        errMsg.includes('bad_code_verifier') ||
        errMsg.includes('code is invalid');

      if (isMissingVerifier || isAlreadyConsumedOrInvalid) {
        // SECURITY REQUIREMENT: A missing PKCE verifier alone must NOT automatically
        // be treated as proof that email verification succeeded.
        // Check for reliable evidence that the user's email is confirmed in the database.
        const isReliablyConfirmed = await checkEmailConfirmedStatus(emailHint);

        if (isReliablyConfirmed) {
          console.log(
            `[AuthCallback] Confirmed email status verified in database for ${emailHint}. Session exchange deferred (cross-device).`
          );
          const verifiedRedirect = new URL('/login', baseUrl);
          verifiedRedirect.searchParams.set('verified', 'true');
          verifiedRedirect.searchParams.set('notice', 'cross_device');
          if (emailHint) {
            verifiedRedirect.searchParams.set('email', emailHint);
          }
          if (safeNext !== '/dashboard') {
            verifiedRedirect.searchParams.set('redirect', safeNext);
          }
          return NextResponse.redirect(verifiedRedirect);
        }

        // Verification cannot be established (missing PKCE verifier without confirmed email status).
        // Display a neutral message asking the user to sign in or request a fresh verification email.
        console.log(
          `[AuthCallback] Missing PKCE verifier without confirmed email evidence for ${emailHint || 'unknown'}. Routing to neutral sign-in notice.`
        );
        const neutralRedirect = new URL('/login', baseUrl);
        neutralRedirect.searchParams.set('notice', 'unverified_device');
        if (emailHint) {
          neutralRedirect.searchParams.set('email', emailHint);
        }
        if (safeNext !== '/dashboard') {
          neutralRedirect.searchParams.set('redirect', safeNext);
        }
        return NextResponse.redirect(neutralRedirect);
      }

      // Case 2C: Unrecognized fatal error
      console.error('[AuthCallback] Unrecognized code exchange error:', error?.message);
      const loginRedirect = new URL('/login', baseUrl);
      loginRedirect.searchParams.set('error', 'verification_failed');
      loginRedirect.searchParams.set('error_code', (error as any)?.code || 'code_exchange_failed');
      loginRedirect.searchParams.set(
        'error_description',
        error?.message?.includes('expired')
          ? 'This confirmation link has expired. Please request a new confirmation email.'
          : 'Could not complete automatic sign-in. Please sign in with your password.'
      );
      if (emailHint) {
        loginRedirect.searchParams.set('email', emailHint);
      }
      return NextResponse.redirect(loginRedirect);
    } catch (err: unknown) {
      console.error('[AuthCallback] Unexpected error during code exchange:', err);
      const loginRedirect = new URL('/login', baseUrl);
      loginRedirect.searchParams.set('error', 'verification_failed');
      loginRedirect.searchParams.set(
        'error_description',
        'An unexpected error occurred during verification. Please try signing in.'
      );
      if (emailHint) {
        loginRedirect.searchParams.set('email', emailHint);
      }
      return NextResponse.redirect(loginRedirect);
    }
  }

  // 3. Token Hash (OTP / Magic Link / Email Confirmation) Flow
  if (tokenHash && type) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
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
            ? 'Your verification token has expired or was already used. If your account is verified, please sign in.'
            : 'Could not verify your email token. Please request a new confirmation link.'
        );
        if (emailHint) {
          loginRedirect.searchParams.set('email', emailHint);
        }
        return NextResponse.redirect(loginRedirect);
      }

      // Success: redirect to login page with clear verified status
      const verifiedRedirect = new URL('/login', baseUrl);
      verifiedRedirect.searchParams.set('verified', 'true');
      if (data?.session) {
        verifiedRedirect.searchParams.set('session', 'active');
      }
      if (emailHint) {
        verifiedRedirect.searchParams.set('email', emailHint);
      }
      if (safeNext !== '/dashboard') {
        verifiedRedirect.searchParams.set('redirect', safeNext);
      }
      return NextResponse.redirect(verifiedRedirect);
    } catch (err: unknown) {
      console.error('[AuthCallback] Unexpected error during OTP verification:', err);
      const loginRedirect = new URL('/login', baseUrl);
      loginRedirect.searchParams.set('error', 'verification_failed');
      loginRedirect.searchParams.set('error_description', 'An unexpected error occurred during verification.');
      if (emailHint) {
        loginRedirect.searchParams.set('email', emailHint);
      }
      return NextResponse.redirect(loginRedirect);
    }
  }

  // 4. Fallback: No authorization parameters supplied, return to login page
  const defaultRedirect = new URL('/login', baseUrl);
  return NextResponse.redirect(defaultRedirect);
}
