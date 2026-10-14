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
    telephony: {
      twilioConfigured: boolean;
      publicWsConfigured: boolean;
      status: 'ready' | 'not_configured';
      missingConfig: string[];
    };
  };
  missingRequiredServerSecrets: string[];
  readyForLivePstn: boolean;
}

export function validateEnvironment(): EnvValidationResult {
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const publicWsBaseUrl = process.env.PUBLIC_WS_BASE_URL;

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

  const missingTelephonyConfig: string[] = [];
  if (!twilioAccountSid || twilioAccountSid.trim().length === 0) {
    missingTelephonyConfig.push('TWILIO_ACCOUNT_SID');
  }
  if (!twilioAuthToken || twilioAuthToken.trim().length === 0) {
    missingTelephonyConfig.push('TWILIO_AUTH_TOKEN');
  }
  if (!twilioPhoneNumber || twilioPhoneNumber.trim().length === 0) {
    missingTelephonyConfig.push('TWILIO_PHONE_NUMBER');
  }
  if (!publicWsBaseUrl || publicWsBaseUrl.trim().length === 0) {
    missingTelephonyConfig.push('PUBLIC_WS_BASE_URL');
  }

  const geminiReady = !!geminiKey && geminiKey.trim().length > 0;
  const supabaseClientReady = !!supabaseUrl && !!supabaseAnonKey;
  const supabaseAdminReady = supabaseClientReady && !!supabaseServiceKey;
  const twilioConfigured =
    !!twilioAccountSid &&
    twilioAccountSid.trim().length > 0 &&
    !!twilioAuthToken &&
    twilioAuthToken.trim().length > 0;
  const publicWsConfigured = !!publicWsBaseUrl && publicWsBaseUrl.trim().length > 0;
  const telephonyReady =
    twilioConfigured &&
    publicWsConfigured &&
    !!twilioPhoneNumber &&
    twilioPhoneNumber.trim().length > 0;

  const supabaseStatus = supabaseAdminReady
    ? 'ready'
    : supabaseClientReady
    ? 'client_only'
    : 'missing_credentials';

  const coreHealthy = geminiReady && supabaseAdminReady;

  return {
    healthy: coreHealthy,
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
      telephony: {
        twilioConfigured,
        publicWsConfigured,
        status: telephonyReady ? 'ready' : 'not_configured',
        missingConfig: missingTelephonyConfig,
      },
    },
    missingRequiredServerSecrets: missingSecrets,
    readyForLivePstn: coreHealthy && telephonyReady,
  };
}
