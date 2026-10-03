import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { buildReceptionistTools } from '@/lib/ai/tools';
import { buildReceptionistSystemInstruction } from '@/lib/ai/receptionistPrompt';
import { resolveTenantContext } from '@/lib/auth/tenant';

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
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'Server configuration error: GEMINI_API_KEY is not configured in .env.local.',
          category: 'MISSING_API_KEY',
        },
        { status: 500 }
      );
    }

    const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

    // 1. Resolve tenant context server-side
    // SAFEGUARD 1: If authenticated user has missing business profile, return 403 (do NOT fall back to demo)
    const tenant = await resolveTenantContext();
    if (!tenant.success) {
      return NextResponse.json(
        { error: tenant.error, category: tenant.category },
        { status: tenant.status }
      );
    }

    // Parse optional body for session metadata
    let conversationId = `conv-${Date.now()}`;
    try {
      const body = await req.json();
      if (body?.conversationId && typeof body.conversationId === 'string') {
        conversationId = body.conversationId;
      }
    } catch {
      // Body is optional
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
          console.log(`[Live Token API] Retry attempt ${attempt}/3 after transient error...`);
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
        console.warn(`[Live Token API] Attempt ${attempt} failed:`, errMsg);
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
      let category = 'UPSTREAM_GEMINI_ERROR';
      if (errMsg.includes('fetch failed') || errMsg.includes('ETIMEDOUT') || errMsg.includes('network')) {
        category = 'FETCH_TIMEOUT_OR_NETWORK';
      } else if (errMsg.includes('API key') || errMsg.includes('401') || errMsg.includes('403')) {
        category = 'INVALID_API_KEY';
      } else if (errMsg.includes('model') || errMsg.includes('404')) {
        category = 'UNSUPPORTED_LIVE_MODEL';
      }

      console.error(`[Live Token API] Token generation failed (${category}) in ${durationMs}ms:`, errMsg);
      return NextResponse.json(
        {
          error: `Failed to initialize voice session token (${category}): ${errMsg}`,
          category,
          model: liveModel,
          durationMs,
        },
        { status: 500 }
      );
    }

    // Development-only diagnostic logging (Zero secrets or PII logged)
    console.log(`[Live Token API] Ephemeral token created successfully in ${durationMs}ms:`, {
      status: 200,
      tokenCreated: true,
      model: liveModel,
      newSessionExpireTime,
      expireTime,
      hasTokenName: !!token.name,
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
    const message = error instanceof Error ? error.message : 'Failed to generate live token';
    console.error('[Live Token API] Unexpected error generating ephemeral token:', message);
    return NextResponse.json(
      {
        error: `Failed to initialize voice session token (UNEXPECTED_ERROR): ${message}`,
        category: 'UNEXPECTED_ERROR',
        durationMs,
      },
      { status: 500 }
    );
  }
}
