/**
 * Strict and secure RFC 5322-compliant email validation utility.
 * Validates email syntax on both client and server before submitting to Supabase Auth.
 */

export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail: string;
  error?: string;
}

// RFC 5322 compliant regex for standard email syntax validation
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates an email address and returns descriptive validation results.
 * Enforces trimming, length limits, structural rules, and standard domain formats.
 */
export function validateEmailAddress(rawEmail: unknown): EmailValidationResult {
  if (typeof rawEmail !== 'string') {
    return {
      valid: false,
      normalizedEmail: '',
      error: 'Please enter a valid email address.',
    };
  }

  const trimmed = rawEmail.trim();

  if (!trimmed) {
    return {
      valid: false,
      normalizedEmail: '',
      error: 'Email address is required.',
    };
  }

  // RFC 5321 length limit
  if (trimmed.length > 254) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Email address cannot exceed 254 characters.',
    };
  }

  // Must contain exactly one '@'
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Please enter a valid email address (e.g. name@example.com).',
    };
  }

  const [localPart, domainPart] = parts;

  // Local part rules
  if (localPart.length === 0 || localPart.length > 64) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'The username part of your email must be between 1 and 64 characters.',
    };
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Email address cannot contain leading, trailing, or consecutive dots.',
    };
  }

  // Domain part rules
  if (!domainPart || domainPart.length < 3 || !domainPart.includes('.')) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Please include a valid domain name with an extension (e.g. example.com).',
    };
  }

  if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.includes('..')) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Email domain cannot contain leading, trailing, or consecutive dots.',
    };
  }

  const domainLabels = domainPart.split('.');
  const tld = domainLabels[domainLabels.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Email address has an invalid domain extension (e.g. .com, .net).',
    };
  }

  // Check against RFC 5322 regex
  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      error: 'Please enter a valid email address (e.g. name@example.com).',
    };
  }

  return {
    valid: true,
    normalizedEmail: trimmed.toLowerCase(),
  };
}

/**
 * Returns true if the email address satisfies strict email syntax requirements.
 */
export function isValidEmailAddress(rawEmail: unknown): boolean {
  return validateEmailAddress(rawEmail).valid;
}
