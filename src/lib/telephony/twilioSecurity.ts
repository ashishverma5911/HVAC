import * as crypto from 'crypto';

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
    // If no auth token is configured (e.g. local dev without Twilio credentials), skip check with warning
    console.warn('[Twilio Security] TWILIO_AUTH_TOKEN is not set. Webhook signature validation skipped.');
    return true;
  }

  if (!twilioSignature) {
    return false;
  }

  try {
    // 1. Sort parameter keys alphabetically
    const sortedKeys = Object.keys(params).sort();

    // 2. Concatenate URL with sorted key-value pairs
    let data = url;
    for (const key of sortedKeys) {
      data += `${key}${params[key]}`;
    }

    // 3. Compute HMAC-SHA1 with authToken
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(data, 'utf8');
    const expectedSignature = hmac.digest('base64');

    // 4. Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(twilioSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (err) {
    console.error('[Twilio Security] Error validating signature:', err);
    return false;
  }
}
