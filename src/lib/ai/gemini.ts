import { GoogleGenAI } from '@google/genai';

/**
 * Default Gemini model ID.
 * Defaults to current stable gemini-3.8-flash per project specification.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Fallback Gemini models when the primary preview model hits free-tier quota limits or high demand.
 */
export const FALLBACK_GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

/**
 * Error categories for Gemini API interactions.
 */
export type GeminiErrorCategory =
  | 'TRANSIENT_RATE_LIMIT'
  | 'TRANSIENT_HIGH_DEMAND'
  | 'TRANSIENT_TIMEOUT'
  | 'TRANSIENT_SERVER_ERROR'
  | 'PERMANENT_AUTHENTICATION'
  | 'PERMANENT_NOT_FOUND'
  | 'PERMANENT_INVALID_REQUEST'
  | 'PERMANENT_CONFIGURATION'
  | 'UNKNOWN';

export interface GeminiErrorClassification {
  isTransient: boolean;
  category: GeminiErrorCategory;
  status: number;
  retryAfterMs?: number;
  userMessage: string;
}

/**
 * Retrieves the configured Gemini model ID.
 */
export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  return model || DEFAULT_GEMINI_MODEL;
}

/**
 * Initializes and returns a GoogleGenAI SDK client instance.
 * Throws a clean, user-friendly error if GEMINI_API_KEY is missing.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env.local file to enable live AI conversations.'
    );
  }

  return new GoogleGenAI({ apiKey });
}

/**
 * Extracts any Retry-After duration in milliseconds provided by the error.
 */
function extractRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;

  const anyErr = err as Record<string, unknown>;

  // 1. Check HTTP response headers if available
  const response = anyErr.response;
  let retryHeader: string | null = null;
  if (response && typeof response === 'object') {
    const headers = (response as Record<string, unknown>).headers;
    if (headers && typeof headers === 'object') {
      const h = headers as Record<string, unknown>;
      if (typeof (h as { get?: unknown }).get === 'function') {
        retryHeader = (h as { get: (k: string) => string | null }).get('retry-after');
      } else if ('retry-after' in h) {
        retryHeader = String(h['retry-after']);
      }
    }
  }

  if (retryHeader) {
    const parsed = parseFloat(retryHeader);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1000);
    }
  }

  // 2. Check Google RPC RetryInfo in error details
  if (Array.isArray(anyErr.details)) {
    for (const item of anyErr.details) {
      if (item && typeof item === 'object') {
        const typeStr = String((item as Record<string, unknown>)['@type'] || '');
        const retryDelay = (item as Record<string, unknown>).retryDelay;
        if (typeStr.includes('RetryInfo') || retryDelay) {
          if (typeof retryDelay === 'string') {
            const match = retryDelay.match(/([\d.]+)s/);
            if (match) {
              return Math.round(parseFloat(match[1]) * 1000);
            }
          } else if (typeof retryDelay === 'object' && retryDelay !== null) {
            const sec = Number((retryDelay as { seconds?: number }).seconds || 0);
            const nanos = Number((retryDelay as { nanos?: number }).nanos || 0);
            return sec * 1000 + Math.round(nanos / 1e6);
          }
        }
      }
    }
  }

  // 3. Check for duration in error message string (e.g., "Please retry in 30.26s")
  if (typeof anyErr.message === 'string') {
    const match = anyErr.message.match(/(?:retry|wait|try again)\s*(?:in|after)?\s*([\d.]+)\s*(s|sec|seconds|ms)/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const ms = unit === 'ms' ? Math.round(val) : Math.round(val * 1000);
      return ms;
    }
  }

  return undefined;
}

/**
 * Classifies a Gemini error into transient or permanent, identifying the status code,
 * error category, retry-after delay (if present), and safe user message.
 */
export function classifyGeminiError(err: unknown): GeminiErrorClassification {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    const anyErr = err as unknown as Record<string, unknown>;
    const rawStatus = typeof anyErr.status === 'number' ? anyErr.status : undefined;
    const retryAfterMs = extractRetryAfterMs(err);

    // 1. Missing configuration (permanent)
    if (err.message.startsWith('Gemini API key is not configured')) {
      return {
        isTransient: false,
        category: 'PERMANENT_CONFIGURATION',
        status: 503,
        userMessage: err.message,
      };
    }

    // 2. Authentication / Permissions (permanent)
    if (
      rawStatus === 401 ||
      rawStatus === 403 ||
      msg.includes('api key not valid') ||
      msg.includes('api_key_invalid') ||
      msg.includes('unauthorized') ||
      msg.includes('permission_denied')
    ) {
      return {
        isTransient: false,
        category: 'PERMANENT_AUTHENTICATION',
        status: 401,
        userMessage: 'The configured Gemini API key is invalid. Please verify GEMINI_API_KEY in your .env.local file.',
      };
    }

    // 3. Model not found (permanent)
    if (
      rawStatus === 404 ||
      msg.includes('model not found') ||
      msg.includes('is not found for api version') ||
      msg.includes('is no longer available')
    ) {
      return {
        isTransient: false,
        category: 'PERMANENT_NOT_FOUND',
        status: 404,
        userMessage: `The specified Gemini model (${getGeminiModel()}) could not be accessed. Please check GEMINI_MODEL setting.`,
      };
    }

    // 4. Invalid Request / Schema error (permanent)
    if (
      rawStatus === 400 ||
      rawStatus === 422 ||
      msg.includes('invalid argument') ||
      msg.includes('bad request') ||
      msg.includes('invalid_argument')
    ) {
      return {
        isTransient: false,
        category: 'PERMANENT_INVALID_REQUEST',
        status: 400,
        userMessage: 'The request to the AI receptionist was invalid.',
      };
    }

    // 5. Rate limit / Quota exceeded (transient)
    if (
      rawStatus === 429 ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests')
    ) {
      return {
        isTransient: true,
        category: 'TRANSIENT_RATE_LIMIT',
        status: 429,
        retryAfterMs,
        userMessage: 'The AI service is experiencing high request volume. Please wait a moment and try again.',
      };
    }

    // 6. High demand / Service unavailable (transient)
    if (
      rawStatus === 503 ||
      msg.includes('high demand') ||
      msg.includes('unavailable') ||
      msg.includes('overloaded')
    ) {
      return {
        isTransient: true,
        category: 'TRANSIENT_HIGH_DEMAND',
        status: 503,
        retryAfterMs,
        userMessage: 'The AI service is temporarily experiencing high demand. Please try sending your message again in a few seconds.',
      };
    }

    // 7. Network Timeout / Gateway timeout (transient)
    if (
      rawStatus === 504 ||
      rawStatus === 408 ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('deadline_exceeded') ||
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset')
    ) {
      return {
        isTransient: true,
        category: 'TRANSIENT_TIMEOUT',
        status: 504,
        retryAfterMs,
        userMessage: 'The connection to the AI service timed out. Please check your network and try again.',
      };
    }

    // 8. Server Error 500 / 502 (transient)
    if (rawStatus === 500 || rawStatus === 502 || msg.includes('internal server error')) {
      return {
        isTransient: true,
        category: 'TRANSIENT_SERVER_ERROR',
        status: rawStatus || 500,
        retryAfterMs,
        userMessage: 'A temporary error occurred while communicating with the AI service. Please try again.',
      };
    }
  }

  return {
    isTransient: false,
    category: 'UNKNOWN',
    status: 500,
    userMessage: 'An unexpected error occurred while communicating with the AI receptionist. Please try again.',
  };
}

/**
 * Sanitizes errors returned by Gemini SDK to ensure no internal keys
 * or raw stack traces leak to the client.
 */
export function formatGeminiError(err: unknown): { message: string; status: number; category: GeminiErrorCategory } {
  const classification = classifyGeminiError(err);
  return {
    message: classification.userMessage,
    status: classification.status,
    category: classification.category,
  };
}
