/**
 * Customer PII and Secret Masking Utilities.
 * Ensures operational logs never contain full unmasked phone numbers,
 * full street addresses, raw customer credentials, or provider secrets.
 */

/**
 * Masks a phone number, preserving area code and last 2 digits for operational triage.
 * e.g., "+1 (555) 234-5678" -> "+1 (555) ***-**78"
 * e.g., "555-234-5678" -> "555-***-**78"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return '***';

  const last4 = cleaned.slice(-4);
  const prefix = cleaned.slice(0, Math.max(0, cleaned.length - 8));
  return `${prefix}***-**${last4.slice(-2)}`;
}

/**
 * Masks a street address, preserving only general city or state if present.
 * e.g., "123 Main Street, Plano, TX" -> "*** Main Street, Plano, TX"
 */
export function maskAddress(address?: string | null): string {
  if (!address || typeof address !== 'string') return '';
  const trimmed = address.trim();
  // Replace leading street numbers
  return trimmed.replace(/^\d+[\s\w]*?\s/i, '*** ');
}

/**
 * Masks a customer name.
 * e.g., "Jane Smith" -> "J*** S***"
 */
export function maskName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 1 ? `${part[0]}***` : part))
    .join(' ');
}

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'key',
  'apikey',
  'api_key',
  'authorization',
  'systeminstruction',
  'system_instruction',
  'systemprompt',
  'audio',
  'audiostream',
  'pcm',
  'base64audio',
]);

/**
 * Recursively scrubs an arbitrary payload before outputting to server logs.
 */
export function sanitizeLogPayload(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogPayload(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED_SECRET]';
      continue;
    }

    if (lowerKey === 'phone' || lowerKey.includes('phone')) {
      sanitized[key] = typeof value === 'string' ? maskPhone(value) : '[MASKED_PHONE]';
      continue;
    }

    if (lowerKey === 'customername' || lowerKey === 'customer_name' || lowerKey === 'name') {
      sanitized[key] = typeof value === 'string' ? maskName(value) : '[MASKED_NAME]';
      continue;
    }

    if (lowerKey === 'serviceaddress' || lowerKey === 'service_address' || lowerKey === 'address') {
      sanitized[key] = typeof value === 'string' ? maskAddress(value) : '[MASKED_ADDRESS]';
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogPayload(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
