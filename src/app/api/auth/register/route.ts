import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateEmailAddress } from '@/lib/validation/emailValidation';
import { getEmailCallbackUrl, sanitizeRedirectPath } from '@/lib/auth/redirectUrl';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register
 * Server-side registration endpoint with strict email syntax validation,
 * credential safety checks, and production callback URL resolution.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { email, password, fullName, next } = body || {};

    // 1. Strict Server-Side Email Validation (never rely only on client)
    const emailResult = validateEmailAddress(email);
    if (!emailResult.valid) {
      return NextResponse.json(
        {
          error: emailResult.error || 'Please enter a valid email address.',
          code: 'INVALID_EMAIL',
        },
        { status: 400 }
      );
    }

    // 2. Password Validation
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        {
          error: 'Password must be at least 6 characters long.',
          code: 'INVALID_PASSWORD',
        },
        { status: 400 }
      );
    }

    // 3. Name Sanitization
    const trimmedFullName = typeof fullName === 'string' ? fullName.trim() : '';

    // 4. Construct Production Email Callback URL
    const safeNext = sanitizeRedirectPath(next, '/dashboard');
    const emailRedirectTo = getEmailCallbackUrl(safeNext);

    // 5. Submit to Supabase Auth via SSR Server Client
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: emailResult.normalizedEmail,
      password,
      options: {
        data: {
          full_name: trimmedFullName,
        },
        emailRedirectTo,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      // Handle duplicate user registration gracefully
      if (
        msg.includes('already registered') ||
        msg.includes('already exists') ||
        error.status === 422
      ) {
        return NextResponse.json(
          {
            error: 'An account with this email address already exists. Please sign in or reset your password.',
            code: 'USER_ALREADY_EXISTS',
          },
          { status: 409 }
        );
      }

      // Handle rate limits
      if (msg.includes('rate') || error.status === 429) {
        return NextResponse.json(
          {
            error: 'Too many registration attempts. Please wait a few minutes before trying again.',
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        );
      }

      // Safe error response without exposing database internals
      return NextResponse.json(
        {
          error: error.message || 'Registration failed. Please verify your credentials.',
          code: 'REGISTRATION_FAILED',
        },
        { status: 400 }
      );
    }

    // Handle Supabase User Enumeration Protection:
    // If user already exists and enumeration protection is enabled, Supabase returns an empty identities array.
    if (data?.user?.identities && data.user.identities.length === 0) {
      return NextResponse.json({
        success: true,
        requiresVerification: true,
        duplicate: true,
        message:
          'If an account does not already exist, a confirmation link has been sent to your email. If you already have an account, please sign in.',
      });
    }

    const requiresVerification = !data?.session;

    return NextResponse.json({
      success: true,
      requiresVerification,
      user: {
        id: data?.user?.id,
        email: data?.user?.email || emailResult.normalizedEmail,
      },
      message: requiresVerification
        ? 'Account registered! Please check your email inbox to confirm your account before signing in.'
        : 'Account created successfully! Redirecting...',
    });
  } catch (err: unknown) {
    console.error('[AuthRegister] Unexpected error during registration:', err);
    return NextResponse.json(
      {
        error: 'An unexpected error occurred during registration. Please try again.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
