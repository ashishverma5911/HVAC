import * as crypto from 'crypto';

export interface StreamCorrelationClaims {
  callSid: string;
  calledPhone: string;
  callerPhone: string;
  businessId: string;
}

/**
 * Computes the official Twilio HMAC-SHA1 base64 signature for a webhook URL and form parameters.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string> = {}
): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += `${key}${params[key] ?? ''}`;
  }
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(data, 'utf8');
  return hmac.digest('base64');
}

function timingSafeCompareSignatures(provided: string, expected: string): boolean {
  try {
    const sigBuffer = Buffer.from(provided.trim(), 'utf8');
    const expectedBuffer = Buffer.from(expected.trim(), 'utf8');
    if (sigBuffer.length === 0 || sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Validates that an incoming HTTP request originated from Twilio.
 * Uses the official Twilio HMAC-SHA1 signature verification algorithm.
 *
 * @param authToken - Twilio Auth Token (from TWILIO_AUTH_TOKEN)
 * @param twilioSignature - Value of the 'X-Twilio-Signature' header
 * @param url - The full URL that Twilio called (e.g. https://domain.com/api/telephony/twilio/voice)
 * @param params - POST body key-value pairs (form parameters)
 */
export function validateTwilioWebhookSignature(
  authToken: string,
  twilioSignature: string | null | undefined,
  url: string,
  params: Record<string, string> = {}
): boolean {
  if (!authToken) {
    if (process.env.NODE_ENV === 'production' || process.env.TWILIO_STRICT_SIGNATURE === 'true') {
      console.error('[Twilio Security] CRITICAL: TWILIO_AUTH_TOKEN is missing in production.');
      return false;
    }
    // In local dev without Twilio credentials, reject explicitly forged test signatures if provided
    if (twilioSignature && twilioSignature.trim().length > 0) {
      return false;
    }
    console.warn('[Twilio Security] TWILIO_AUTH_TOKEN is not set. Webhook signature validation skipped.');
    return true;
  }

  if (!twilioSignature) {
    return false;
  }

  try {
    const expectedSignature = computeTwilioSignature(authToken, url, params);
    return timingSafeCompareSignatures(twilioSignature, expectedSignature);
  } catch (err) {
    console.error('[Twilio Security] Error validating signature:', err);
    return false;
  }
}

/**
 * Validates a Twilio webhook signature across candidate public URLs
 * (supporting both Vercel frontend webhook URLs and Railway telephony webhook URLs).
 */
export function validateTwilioWebhookMultiUrl(
  authToken: string | undefined | null,
  twilioSignature: string | null | undefined,
  candidateUrls: string[],
  params: Record<string, string> = {},
  options?: { strictMode?: boolean }
): {
  valid: boolean;
  matchedUrl?: string;
  reason?: string;
} {
  const token = (authToken ?? process.env.TWILIO_AUTH_TOKEN ?? '').trim();
  const isStrict =
    options?.strictMode === true ||
    process.env.NODE_ENV === 'production' ||
    process.env.TWILIO_STRICT_SIGNATURE === 'true';

  if (!token) {
    if (isStrict) {
      console.error('[Twilio Security] CRITICAL: TWILIO_AUTH_TOKEN is missing in strict/production mode.');
      return { valid: false, reason: 'MISSING_TWILIO_AUTH_TOKEN' };
    }
    if (twilioSignature && twilioSignature.trim().length > 0) {
      return { valid: false, reason: 'INVALID_TWILIO_SIGNATURE' };
    }
    console.warn('[Twilio Security] TWILIO_AUTH_TOKEN is not set. Webhook signature validation skipped.');
    return { valid: true, matchedUrl: candidateUrls[0] };
  }

  if (!twilioSignature || twilioSignature.trim().length === 0) {
    return { valid: false, reason: 'MISSING_SIGNATURE_HEADER' };
  }

  const uniqueUrls = Array.from(
    new Set(
      candidateUrls
        .map((u) => u?.trim())
        .filter((u): u is string => Boolean(u && u.length > 0))
    )
  );

  for (const candidateUrl of uniqueUrls) {
    const expected = computeTwilioSignature(token, candidateUrl, params);
    if (timingSafeCompareSignatures(twilioSignature, expected)) {
      return { valid: true, matchedUrl: candidateUrl };
    }
  }

  return { valid: false, reason: 'INVALID_TWILIO_SIGNATURE' };
}

/**
 * Resolves candidate public URLs for an incoming webhook request so signature validation
 * works seamlessly behind Vercel, Railway, or reverse proxies.
 */
export function resolveWebhookCandidateUrls(
  requestUrl: string,
  headers: { get?(name: string): string | null } | Record<string, string | string[] | undefined>,
  configuredWebhookUrl?: string
): string[] {
  const getHeader = (name: string): string | null => {
    if (typeof (headers as { get?: (n: string) => string | null }).get === 'function') {
      return (headers as { get: (n: string) => string | null }).get(name);
    }
    const rec = headers as Record<string, string | string[] | undefined>;
    const val = rec[name] ?? rec[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || null;
    return val || null;
  };

  const candidates: string[] = [];
  if (configuredWebhookUrl) {
    candidates.push(configuredWebhookUrl);
  }
  if (requestUrl && /^https?:\/\//i.test(requestUrl)) {
    candidates.push(requestUrl);
  }

  try {
    const parsed = new URL(
      requestUrl.startsWith('http')
        ? requestUrl
        : `https://localhost${requestUrl.startsWith('/') ? '' : '/'}${requestUrl}`
    );
    const pathnameAndSearch = `${parsed.pathname}${parsed.search}`;
    const forwardedProto = (getHeader('x-forwarded-proto') || 'https').split(',')[0].trim();
    const forwardedHost = (getHeader('x-forwarded-host') || getHeader('host') || '')
      .split(',')[0]
      .trim();

    if (forwardedHost) {
      candidates.push(`${forwardedProto}://${forwardedHost}${pathnameAndSearch}`);
      candidates.push(`https://${forwardedHost}${pathnameAndSearch}`);
      candidates.push(`http://${forwardedHost}${pathnameAndSearch}`);
    }

    const vercelUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '');
    if (vercelUrl) {
      candidates.push(`${vercelUrl}${pathnameAndSearch}`);
    }

    const railwayHttpUrl = process.env.PUBLIC_HTTP_BASE_URL?.trim()?.replace(/\/$/, '');
    if (railwayHttpUrl) {
      candidates.push(`${railwayHttpUrl}${pathnameAndSearch}`);
    }
  } catch {
    // Ignore malformed URL parsing
  }

  return Array.from(new Set(candidates));
}

function getStreamSigningSecret(explicitSecret?: string): string {
  return (
    explicitSecret?.trim() ||
    process.env.TWILIO_AUTH_TOKEN?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'aeris-telephony-stream-signing-secret-dev'
  );
}

/**
 * Generates an HMAC-SHA256 correlation token binding a CallSid, destination number,
 * and resolved contractor businessId so the WebSocket Media Stream start event
 * can verify tenant authenticity even across split Vercel -> Railway processes.
 */
export function createStreamCorrelationToken(
  claims: StreamCorrelationClaims,
  explicitSecret?: string
): string {
  const normalizedCalled = (claims.calledPhone || '').replace(/\D/g, '').slice(-10);
  const canonical = `${claims.callSid}|${normalizedCalled}|${claims.businessId}`;
  return crypto
    .createHmac('sha256', getStreamSigningSecret(explicitSecret))
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Verifies an HMAC-SHA256 stream correlation token from a Twilio Media Stream `start` event.
 */
export function verifyStreamCorrelationToken(
  token: string | null | undefined,
  claims: StreamCorrelationClaims,
  explicitSecret?: string
): boolean {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return false;
  }
  const expected = createStreamCorrelationToken(claims, explicitSecret);
  try {
    const providedBuf = Buffer.from(token.trim(), 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (providedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

