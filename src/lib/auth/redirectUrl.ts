/**
 * Authentication URL and redirect management utilities.
 * Ensures production email verification links strictly resolve to https://hvac-pearl-seven.vercel.app
 * and never generate localhost:3000 links in production.
 */

export const PRODUCTION_APP_URL = 'https://hvac-pearl-seven.vercel.app';

/**
 * Returns the resolved application base URL for the current runtime.
 * - In production environments, strictly enforces https://hvac-pearl-seven.vercel.app.
 * - In browser context, uses window.location.origin ONLY when running on localhost in development mode.
 * - Never returns a localhost address if running in production.
 */
export function getAppBaseUrl(): string {
  // 1. Browser context check
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local');

    // Only allow local origin if explicitly in development mode on localhost
    if (isLocalhost && process.env.NODE_ENV === 'development') {
      return window.location.origin;
    }

    // Always fallback to production URL on any deployed/external host
    return PRODUCTION_APP_URL;
  }

  // 2. Server-side context check
  // In development mode only, check if local URL is explicitly requested
  if (process.env.NODE_ENV === 'development') {
    const devUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (devUrl && (devUrl.includes('localhost') || devUrl.includes('127.0.0.1'))) {
      return devUrl.replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  // Production server resolution
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_HTTP_BASE_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '')}`;
  }

  return PRODUCTION_APP_URL;
}

/**
 * Constructs the absolute URL for the email verification callback endpoint (/auth/callback).
 * Guaranteed to use the production domain in production environments.
 * Supports passing safe internal redirect targets and an email hint for pre-filling login forms.
 */
export function getEmailCallbackUrl(nextPath?: string, email?: string): string {
  const base = getAppBaseUrl();
  const url = new URL('/auth/callback', base);
  if (nextPath) {
    const safeNext = sanitizeRedirectPath(nextPath, '/dashboard');
    if (safeNext !== '/dashboard') {
      url.searchParams.set('next', safeNext);
    }
  }
  if (email && typeof email === 'string' && email.trim()) {
    url.searchParams.set('email', email.trim().toLowerCase());
  }
  return url.toString();
}

/**
 * Explicit path allowlist for internal application destinations.
 * Prevents Open Redirect attacks (e.g. //evil.com, /\\evil.com, javascript:, data:).
 */
const ALLOWED_PATH_PREFIXES = [
  '/dashboard',
  '/onboarding',
  '/settings',
  '/leads',
  '/appointments',
  '/calls',
  '/login',
  '/features',
  '/knowledge-base',
  '/',
];

/**
 * Validates and sanitizes a redirect destination against an explicit internal allowlist.
 * If the target is invalid, external, or malformed, falls back safely to defaultFallback.
 */
export function sanitizeRedirectPath(target: unknown, defaultFallback = '/dashboard'): string {
  if (typeof target !== 'string' || !target.trim()) {
    return defaultFallback;
  }

  const trimmed = target.trim();

  // Handle absolute URLs: only permit if matching allowed origin
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const isAllowedOrigin =
        parsed.origin === PRODUCTION_APP_URL ||
        (process.env.NODE_ENV === 'development' &&
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'));

      if (isAllowedOrigin) {
        return sanitizeRedirectPath(parsed.pathname + parsed.search, defaultFallback);
      }
      return defaultFallback;
    } catch {
      return defaultFallback;
    }
  }

  // Reject protocol-relative URLs (//attacker.com) and backslash-relative (/\\attacker.com)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultFallback;
  }

  // Reject embedded protocol schemes (javascript:, data:, vbscript:)
  if (/^[\w-]+:/.test(trimmed)) {
    return defaultFallback;
  }

  // Extract path without search params or hashes for prefix matching
  const pathnameOnly = trimmed.split('?')[0].split('#')[0];

  const isPermitted = ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathnameOnly === prefix || pathnameOnly.startsWith(`${prefix}/`)
  );

  return isPermitted ? trimmed : defaultFallback;
}
