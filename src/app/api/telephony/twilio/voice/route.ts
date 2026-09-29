import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhookSignature } from '@/lib/telephony/twilioSecurity';
import { getTelephonyEndpoints } from '@/lib/telephony/telephonyConfig';

export const dynamic = 'force-dynamic';

function buildTwiml(streamUrl: string, callerPhone: string, calledPhone: string): string {
  const safeCaller = callerPhone.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeCalled = calledPhone.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callerPhone" value="${safeCaller}" />
      <Parameter name="calledPhone" value="${safeCalled}" />
    </Stream>
  </Connect>
</Response>`;
}

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const searchParams = new URLSearchParams(rawText);
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      params[k] = v;
    });

    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const twilioSignature = req.headers.get('x-twilio-signature');
    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const isSecure = proto === 'https';

    const endpoints = getTelephonyEndpoints(host, isSecure);

    // Validate signature against the public webhook URL
    if (authToken && !validateTwilioWebhookSignature(authToken, twilioSignature, endpoints.webhookUrl, params)) {
      console.warn('[Next.js Twilio Route] Rejected invalid Twilio signature for URL:', endpoints.webhookUrl);
      return new NextResponse('Forbidden: Invalid Twilio Signature', { status: 403 });
    }

    const callerPhone = params.From || '';
    const calledPhone = params.To || '';

    // Stream URL points to the dedicated WebSocket server (PUBLIC_WS_BASE_URL or port 8080)
    const twiml = buildTwiml(endpoints.streamUrl, callerPhone, calledPhone);

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Next.js Twilio Route] Error handling voice webhook:', msg);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const isSecure = proto === 'https';
  const endpoints = getTelephonyEndpoints(host, isSecure);

  const twiml = buildTwiml(endpoints.streamUrl, '+15550000000', '+15550000001');

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
