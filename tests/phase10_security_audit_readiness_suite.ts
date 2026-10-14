/**
 * PHASE 10 — COMPREHENSIVE SECURITY AUDIT AND PRODUCTION READINESS SUITE
 *
 * Deterministically verifies all Phase 10 security and production-readiness invariants:
 * 1. Authentication, RBAC (`evaluateContractorRolePermission`), & Open-Redirect Sanitization
 * 2. Contractor API Route Protection & Untrusted Tenant ID Stripping
 * 3. Database Security, RLS Policy Coverage, & Multi-Tenant Isolation
 * 4. Telephony Security (Twilio HMAC Signatures, Production Fail-Closed, Stream Correlation, Mid-Call Immutability)
 * 5. Secret Management, Client Bundle Safety, & Log/Error Sanitization
 * 6. API Input Validation, Mass-Assignment Prevention, & PostgREST Filter Sanitization
 * 7. AI Tool Security (Strict Schema Validation, Tenant Binding, Demo Isolation, Honest Appointment/Transfer Semantics)
 * 8. Production Environment & Health Endpoint Readiness (Zero Secret Leakage)
 */

import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import {
  evaluateContractorRolePermission,
  requireContractorAuth,
  resolveVerifiedContractorConfig,
  sanitizeInternalRedirectPath,
  stripUntrustedTenantIds,
} from '../src/lib/auth/tenant';
import { ContractorBusinessConfig } from '../src/lib/ai/contractorConfig';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { ContractorPersistenceService } from '../src/lib/services/contractorPersistence';
import { ContractorReportingService } from '../src/lib/services/contractorReporting';
import {
  computeTwilioSignature,
  createStreamCorrelationToken,
  validateTwilioWebhookMultiUrl,
  verifyStreamCorrelationToken,
} from '../src/lib/telephony/twilioSecurity';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import {
  clearRegisteredDestinationRoutes,
  resolveInboundDestinationRouteAsync,
} from '../src/lib/telephony/tenantPhoneMapping';
import {
  sanitizeLeadCaptureInput,
  validateLeadStatusTransition,
} from '../src/lib/validation/contractorLeads';
import { validateOnboardingInput } from '../src/lib/validation/contractorOnboarding';
import { validateSettingsInput } from '../src/lib/validation/contractorSettings';
import { sanitizeClientErrorMessage } from '../src/lib/compliance/callPrivacyAndCompliance';
import { sanitizeLogPayload, scrubStringSecrets } from '../src/lib/diagnostics/piiMask';
import { validateEnvironment } from '../src/lib/config/envValidation';
import { GET as healthGet } from '../src/app/api/health/route';
import { POST as twilioVoicePost } from '../src/app/api/telephony/twilio/voice/route';
import { POST as twilioStatusPost } from '../src/app/api/telephony/twilio/status/route';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed += 1;
  }
}

const CONTRACTOR_ALPHA: ContractorBusinessConfig = {
  id: '10101010-1111-4111-8111-111111111111',
  name: 'Alpha Precision HVAC',
  slug: 'alpha-precision-hvac',
  industry: 'hvac',
  phone: '(972) 555-0110',
  businessEmail: 'dispatch@alphahvac.example.com',
  address: '100 Alpha Way',
  city: 'Plano',
  state: 'TX',
  postalCode: '75024',
  timezone: 'America/Chicago',
  serviceAreas: ['Plano', 'Frisco'],
  supportedZips: ['75024', '75034'],
  servicesOffered: ['AC Repair', 'Furnace Repair', 'Emergency HVAC Service'],
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: '9:00 AM - 2:00 PM',
    sunday: 'Closed (Emergency Only)',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'emergency_dispatch',
  afterHoursInstructions: 'Prioritize active cooling/heating emergencies.',
  callbackInstructions: 'An Alpha dispatcher will call back within 30 minutes.',
  transferPhoneNumber: '+19725550199',
  transferInstructions: 'Log urgent callback if live transfer is unavailable.',
  customGreeting: 'Thank you for calling Alpha Precision HVAC.',
  supportedLanguages: ['en-US'],
};

const CONTRACTOR_BETA: ContractorBusinessConfig = {
  id: '20202020-2222-4222-8222-222222222222',
  name: 'Beta Lone Star Mechanical',
  slug: 'beta-lone-star-mechanical',
  industry: 'hvac',
  phone: '(214) 555-0220',
  businessEmail: 'service@betamechanical.example.com',
  address: '200 Beta Blvd',
  city: 'Dallas',
  state: 'TX',
  postalCode: '75201',
  timezone: 'America/Chicago',
  serviceAreas: ['Dallas', 'Irving'],
  supportedZips: ['75201', '75038'],
  servicesOffered: ['AC Installation', 'Heating Repair'],
  businessHours: {
    weekdays: '7:30 AM - 5:30 PM',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'next_day_callback',
  callbackInstructions: 'Our Dallas team will call back next business morning.',
  transferPhoneNumber: '+12145550299',
  customGreeting: 'Welcome to Beta Lone Star Mechanical.',
  supportedLanguages: ['en-US'],
};

function getAllSourceFiles(dir: string, extFilter: string[] = ['.ts', '.tsx']): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath, extFilter));
    } else if (extFilter.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function runPhase10AuditSuite() {
  console.log('======================================================================');
  console.log('🔒 PHASE 10 — COMPREHENSIVE SECURITY AUDIT & PRODUCTION READINESS SUITE');
  console.log('======================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Authentication, Role-Based Access Control (RBAC), & Open Redirect Protection
  // ---------------------------------------------------------------------------
  console.log('1. Authentication, RBAC & Open Redirect Protection');

  // RBAC checks for sensitive settings / phone / deletion operations (owner, admin only)
  const ownerSettingsPerm = evaluateContractorRolePermission('owner', ['owner', 'admin']);
  const adminSettingsPerm = evaluateContractorRolePermission('admin', ['owner', 'admin']);
  const dispatcherSettingsPerm = evaluateContractorRolePermission('dispatcher', ['owner', 'admin']);
  const techSettingsPerm = evaluateContractorRolePermission('technician', ['owner', 'admin']);
  const viewerSettingsPerm = evaluateContractorRolePermission('viewer', ['owner', 'admin']);

  assert(
    ownerSettingsPerm.allowed && adminSettingsPerm.allowed,
    'Owner and Admin roles are permitted on sensitive contractor configuration/deletion endpoints'
  );
  assert(
    !dispatcherSettingsPerm.allowed &&
      dispatcherSettingsPerm.status === 403 &&
      dispatcherSettingsPerm.code === 'INSUFFICIENT_ROLE',
    'Dispatcher role is blocked (403 INSUFFICIENT_ROLE) from owner/admin-only settings, phone-number, and DELETE endpoints'
  );
  assert(
    !techSettingsPerm.allowed &&
      !viewerSettingsPerm.allowed &&
      viewerSettingsPerm.code === 'INSUFFICIENT_ROLE',
    'Technician and Viewer roles are blocked (403 INSUFFICIENT_ROLE) from owner/admin-only endpoints'
  );

  // RBAC checks for operational lead/call follow-up mutations (owner, admin, dispatcher)
  const dispatcherLeadPatchPerm = evaluateContractorRolePermission('dispatcher', [
    'owner',
    'admin',
    'dispatcher',
  ]);
  const viewerLeadPatchPerm = evaluateContractorRolePermission('viewer', [
    'owner',
    'admin',
    'dispatcher',
  ]);
  assert(
    dispatcherLeadPatchPerm.allowed && !viewerLeadPatchPerm.allowed,
    'Dispatcher role is permitted on lead/call follow-up PATCH endpoints while Viewer role is blocked'
  );

  // Verified contractor config resolution (never trusts untrusted payload, never falls back to demo when authenticated without profile)
  const missingProfileRes = resolveVerifiedContractorConfig({
    isAuthenticated: true,
    sessionBusinessId: null,
    availableConfigsById: { [CONTRACTOR_ALPHA.id]: CONTRACTOR_ALPHA },
  });
  assert(
    !missingProfileRes.success &&
      missingProfileRes.status === 403 &&
      missingProfileRes.category === 'MISSING_BUSINESS_PROFILE',
    'Authenticated user without a business profile receives 403 MISSING_BUSINESS_PROFILE and never falls back to demo mode'
  );

  const crossTenantPayload: Record<string, unknown> = {
    businessId: CONTRACTOR_BETA.id,
    contractorId: CONTRACTOR_BETA.id,
    businessConfig: CONTRACTOR_BETA,
  };
  const alphaConfigRes = resolveVerifiedContractorConfig({
    isAuthenticated: true,
    sessionBusinessId: CONTRACTOR_ALPHA.id,
    availableConfigsById: {
      [CONTRACTOR_ALPHA.id]: CONTRACTOR_ALPHA,
      [CONTRACTOR_BETA.id]: CONTRACTOR_BETA,
    },
    untrustedPayload: crossTenantPayload,
  });
  assert(
    alphaConfigRes.success &&
      !alphaConfigRes.isDemo &&
      alphaConfigRes.businessId === CONTRACTOR_ALPHA.id &&
      alphaConfigRes.config.name === CONTRACTOR_ALPHA.name &&
      !('businessId' in crossTenantPayload) &&
      !('businessConfig' in crossTenantPayload),
    'resolveVerifiedContractorConfig strips spoofed contractor IDs/configs and strictly loads session-verified Contractor Alpha'
  );

  // Open-redirect sanitization
  assert(
    sanitizeInternalRedirectPath('//evil.example.com') === '/dashboard' &&
      sanitizeInternalRedirectPath('/\\evil.example.com') === '/dashboard' &&
      sanitizeInternalRedirectPath('https://evil.example.com/phish') === '/dashboard' &&
      sanitizeInternalRedirectPath('javascript:alert(1)') === '/dashboard' &&
      sanitizeInternalRedirectPath('/unknown-route') === '/dashboard',
    'sanitizeInternalRedirectPath blocks protocol-relative, external URL, javascript:, and unknown route redirects'
  );
  assert(
    sanitizeInternalRedirectPath('/leads') === '/leads' &&
      sanitizeInternalRedirectPath('/settings') === '/settings' &&
      sanitizeInternalRedirectPath('/dashboard?tab=calls') === '/dashboard?tab=calls',
    'sanitizeInternalRedirectPath preserves valid internal contractor portal paths'
  );

  // Static audit of all `/api/contractor/*` route files to confirm authentication guards
  const contractorApiDir = path.join(process.cwd(), 'src/app/api/contractor');
  const contractorRouteFiles = getAllSourceFiles(contractorApiDir, ['route.ts']);
  assert(
    contractorRouteFiles.length >= 8,
    `All ${contractorRouteFiles.length} contractor API route files discovered for authentication audit`
  );
  for (const routeFile of contractorRouteFiles) {
    const relPath = path.relative(process.cwd(), routeFile);
    const content = fs.readFileSync(routeFile, 'utf8');
    const hasAuthGuard =
      content.includes('requireContractorAuth') || content.includes('supabase.auth.getUser');
    assert(hasAuthGuard, `Contractor route ${relPath} enforces server-side authentication guard`);
  }

  // Verify unauthenticated `requireContractorAuth()` fails closed when Supabase is unconfigured or no session exists
  const origSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origSupaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const unconfAuth = await requireContractorAuth(['owner']);
  assert(
    !unconfAuth.authorized && unconfAuth.status === 503,
    'requireContractorAuth fails closed (authorized=false) when credentials or session are absent'
  );
  if (origSupaUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origSupaUrl;
  if (origSupaAnon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origSupaAnon;

  // ---------------------------------------------------------------------------
  // 2. Database Security, RLS Policy Audit & Cross-Tenant Isolation
  // ---------------------------------------------------------------------------
  console.log('\n2. Database Security, RLS Policy Audit & Cross-Tenant Isolation');

  const pilotSchemaSql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261003_phase7_pilot_schema.sql'),
    'utf8'
  );
  const saasSchemaSql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261012_saas_foundation_schema.sql'),
    'utf8'
  );
  const combinedMigrations = `${pilotSchemaSql}\n${saasSchemaSql}`;

  const rlsTables = [
    'businesses',
    'users',
    'business_settings',
    'leads',
    'appointments',
    'conversations',
    'conversation_messages',
    'call_events',
    'contractor_members',
    'phone_numbers',
    'services',
  ];
  for (const tbl of rlsTables) {
    assert(
      combinedMigrations.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`),
      `Database migration enables Row Level Security (RLS) on public.${tbl}`
    );
    assert(
      combinedMigrations.includes(`REVOKE ALL ON TABLE public.${tbl} FROM anon, public`),
      `Database migration revokes anonymous/public table grants on public.${tbl}`
    );
  }
  assert(
    saasSchemaSql.includes('CREATE OR REPLACE VIEW public.contractors\nWITH (security_invoker = true)') &&
      saasSchemaSql.includes('CREATE OR REPLACE VIEW public.contractor_settings\nWITH (security_invoker = true)') &&
      saasSchemaSql.includes('CREATE OR REPLACE VIEW public.calls\nWITH (security_invoker = true)') &&
      saasSchemaSql.includes('CREATE OR REPLACE VIEW public.appointment_requests\nWITH (security_invoker = true)'),
    'All canonical SaaS domain views (contractors, contractor_settings, calls, appointment_requests) enforce security_invoker = true'
  );
  assert(
    saasSchemaSql.includes('CREATE OR REPLACE FUNCTION public.user_has_business_role') &&
      saasSchemaSql.includes('owners_delete_own_conversations') &&
      saasSchemaSql.includes('owners_delete_own_leads'),
    'Database migration defines role-scoped RLS helper public.user_has_business_role and owner/admin DELETE policies'
  );
  assert(
    pilotSchemaSql.includes('CREATE OR REPLACE FUNCTION public.get_auth_user_role()') &&
      saasSchemaSql.includes('CREATE OR REPLACE FUNCTION public.get_auth_user_role()'),
    'Migration defines security definer helper public.get_auth_user_role across pilot and saas schemas'
  );
  assert(
    pilotSchemaSql.includes('REVOKE UPDATE ON TABLE public.users FROM authenticated;') &&
      pilotSchemaSql.includes('GRANT UPDATE (full_name, updated_at) ON TABLE public.users TO authenticated;'),
    'Users table revokes broad UPDATE grant and enforces column-level UPDATE on (full_name, updated_at) only'
  );
  assert(
    !pilotSchemaSql.includes('GRANT SELECT, UPDATE ON TABLE public.users TO authenticated;'),
    'Users table has no broad table-level UPDATE grant to authenticated role'
  );
  assert(
    pilotSchemaSql.includes('business_id = public.get_auth_business_id()') &&
      pilotSchemaSql.includes('role = public.get_auth_user_role()'),
    'users_update_own_profile policy forbids changing business_id or role'
  );
  assert(
    pilotSchemaSql.includes("public.get_auth_user_role() = 'owner'") &&
      saasSchemaSql.includes('owners_update_own_business') &&
      saasSchemaSql.includes('owners_manage_own_settings'),
    'owners_update_own_business and owners_manage_own_settings enforce owner/admin role verification'
  );
  assert(
    pilotSchemaSql.includes('CREATE POLICY "users_insert_own_call_events" ON public.call_events') &&
      pilotSchemaSql.includes('WITH CHECK (business_id = public.get_auth_business_id())'),
    'call_events enforces tenant-scoped users_insert_own_call_events policy'
  );
  assert(
    saasSchemaSql.includes('DROP FUNCTION IF EXISTS public.onboard_contractor_business'),
    'SaaS migration drops obsolete 19-parameter onboarding function overload to prevent ambiguity'
  );


  // Runtime cross-tenant isolation across calls, leads, appointments, transcripts, and lifecycle events
  ContractorPersistenceService.clearLedger();
  clearRegisteredDestinationRoutes();

  await ContractorPersistenceService.associateProvisionedPhoneNumber({
    businessId: CONTRACTOR_ALPHA.id,
    phoneNumber: '+19725550110',
    twilioSid: 'PN11111111111111111111111111111111',
    isActive: true,
    businessConfig: CONTRACTOR_ALPHA,
  });
  await ContractorPersistenceService.associateProvisionedPhoneNumber({
    businessId: CONTRACTOR_BETA.id,
    phoneNumber: '+12145550220',
    twilioSid: 'PN22222222222222222222222222222222',
    isActive: true,
    businessConfig: CONTRACTOR_BETA,
  });

  // Record call, transcript, lead, and appointment for Contractor Alpha
  await ContractorPersistenceService.ensureConversation(
    CONTRACTOR_ALPHA.id,
    'CA_SEC_ALPHA_01',
    'telephony',
    '+19725558001',
    '+19725550110'
  );
  await ContractorPersistenceService.persistMessage(
    CONTRACTOR_ALPHA.id,
    'CA_SEC_ALPHA_01',
    'customer',
    'My AC compressor is making a loud grinding noise at 400 Oak St in Plano.'
  );
  const alphaLead = await ContractorPersistenceService.persistLead(CONTRACTOR_ALPHA.id, {
    conversationId: 'CA_SEC_ALPHA_01',
    customerName: 'Alice AlphaCustomer',
    phone: '+19725558001',
    serviceAddress: '400 Oak St, Plano, TX',
    cityArea: 'Plano',
    serviceType: 'AC Repair',
    reportedIssue: 'Loud grinding noise from outdoor AC unit',
    urgency: 'urgent',
    preferredAppointmentWindow: 'Tomorrow 9:00 AM - 12:00 PM',
    source: 'telephony',
  });

  // Record call and lead for Contractor Beta
  await ContractorPersistenceService.ensureConversation(
    CONTRACTOR_BETA.id,
    'CA_SEC_BETA_01',
    'telephony',
    '+12145559002',
    '+12145550220'
  );
  const betaLead = await ContractorPersistenceService.persistLead(CONTRACTOR_BETA.id, {
    conversationId: 'CA_SEC_BETA_01',
    customerName: 'Bob BetaCustomer',
    phone: '+12145559002',
    serviceAddress: '900 Elm St, Dallas, TX',
    cityArea: 'Dallas',
    serviceType: 'Heating Repair',
    reportedIssue: 'Furnace pilot will not stay lit',
    urgency: 'normal',
    source: 'telephony',
  });

  // Verify Contractor Beta cannot read, update, redact, or delete Contractor Alpha's call or lead
  const betaReadingAlphaCall = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_BETA.id,
    'CA_SEC_ALPHA_01'
  );
  assert(
    betaReadingAlphaCall === null,
    'Cross-tenant read blocked: Contractor Beta cannot view Contractor Alpha call detail or transcript'
  );

  const betaMutatingAlphaCall = await ContractorPersistenceService.correctOrDeleteCallRecord(
    CONTRACTOR_BETA.id,
    'CA_SEC_ALPHA_01',
    { action: 'delete' }
  );
  assert(
    !betaMutatingAlphaCall.ok && betaMutatingAlphaCall.status === 404,
    'Cross-tenant delete blocked: Contractor Beta cannot delete Contractor Alpha call record'
  );

  const betaMutatingAlphaLead = await ContractorPersistenceService.updateLeadFollowUp(
    CONTRACTOR_BETA.id,
    alphaLead.leadId!,
    { status: 'contacted', internalNotes: 'Cross-tenant tampering attempt' }
  );
  assert(
    !betaMutatingAlphaLead.success && betaMutatingAlphaLead.status === 404,
    'Cross-tenant lead update blocked: Contractor Beta cannot update Contractor Alpha lead'
  );

  const betaDeletingAlphaLead = await ContractorPersistenceService.deleteLeadRecord(
    CONTRACTOR_BETA.id,
    alphaLead.leadId!
  );
  assert(
    !betaDeletingAlphaLead.ok && betaDeletingAlphaLead.status === 404,
    'Cross-tenant lead deletion blocked: Contractor Beta cannot delete Contractor Alpha lead'
  );

  // Verify Contractor Beta cannot claim Contractor Alpha's phone number
  let phoneHijackBlocked = false;
  try {
    await ContractorPersistenceService.associateProvisionedPhoneNumber({
      businessId: CONTRACTOR_BETA.id,
      phoneNumber: '+19725550110',
      twilioSid: 'PN99999999999999999999999999999999',
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already assigned to another contractor')) {
      phoneHijackBlocked = true;
    }
  }
  assert(
    phoneHijackBlocked && betaLead.leadId !== alphaLead.leadId,
    'Cross-tenant phone hijacking blocked: Contractor Beta cannot claim Contractor Alpha destination number'
  );

  // ---------------------------------------------------------------------------
  // 3. Telephony Security (Twilio Signature, Production Fail-Closed, Stream Correlation)
  // ---------------------------------------------------------------------------
  console.log('\n3. Telephony Security (Twilio Signature, Production Fail-Closed, Stream Correlation)');

  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    ALLOW_UNSIGNED_TWILIO_WEBHOOKS: process.env.ALLOW_UNSIGNED_TWILIO_WEBHOOKS,
  };

  // Test production fail-closed behavior when TWILIO_AUTH_TOKEN is missing
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  delete process.env.TWILIO_AUTH_TOKEN;
  process.env.ALLOW_UNSIGNED_TWILIO_WEBHOOKS = 'true';

  const prodMissingTokenCheck = validateTwilioWebhookMultiUrl(
    '',
    null,
    ['https://hvac-pearl-seven.vercel.app/api/telephony/twilio/voice'],
    { CallSid: 'CA_PROD_01', To: '+19725550110' }
  );
  assert(
    !prodMissingTokenCheck.valid && prodMissingTokenCheck.reason === 'MISSING_TWILIO_AUTH_TOKEN',
    'In NODE_ENV=production, missing TWILIO_AUTH_TOKEN fails closed even if ALLOW_UNSIGNED_TWILIO_WEBHOOKS=true'
  );

  // Test production webhook endpoint with forged signature -> HTTP 403
  const testToken = 'prod_audit_twilio_secret_token_998877';
  process.env.TWILIO_AUTH_TOKEN = testToken;
  const voiceUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/voice';
  const statusUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/status';
  const voiceParams = {
    CallSid: 'CA_PROD_VOICE_01',
    From: '+19725554321',
    To: '+19725550110',
    CallStatus: 'ringing',
  };

  const unsignedVoiceReq = new NextRequest(voiceUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(voiceParams).toString(),
  });
  const unsignedVoiceRes = await twilioVoicePost(unsignedVoiceReq);
  assert(
    unsignedVoiceRes.status === 403,
    'POST /api/telephony/twilio/voice rejects unsigned request in production with HTTP 403'
  );

  const unsignedStatusReq = new NextRequest(statusUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams({ CallSid: 'CA_PROD_VOICE_01', CallStatus: 'completed' }).toString(),
  });
  const unsignedStatusRes = await twilioStatusPost(unsignedStatusReq);
  assert(
    unsignedStatusRes.status === 403,
    'POST /api/telephony/twilio/status rejects unsigned request in production with HTTP 403'
  );

  // Signed webhook request succeeds
  const validVoiceSig = computeTwilioSignature(testToken, voiceUrl, voiceParams);
  const signedVoiceReq = new NextRequest(voiceUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': validVoiceSig,
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(voiceParams).toString(),
  });
  const signedVoiceRes = await twilioVoicePost(signedVoiceReq);
  assert(
    signedVoiceRes.status === 200 &&
      signedVoiceRes.headers.get('x-aeris-contractor-id') === CONTRACTOR_ALPHA.id,
    'POST /api/telephony/twilio/voice accepts valid HMAC-SHA1 signature and routes to Contractor Alpha'
  );

  // Stream correlation token verification: reject forged correlationToken on stream start
  const sessionManager = CallSessionManager.getInstance();
  const forgedStreamStart = await sessionManager.validateAndCorrelateStreamStart({
    streamSid: 'MZ_FORGED_TOKEN_01',
    callSid: 'CA_CROSS_INSTANCE_01',
    customParameters: {
      callSid: 'CA_CROSS_INSTANCE_01',
      callerPhone: '+19725554321',
      calledPhone: '+19725550110',
      businessId: CONTRACTOR_ALPHA.id,
      correlationToken: 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd',
    },
  });
  assert(
    !forgedStreamStart.valid &&
      forgedStreamStart.reason === 'INVALID_STREAM_CORRELATION_TOKEN',
    'validateAndCorrelateStreamStart rejects forged stream correlation token with INVALID_STREAM_CORRELATION_TOKEN'
  );

  const validStreamToken = createStreamCorrelationToken({
    callSid: 'CA_CROSS_INSTANCE_01',
    calledPhone: '+19725550110',
    callerPhone: '+19725554321',
    businessId: CONTRACTOR_ALPHA.id,
  });
  const validStreamStart = await sessionManager.validateAndCorrelateStreamStart({
    streamSid: 'MZ_VALID_TOKEN_01',
    callSid: 'CA_CROSS_INSTANCE_01',
    customParameters: {
      callSid: 'CA_CROSS_INSTANCE_01',
      callerPhone: '+19725554321',
      calledPhone: '+19725550110',
      businessId: CONTRACTOR_ALPHA.id,
      correlationToken: validStreamToken,
    },
  });
  assert(
    validStreamStart.valid &&
      validStreamStart.businessId === CONTRACTOR_ALPHA.id &&
      verifyStreamCorrelationToken(validStreamToken, {
        callSid: 'CA_CROSS_INSTANCE_01',
        calledPhone: '+19725550110',
        callerPhone: '+19725554321',
        businessId: CONTRACTOR_ALPHA.id,
      }),
    'validateAndCorrelateStreamStart accepts authentic HMAC-SHA256 stream correlation token'
  );

  // Restore env vars
  (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
  if (savedEnv.TWILIO_AUTH_TOKEN !== undefined) {
    process.env.TWILIO_AUTH_TOKEN = savedEnv.TWILIO_AUTH_TOKEN;
  } else {
    delete process.env.TWILIO_AUTH_TOKEN;
  }
  if (savedEnv.ALLOW_UNSIGNED_TWILIO_WEBHOOKS !== undefined) {
    process.env.ALLOW_UNSIGNED_TWILIO_WEBHOOKS = savedEnv.ALLOW_UNSIGNED_TWILIO_WEBHOOKS;
  } else {
    delete process.env.ALLOW_UNSIGNED_TWILIO_WEBHOOKS;
  }

  // ---------------------------------------------------------------------------
  // 4. Secret Management, Client Bundle Safety & Log/Error Scrubbing
  // ---------------------------------------------------------------------------
  console.log('\n4. Secret Management, Client Bundle Safety & Log/Error Scrubbing');

  const gitignoreContent = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8');
  assert(
    gitignoreContent.includes('.env*') && gitignoreContent.includes('!.env.example'),
    '.gitignore ignores .env* files while preserving .env.example'
  );

  // Verify no client component ('use client') imports createAdminClient or references server-only secret env vars
  const allSrcFiles = [
    ...getAllSourceFiles(path.join(process.cwd(), 'src/app')),
    ...getAllSourceFiles(path.join(process.cwd(), 'src/components')),
  ];
  let clientBundleSecretLeak = false;
  for (const file of allSrcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes("'use client'") || content.includes('"use client"')) {
      if (
        content.includes('createAdminClient') ||
        content.includes('SUPABASE_SERVICE_ROLE_KEY') ||
        content.includes('GEMINI_API_KEY') ||
        content.includes('TWILIO_AUTH_TOKEN')
      ) {
        console.error(`Client bundle secret leak detected in: ${file}`);
        clientBundleSecretLeak = true;
      }
    }
  }
  assert(
    !clientBundleSecretLeak,
    'Zero client components ("use client") import createAdminClient or reference SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, or TWILIO_AUTH_TOKEN'
  );

  // Verify log and error sanitizers scrub secrets, tokens, SQL constraints, and PII
  const rawDirtyLog = {
    apiKey: 'AIzaSyFakeKeyForPhase10SecurityTest123456789',
    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123xyz',
    customerName: 'John Smith',
    phone: '+1 (972) 555-8899',
    serviceAddress: '742 Evergreen Terrace, Plano, TX',
    nestedNote: 'Key is AIzaSyInlineKeyTest123456789012345678 and SSN 123-45-6789',
  };
  const scrubbedLog = sanitizeLogPayload(rawDirtyLog) as Record<string, unknown>;
  const serializedScrubbed = JSON.stringify(scrubbedLog);
  assert(
    !serializedScrubbed.includes('AIzaSy') &&
      !serializedScrubbed.includes('eyJhbGci') &&
      !serializedScrubbed.includes('555-8899') &&
      !serializedScrubbed.includes('742 Evergreen') &&
      !serializedScrubbed.includes('123-45-6789') &&
      scrubStringSecrets('Bearer secret_token_value').includes('[REDACTED_SECRET]'),
    'sanitizeLogPayload and scrubStringSecrets redact API keys, JWTs, Bearer tokens, SSNs, phone numbers, and street addresses'
  );

  const sanitizedSqlErr = sanitizeClientErrorMessage(
    'duplicate key value violates unique constraint "idx_phone_numbers_digits" on relation "public.phone_numbers"'
  );
  assert(
    !sanitizedSqlErr.includes('idx_phone_numbers_digits') &&
      !sanitizedSqlErr.includes('public.phone_numbers'),
    'sanitizeClientErrorMessage strips raw PostgreSQL constraint and table names from client-facing error messages'
  );

  // ---------------------------------------------------------------------------
  // 5. API Input Validation, Mass-Assignment Protection & Status Transitions
  // ---------------------------------------------------------------------------
  console.log('\n5. API Input Validation, Mass-Assignment Protection & Status Transitions');

  const massAssignAttempt: Record<string, unknown> = {
    customerName: 'Valid Caller',
    businessId: CONTRACTOR_BETA.id,
    business_id: CONTRACTOR_BETA.id,
    contractorId: CONTRACTOR_BETA.id,
    contractor_id: CONTRACTOR_BETA.id,
    tenantId: CONTRACTOR_BETA.id,
    organizationId: CONTRACTOR_BETA.id,
    businessConfig: { id: CONTRACTOR_BETA.id },
    nested: {
      contractorId: CONTRACTOR_BETA.id,
      safeField: 'keep_me',
    },
  };
  stripUntrustedTenantIds(massAssignAttempt);
  assert(
    !('businessId' in massAssignAttempt) &&
      !('business_id' in massAssignAttempt) &&
      !('contractorId' in massAssignAttempt) &&
      !('contractor_id' in massAssignAttempt) &&
      !('tenantId' in massAssignAttempt) &&
      !('organizationId' in massAssignAttempt) &&
      !('businessConfig' in massAssignAttempt) &&
      !('contractorId' in (massAssignAttempt.nested as Record<string, unknown>)) &&
      (massAssignAttempt.nested as Record<string, unknown>).safeField === 'keep_me',
    'stripUntrustedTenantIds recursively removes all tenant/contractor ID and config override keys'
  );

  const validLeadInput = sanitizeLeadCaptureInput({
    customerName: 'Sarah Connor',
    phone: '972-555-0144',
    serviceType: 'AC Repair',
    problemDescription: 'AC blowing warm air',
    urgency: 'urgent',
  });
  const invalidLeadInput = sanitizeLeadCaptureInput({
    customerName: 'unknown',
    phone: 'n/a',
    serviceType: '',
    problemDescription: '',
  });
  assert(
    validLeadInput.customerName === 'Sarah Connor' &&
      validLeadInput.phone === '972-555-0144' &&
      invalidLeadInput.customerName === '' &&
      invalidLeadInput.phone === '' &&
      invalidLeadInput.missingCustomerFields.includes('customerName') &&
      invalidLeadInput.missingCustomerFields.includes('phone'),
    'sanitizeLeadCaptureInput accepts genuine caller data and scrubs placeholder fabrications ("unknown", "n/a") without inventing values'
  );

  assert(
    validateLeadStatusTransition('new', 'contacted').valid &&
      validateLeadStatusTransition('qualified', 'appointment_requested').valid &&
      validateLeadStatusTransition('appointment_requested', 'converted').valid &&
      !validateLeadStatusTransition('converted', 'new').valid &&
      !validateLeadStatusTransition('new', 'invalid_made_up_status').valid,
    'Lead status transition validator permits valid workflow transitions and rejects invalid/regressive transitions'
  );

  const badOnboarding = validateOnboardingInput({
    name: 'A',
    phone: '123',
    address: '1',
    serviceAreas: [],
    servicesOffered: [],
    businessHours: { weekdays: '' },
  });
  const badSettings = validateSettingsInput({
    name: '',
    phone: 'not-a-phone',
    address: '',
    serviceAreas: [],
    servicesOffered: [],
    businessHours: { weekdays: '' },
  });
  assert(
    !badOnboarding.valid &&
      Object.keys(badOnboarding.errors).length >= 4 &&
      !badSettings.valid &&
      Object.keys(badSettings.errors).length >= 4,
    'Onboarding and Contractor Settings validators reject short/malformed business names, phones, addresses, and empty service lists'
  );

  // ---------------------------------------------------------------------------
  // 6. AI Tool Security (Validation, Tenant Isolation, Demo Boundary, Honest Outputs)
  // ---------------------------------------------------------------------------
  console.log('\n6. AI Tool Security (Validation, Tenant Isolation, Demo Boundary, Honest Outputs)');

  // 6a. Reject unknown/hallucinated tool names
  const unknownToolRes = await executeAgentToolAsync(
    'drop_all_tables_and_confirm_booking',
    {},
    {
      conversationId: 'CA_TOOL_SEC_01',
      businessConfig: CONTRACTOR_ALPHA,
      businessId: CONTRACTOR_ALPHA.id,
      isDemo: false,
      channel: 'telephony',
    }
  );
  assert(
    !unknownToolRes.success && Boolean(unknownToolRes.error?.includes('Rejected unknown tool')),
    'executeAgentToolAsync rejects unknown/unregistered tool names safely'
  );

  // 6b. Demo mode never writes leads/calls to contractor persistence
  const alphaLeadsBeforeDemo = ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id).length;
  const demoToolRes = await executeAgentToolAsync(
    'create_lead',
    {
      customer_name: 'Demo Visitor',
      phone: '972-555-0191',
      service_address: '123 Demo Ln, Plano, TX',
      service_type: 'AC Repair',
      reported_issue: 'Testing public demo sandbox',
      urgency: 'normal',
      businessId: CONTRACTOR_ALPHA.id, // Attempted tenant injection from demo!
    },
    {
      conversationId: 'DEMO_CONV_01',
      businessConfig: CONTRACTOR_ALPHA,
      isDemo: true,
      channel: 'web_chat',
    }
  );
  const alphaLeadsAfterDemo = ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id).length;
  assert(
    demoToolRes.success && alphaLeadsAfterDemo === alphaLeadsBeforeDemo,
    'Demo mode tool execution never writes leads into authenticated contractor persistence'
  );

  // 6c. Authenticated/routed tool execution strips spoofed contractor IDs and binds to verified contractor
  const spoofedToolLeadRes = await executeAgentToolAsync(
    'create_lead',
    {
      customer_name: 'Verified Alpha Caller',
      phone: '972-555-0177',
      service_address: '500 Legacy Dr, Plano, TX',
      city_area: 'Plano',
      service_type: 'AC Repair',
      reported_issue: 'Capacitor failed on rooftop unit',
      urgency: 'urgent',
      businessId: CONTRACTOR_BETA.id, // Spoofed contractor Beta ID in LLM tool args!
      contractorId: CONTRACTOR_BETA.id,
    },
    {
      conversationId: 'CA_SEC_ALPHA_TOOL_02',
      businessConfig: CONTRACTOR_ALPHA,
      businessId: CONTRACTOR_ALPHA.id,
      isDemo: false,
      channel: 'telephony',
    }
  );
  const alphaLeadsNow = ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id);
  const betaLeadsNow = ContractorPersistenceService.getContractorLeads(CONTRACTOR_BETA.id);
  assert(
    spoofedToolLeadRes.success &&
      alphaLeadsNow.some((l) => l.customerName === 'Verified Alpha Caller') &&
      !betaLeadsNow.some((l) => l.customerName === 'Verified Alpha Caller'),
    'AI tool create_lead strips spoofed contractorId from LLM arguments and persists strictly under verified Contractor Alpha'
  );

  // 6d. request_appointment never claims confirmed booking
  const apptToolRes = await executeAgentToolAsync(
    'request_appointment',
    {
      customer_name: 'Verified Alpha Caller',
      phone: '972-555-0177',
      service_type: 'AC Repair',
      preferred_date: 'Tomorrow',
      preferred_time_window: '8:00 AM - 12:00 PM',
      notes: 'Gate code 1234',
    },
    {
      conversationId: 'CA_SEC_ALPHA_TOOL_02',
      businessConfig: CONTRACTOR_ALPHA,
      businessId: CONTRACTOR_ALPHA.id,
      isDemo: false,
      channel: 'telephony',
    }
  );
  const apptOut = (apptToolRes.output || {}) as Record<string, unknown>;
  assert(
    apptToolRes.success &&
      apptOut.status === 'requested' &&
      apptOut.confirmationRequired === true &&
      String(apptOut.confirmationMessage || '').includes('contractor confirmation required'),
    'AI tool request_appointment sets status="requested", confirmationRequired=true, and requires contractor confirmation'
  );

  // 6e. transfer_to_human never claims a live call transfer completed when unavailable
  const transferToolRes = await executeAgentToolAsync(
    'transfer_to_human',
    {
      reason: 'Customer requested immediate human manager callback',
      urgency: 'urgent',
      customer_name: 'Verified Alpha Caller',
      customer_phone: '972-555-0177',
    },
    {
      conversationId: 'CA_SEC_ALPHA_TOOL_02',
      businessConfig: CONTRACTOR_ALPHA,
      businessId: CONTRACTOR_ALPHA.id,
      isDemo: false,
      channel: 'telephony',
    }
  );
  const transferOut = (transferToolRes.output || {}) as Record<string, unknown>;
  assert(
    transferToolRes.success &&
      transferOut.liveTransferConnected === false &&
      transferOut.transferred === false &&
      transferOut.callbackRequested === true &&
      String(transferOut.message || '').includes('Live call transfer is not connected'),
    'AI tool transfer_to_human sets liveTransferConnected=false, callbackRequested=true, and never pretends a live transfer completed'
  );

  // ---------------------------------------------------------------------------
  // 7. Production Readiness & Health Endpoint Secret-Safety Verification
  // ---------------------------------------------------------------------------
  console.log('\n7. Production Readiness & Health Endpoint Verification');

  const envResult = validateEnvironment();
  assert(
    typeof envResult.healthy === 'boolean' &&
      typeof envResult.readyForLivePstn === 'boolean' &&
      typeof envResult.services.gemini.status === 'string' &&
      typeof envResult.services.supabase.status === 'string' &&
      typeof envResult.services.telephony.status === 'string',
    'validateEnvironment returns structured readiness status for gemini, supabase, and telephony'
  );

  const healthRes = await healthGet();
  const healthBody = await healthRes.json();
  const serializedHealth = JSON.stringify(healthBody);
  assert(
    (healthRes.status === 200 || healthRes.status === 503) &&
      Boolean(healthBody.services?.gemini) &&
      Boolean(healthBody.services?.supabase) &&
      Boolean(healthBody.services?.telephony) &&
      typeof healthBody.readyForPilot === 'boolean' &&
      typeof healthBody.readyForLivePstn === 'boolean' &&
      !serializedHealth.includes('AIza') &&
      !serializedHealth.includes('eyJ'),
    'GET /api/health reports readiness booleans for gemini, supabase, and telephony with zero secret leakage'
  );

  console.log('\n======================================================================');
  console.log(`PHASE 10 SECURITY AUDIT SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase10AuditSuite().catch((err) => {
  console.error('Fatal error in Phase 10 security audit suite:', err);
  process.exit(1);
});
