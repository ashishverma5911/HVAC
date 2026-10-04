import { NextResponse } from 'next/server';

export type SafeErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'MISSING_BUSINESS_PROFILE'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'TOKEN_GENERATION_FAILED'
  | 'DATABASE_UNAVAILABLE'
  | 'DEMO_LIMIT_EXCEEDED'
  | 'INTERNAL_SERVER_ERROR';

interface SafeErrorOptions {
  code: SafeErrorCode;
  userMessage?: string;
  status?: number;
  internalError?: unknown;
  correlationId?: string;
}

const DEFAULT_MESSAGES: Record<SafeErrorCode, { message: string; status: number }> = {
  UNAUTHENTICATED: {
    message: 'Authentication required. Please sign in to continue.',
    status: 401,
  },
  FORBIDDEN: {
    message: 'Access denied. You do not have permission to perform this action.',
    status: 403,
  },
  NOT_FOUND: {
    message: 'The requested resource was not found or access is denied.',
    status: 404,
  },
  INVALID_INPUT: {
    message: 'The request contains invalid or incomplete data.',
    status: 400,
  },
  MISSING_BUSINESS_PROFILE: {
    message: 'No active contractor profile found for this user account. Please complete onboarding.',
    status: 403,
  },
  AI_SERVICE_UNAVAILABLE: {
    message: 'The AI voice service is temporarily unavailable. Please try again shortly.',
    status: 503,
  },
  TOKEN_GENERATION_FAILED: {
    message: 'Unable to establish a secure real-time audio session. Please retry in a few moments.',
    status: 502,
  },
  DATABASE_UNAVAILABLE: {
    message: 'Contractor data services are temporarily unreachable. Please retry.',
    status: 503,
  },
  DEMO_LIMIT_EXCEEDED: {
    message: 'Public demo session limit reached. Please refresh to start a fresh demo session.',
    status: 429,
  },
  INTERNAL_SERVER_ERROR: {
    message: 'An unexpected server error occurred. Please try again later.',
    status: 500,
  },
};

/**
 * Creates a sanitized, production-safe JSON error response.
 * Never leaks stack traces, database schema specifics, or raw provider exceptions.
 */
export function createSafeErrorResponse(options: SafeErrorOptions): NextResponse {
  const defaults = DEFAULT_MESSAGES[options.code] || DEFAULT_MESSAGES.INTERNAL_SERVER_ERROR;
  const status = options.status || defaults.status;
  const message = options.userMessage || defaults.message;

  // Log internal error safely on the server side
  if (options.internalError) {
    const rawMsg =
      options.internalError instanceof Error
        ? options.internalError.message
        : String(options.internalError);
    console.error(`[SAFE_ERROR:${options.code}] (status: ${status})`, rawMsg);
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
      code: options.code,
      correlationId: options.correlationId,
    },
    { status }
  );
}
