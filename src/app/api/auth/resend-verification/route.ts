import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateEmailAddress } from '@/lib/validation/emailValidation';
import { getEmailCallbackUrl, sanitizeRedirectPath } from '@/lib/auth/redirectUrl';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/resend-verification
 * Resends the account verification email with strict email validation,
 * rate limit handling, and production redirect URL resolution.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { email, next } = body || {};

    // 1. Strict Server-Side Email Validation
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

    // 2. Construct Production Email Callback URL
    const safeNext = sanitizeRedirectPath(next, '/dashboard');
    const emailRedirectTo = getEmailCallbackUrl(safeNext);

    // 3. Dispatch resend request to Supabase Auth
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: emailResult.normalizedEmail,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      // Handle Supabase 60-second rate-limiting
      if (msg.includes('rate') || msg.includes('60 seconds') || error.status === 429) {
        return NextResponse.json(
          {
            error: 'For security purposes, you can only request a new verification email once every 60 seconds. Please check your spam folder or wait a moment.',
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        );
      }

      console.warn('[ResendVerification] Supabase resend warning:', error.message);
      // For privacy and user-enumeration defense, return safe guidance message
      return NextResponse.json({
        success: true,
        message: 'If an account exists for this email, a new confirmation link has been sent.',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'A new verification link has been sent to your email. Please check your inbox and spam folder.',
    });
  } catch (err: unknown) {
    console.error('[ResendVerification] Unexpected error:', err);
    return NextResponse.json(
      {
        error: 'Unable to send verification email at this time. Please try again.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
