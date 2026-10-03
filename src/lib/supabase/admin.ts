import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

/**
 * Creates an administrative Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 *
 * CRITICAL SECURITY ARCHITECTURE RULES:
 * 1. This client must ONLY be instantiated and called on the server.
 * 2. Service-role queries BYPASS Row Level Security (RLS).
 * 3. All caller authorization and business ownership verification MUST be executed
 *    programmatically server-side BEFORE any service-role query or write.
 * 4. Never export, transmit, or leak SUPABASE_SERVICE_ROLE_KEY to browser code.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('FATAL: createAdminClient must never be invoked in client-side / browser code.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment variables.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
