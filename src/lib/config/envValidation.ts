/**
 * Production environment validation helper.
 * Validates presence, format, and readiness of critical server and client variables
 * WITHOUT EVER exposing secret values or credentials.
 */

export interface EnvValidationResult {
  healthy: boolean;
  timestamp: string;
  environment: string;
  services: {
    gemini: {
      configured: boolean;
      model: string;
      status: 'ready' | 'missing_key';
    };
    supabase: {
      clientConfigured: boolean;
      adminConfigured: boolean;
      status: 'ready' | 'missing_credentials' | 'client_only';
      urlConfigured: boolean;
    };
  };
  missingRequiredServerSecrets: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingSecrets: string[] = [];
  if (!geminiKey || geminiKey.trim().length === 0) {
    missingSecrets.push('GEMINI_API_KEY');
  }
  if (!supabaseUrl || supabaseUrl.trim().length === 0) {
    missingSecrets.push('NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey || supabaseAnonKey.trim().length === 0) {
    missingSecrets.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (!supabaseServiceKey || supabaseServiceKey.trim().length === 0) {
    missingSecrets.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  const geminiReady = !!geminiKey && geminiKey.trim().length > 0;
  const supabaseClientReady = !!supabaseUrl && !!supabaseAnonKey;
  const supabaseAdminReady = supabaseClientReady && !!supabaseServiceKey;

  const supabaseStatus = supabaseAdminReady
    ? 'ready'
    : supabaseClientReady
    ? 'client_only'
    : 'missing_credentials';

  return {
    healthy: geminiReady && supabaseAdminReady,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      gemini: {
        configured: geminiReady,
        model: geminiModel,
        status: geminiReady ? 'ready' : 'missing_key',
      },
      supabase: {
        clientConfigured: supabaseClientReady,
        adminConfigured: !!supabaseServiceKey,
        status: supabaseStatus,
        urlConfigured: !!supabaseUrl && supabaseUrl.startsWith('https://'),
      },
    },
    missingRequiredServerSecrets: missingSecrets,
  };
}
