import { NextRequest, NextResponse } from 'next/server';
import { CallSessionManager } from '@/lib/telephony/callSessionManager';
import { getTelephonyEndpoints } from '@/lib/telephony/telephonyConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionManager = CallSessionManager.getInstance();
  const activeSessions = sessionManager.getAllActiveSessions();
  const recentSessions = sessionManager.getRecentSessionsSummary();

  const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
  const maskedTwilioNumber = twilioNumber.length > 5
    ? `${twilioNumber.substring(0, 5)}***${twilioNumber.substring(twilioNumber.length - 2)}`
    : (twilioNumber ? 'Configured' : 'Not Configured');

  const host = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const endpoints = getTelephonyEndpoints(host, proto === 'https');

  let activeCallCount = activeSessions.length;
  const mergedRecentSessions = [...recentSessions];
  let bridgeReachable: boolean | undefined = undefined;

  // When PUBLIC_WS_BASE_URL points to the dedicated Railway telephony server,
  // merge live call telemetry so the Vercel frontend displays real-time PSTN call status.
  const configuredWsBase = process.env.PUBLIC_WS_BASE_URL?.trim();
  if (configuredWsBase) {
    try {
      const remoteHttpBase = configuredWsBase
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/+$/, '');
      const remoteUrl = new URL(`${remoteHttpBase}/api/telephony/status`);

      if (remoteUrl.host !== host) {
        const remoteRes = await fetch(remoteUrl.toString(), {
          signal: AbortSignal.timeout(2500),
          cache: 'no-store',
        });
        if (remoteRes.ok) {
          const remoteData = await remoteRes.json();
          bridgeReachable = true;
          if (typeof remoteData.activeCallCount === 'number') {
            activeCallCount += remoteData.activeCallCount;
          }
          if (Array.isArray(remoteData.recentSessions)) {
            const existingIds = new Set(mergedRecentSessions.map((s) => s.sessionId));
            for (const rs of remoteData.recentSessions) {
              if (rs && rs.sessionId && !existingIds.has(rs.sessionId)) {
                mergedRecentSessions.push(rs);
              }
            }
          }
        } else {
          bridgeReachable = false;
        }
      }
    } catch {
      bridgeReachable = false;
    }
  }

  return NextResponse.json({
    status: 'online',
    timestamp: Date.now(),
    activeCallCount,
    bridgeReachable,
    twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    twilioPhoneNumber: maskedTwilioNumber,
    publicHttpBaseUrl: endpoints.publicHttpBaseUrl,
    publicWsBaseUrl: endpoints.publicWsBaseUrl,
    webhookUrl: endpoints.webhookUrl,
    streamUrl: endpoints.streamUrl,
    isReadyForRealTwilio: endpoints.isReadyForRealTwilio,
    missingConfig: endpoints.missingConfig,
    maxCallDurationSeconds: parseInt(process.env.MAX_CALL_DURATION_SECONDS || '300', 10),
    recentSessions: mergedRecentSessions,
  });
}
