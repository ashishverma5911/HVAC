import { NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/config/envValidation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Public health check and environment status for uptime monitors and deployment verification.
 * Zero secret revelation: only reports configured/missing booleans and operational state.
 */
export async function GET() {
  try {
    const envStatus = validateEnvironment();

    const responsePayload = {
      status: envStatus.healthy ? 'healthy' : 'degraded',
      timestamp: envStatus.timestamp,
      environment: envStatus.environment,
      version: '1.0.0-pilot',
      services: {
        gemini: {
          status: envStatus.services.gemini.status,
          liveModel: envStatus.services.gemini.model,
        },
        supabase: {
          status: envStatus.services.supabase.status,
          urlConfigured: envStatus.services.supabase.urlConfigured,
        },
      },
      readyForPilot: envStatus.healthy,
    };

    return NextResponse.json(responsePayload, {
      status: envStatus.healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    console.error('[HealthCheck] Unexpected health check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Health check probe failed unexpectedly.',
        readyForPilot: false,
      },
      { status: 500 }
    );
  }
}
