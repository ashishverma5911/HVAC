/**
 * Centralized configuration and validation for Twilio Telephony integration.
 * Supports distinct public endpoints for HTTP webhooks vs WebSocket audio streams.
 */

export interface TelephonyPublicEndpoints {
  publicHttpBaseUrl: string | null;
  publicWsBaseUrl: string | null;
  webhookUrl: string;
  streamUrl: string;
  isReadyForRealTwilio: boolean;
  missingConfig: string[];
}

/**
 * Normalizes a URL into a clean hostname or origin without trailing slashes.
 */
function cleanUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Resolves the public HTTP and WebSocket URLs based on environment variables and request context.
 * 
 * Priority:
 * 1. Dedicated PUBLIC_HTTP_BASE_URL / PUBLIC_WS_BASE_URL
 * 2. Legacy PUBLIC_BASE_URL fallback (if provided)
 * 3. Request host / localhost fallback (for local simulation)
 */
export function getTelephonyEndpoints(reqHost?: string | null, isSecureProto: boolean = false): TelephonyPublicEndpoints {
  const envHttp = cleanUrl(process.env.PUBLIC_HTTP_BASE_URL);
  const envWs = cleanUrl(process.env.PUBLIC_WS_BASE_URL);
  const legacyBase = cleanUrl(process.env.PUBLIC_BASE_URL);
  const telPort = process.env.TELEPHONY_PORT || '8080';

  // 1. Resolve HTTP base URL
  let resolvedHttp = envHttp;
  if (!resolvedHttp && legacyBase) {
    resolvedHttp = legacyBase;
  }

  // 2. Resolve WebSocket base URL
  let resolvedWs = envWs;
  if (!resolvedWs && legacyBase) {
    resolvedWs = legacyBase;
  }

  const missingConfig: string[] = [];
  if (!envHttp && !legacyBase) {
    missingConfig.push('PUBLIC_HTTP_BASE_URL is not set (required for Twilio voice webhook)');
  }
  if (!envWs && !legacyBase) {
    missingConfig.push('PUBLIC_WS_BASE_URL is not set (required for Twilio <Stream> WebSocket)');
  }

  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!twilioAuthToken) {
    missingConfig.push('TWILIO_AUTH_TOKEN is not set (required for signature validation)');
  }

  const isReadyForRealTwilio = missingConfig.length === 0;

  // Build Webhook URL (HTTP / HTTPS)
  let webhookUrl: string;
  if (resolvedHttp) {
    const proto = resolvedHttp.startsWith('http://') ? 'http://' : 'https://';
    const cleanHost = resolvedHttp.replace(/^https?:\/\//, '');
    webhookUrl = `${proto}${cleanHost}/api/telephony/twilio/voice`;
  } else {
    const host = reqHost || 'localhost:3000';
    const proto = isSecureProto ? 'https://' : 'http://';
    webhookUrl = `${proto}${host}/api/telephony/twilio/voice`;
  }

  // Build Stream URL (WS / WSS) - Points to standalone WebSocket server
  let streamUrl: string;
  if (resolvedWs) {
    const cleanHost = resolvedWs.replace(/^(wss?|https?):\/\//, '');
    streamUrl = `wss://${cleanHost}/api/telephony/twilio-stream`;
  } else {
    // Local dev fallback: point to telephony server port (8080)
    const hostWithoutPort = (reqHost || 'localhost').split(':')[0];
    const wsProto = isSecureProto ? 'wss://' : 'ws://';
    streamUrl = `${wsProto}${hostWithoutPort}:${telPort}/api/telephony/twilio-stream`;
  }

  return {
    publicHttpBaseUrl: resolvedHttp,
    publicWsBaseUrl: resolvedWs,
    webhookUrl,
    streamUrl,
    isReadyForRealTwilio,
    missingConfig,
  };
}
