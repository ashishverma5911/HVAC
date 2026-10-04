import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { buildReceptionistTools } from '@/lib/ai/tools';
import { buildReceptionistSystemInstruction } from '@/lib/ai/receptionistPrompt';
import { resolveTenantContext } from '@/lib/auth/tenant';
import { demoLimiter } from '@/lib/security/demoLimiter';
import { logDiagnosticEvent } from '@/lib/diagnostics/logger';
import { createSafeErrorResponse } from '@/lib/errors/safeResponse';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for verifying server environment and Live model configuration
 * without exposing secrets or creating billable tokens.
 */
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

  return NextResponse.json({
    status: apiKey ? 'healthy' : 'unconfigured',
    geminiApiKeyConfigured: !!apiKey && apiKey.trim().length > 0,
    liveModel,
    version: 'v1alpha',
  });
}

/**
 * Creates a short-lived ephemeral token for real-time bidirectional audio sessions.
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  let conversationId = `conv-${Date.now()}`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      return createSafeErrorResponse({
        code: 'AI_SERVICE_UNAVAILABLE',
        userMessage: 'Server configuration error: AI voice service is not configured.',
        status: 503,
      });
    }

    const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

    // 1. Resolve tenant context server-side
    // SAFEGUARD 1: If authenticated user has missing business profile, return 403 (do NOT fall back to demo)
    const tenant = await resolveTenantContext();
    if (!tenant.success) {
      return createSafeErrorResponse({
        code: tenant.category === 'MISSING_BUSINESS_PROFILE' ? 'MISSING_BUSINESS_PROFILE' : 'FORBIDDEN',
        userMessage: tenant.error,
        status: tenant.status,
      });
    }

    // Parse optional body for session metadata
    try {
      const body = await req.json();
      if (body?.conversationId && typeof body.conversationId === 'string') {
        conversationId = body.conversationId;
      }
    } catch {
      // Body is optional
    }

    // 2. Public demo abuse limiter: rate-limit ephemeral token generation for unauthenticated demo sessions
    if (tenant.isDemo) {
      const limitCheck = demoLimiter.recordTokenRequest(conversationId);
      if (!limitCheck.allowed) {
        logDiagnosticEvent({
          event: 'DEMO_RATE_LIMIT_TRIGGERED',
          conversationId,
          isDemo: true,
          error: limitCheck.reason,
        });
        return createSafeErrorResponse({
          code: 'DEMO_LIMIT_EXCEEDED',
          userMessage: limitCheck.reason,
          status: 429,
        });
      }
    }

    // Build dynamic system instruction & tool definitions reflecting contractor configuration
    const systemInstructionText = buildReceptionistSystemInstruction(tenant.config);
    const dynamicTools = buildReceptionistTools(tenant.config);

    // Initialize server-side GoogleGenAI client on v1alpha for ephemeral tokens
    const serverAi = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    // Ephemeral token expiration timestamps:
    // newSessionExpireTime: 2 minutes window to initiate WebSocket connection
    // expireTime: 30 minutes maximum lifetime for active session
    const now = Date.now();
    const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();

    let token: any = null;
    let lastError: unknown = null;

    // Retry loop with backoff for transient network / high-demand failures
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }

        token = await serverAi.authTokens.create({
          config: {
            uses: 1, // Single-use session token
            newSessionExpireTime,
            expireTime,
            liveConnectConstraints: {
              model: liveModel,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Aoede', // Natural conversational voice
                    },
                  },
                },
                systemInstruction: {
                  parts: [{ text: systemInstructionText }],
                },
                tools: [{ functionDeclarations: dynamicTools }],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
              },
            },
          },
        });

        if (token?.name) {
          break;
        }
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTransient =
          errMsg.includes('fetch failed') ||
          errMsg.includes('503') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('ECONNRESET');
        if (!isTransient || attempt === 3) {
          break;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    if (!token?.name) {
      const errMsg = lastError instanceof Error ? lastError.message : 'Failed to generate token';
      logDiagnosticEvent({
        event: 'REQUEST_FAILED',
        businessId: tenant.businessId,
        conversationId,
        isDemo: tenant.isDemo,
        durationMs,
        error: errMsg,
      });

      return createSafeErrorResponse({
        code: 'TOKEN_GENERATION_FAILED',
        userMessage: 'Unable to establish live audio session. Please check your connection and retry.',
        status: 502,
        internalError: lastError,
      });
    }

    // Log diagnostic event with zero secrets or unmasked PII
    logDiagnosticEvent({
      event: 'VOICE_TOKEN_ISSUED',
      businessId: tenant.businessId,
      conversationId,
      isDemo: tenant.isDemo,
      durationMs,
      details: {
        model: liveModel,
        hasTokenName: !!token.name,
      },
    });

    // Return ONLY the token name and model metadata. NEVER return or expose GEMINI_API_KEY.
    return NextResponse.json({
      token: token.name,
      model: liveModel,
      expireTime: token.expireTime || expireTime,
      conversationId,
      businessId: tenant.businessId || tenant.config.id,
      businessName: tenant.config.name,
      isDemo: tenant.isDemo,
      durationMs,
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logDiagnosticEvent({
      event: 'REQUEST_FAILED',
      conversationId,
      durationMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return createSafeErrorResponse({
      code: 'INTERNAL_SERVER_ERROR',
      userMessage: 'An unexpected error occurred while initializing voice session.',
      status: 500,
      internalError: error,
    });
  }
}
