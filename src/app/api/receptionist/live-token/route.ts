import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { RECEPTIONIST_TOOLS } from '@/lib/ai/tools';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '@/lib/ai/receptionistPrompt';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not configured.' },
        { status: 500 }
      );
    }

    const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

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

    // Initialize server-side GoogleGenAI client on v1alpha for ephemeral tokens
    const serverAi = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    // Create a short-lived ephemeral token strictly locked to voice receptionist constraints
    const token = await serverAi.authTokens.create({
      config: {
        uses: 1, // Single-use session token
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
              parts: [{ text: SUMMIT_HVAC_SYSTEM_INSTRUCTION }],
            },
            tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      },
    });

    if (!token?.name) {
      throw new Error('Failed to generate ephemeral token from Gemini Live API.');
    }

    // Return ONLY the token name and model. NEVER return or expose GEMINI_API_KEY.
    return NextResponse.json({
      token: token.name,
      model: liveModel,
      expireTime: token.expireTime,
      conversationId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate live token';
    console.error('[Live Token API] Error generating ephemeral token:', message);
    return NextResponse.json(
      { error: 'Failed to initialize voice session token.' },
      { status: 500 }
    );
  }
}
