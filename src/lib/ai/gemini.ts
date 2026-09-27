import { GoogleGenAI } from '@google/genai';

/**
 * Default Gemini model ID.
 * Defaults to current stable gemini-3.8-flash per project specification.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

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
 * Sanitizes errors returned by Gemini SDK to ensure no internal keys
 * or raw stack traces leak to the client.
 */
export function formatGeminiError(err: unknown): { message: string; status: number } {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('unauthorized')) {
      return {
        message: 'The configured Gemini API key is invalid. Please verify GEMINI_API_KEY in your .env.local file.',
        status: 401,
      };
    }

    if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('rate limit')) {
      return {
        message: 'The AI service is experiencing high request volume. Please wait a moment and try again.',
        status: 429,
      };
    }

    if (msg.includes('not found') || msg.includes('model')) {
      return {
        message: `The specified Gemini model (${getGeminiModel()}) could not be accessed. Please check GEMINI_MODEL setting.`,
        status: 404,
      };
    }

    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('network')) {
      return {
        message: 'The connection to the AI service timed out. Please check your network and try again.',
        status: 504,
      };
    }

    // Pass through custom user-facing validation errors
    if (err.message.startsWith('Gemini API key is not configured')) {
      return {
        message: err.message,
        status: 503,
      };
    }
  }

  return {
    message: 'An unexpected error occurred while communicating with the AI receptionist. Please try again.',
    status: 500,
  };
}
