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

  return NextResponse.json({
    status: 'online',
    timestamp: Date.now(),
    activeCallCount: activeSessions.length,
    twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    twilioPhoneNumber: maskedTwilioNumber,
    publicHttpBaseUrl: endpoints.publicHttpBaseUrl,
    publicWsBaseUrl: endpoints.publicWsBaseUrl,
    webhookUrl: endpoints.webhookUrl,
    streamUrl: endpoints.streamUrl,
    isReadyForRealTwilio: endpoints.isReadyForRealTwilio,
    missingConfig: endpoints.missingConfig,
    maxCallDurationSeconds: parseInt(process.env.MAX_CALL_DURATION_SECONDS || '300', 10),
    recentSessions,
  });
}
