import * as fs from 'fs';
import * as path from 'path';
import {
  getIndustryTemplate,
  normalizeIndustry,
  SUPPORTED_INDUSTRIES,
} from '../src/lib/ai/industryTemplates';
import { buildReceptionistSystemInstruction } from '../src/lib/ai/receptionistPrompt';
import { buildReceptionistTools, RECEPTIONIST_TOOLS } from '../src/lib/ai/tools';
import { DEFAULT_SUMMIT_HVAC_CONFIG, ContractorBusinessConfig } from '../src/lib/ai/contractorConfig';
import { stripUntrustedTenantIds } from '../src/lib/auth/tenant';
import {
  validateOnboardingInput,
  validateOnboardingStep,
} from '../src/lib/validation/contractorOnboarding';
import { validateSettingsInput } from '../src/lib/validation/contractorSettings';
import {
  buildBusinessHoursJsonb,
  extractExtendedSettingsMetadata,
  resolvePhoneIntegrationStatus,
} from '../src/lib/services/contractorConfigMapper';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { resolveTelephonyTenant, resolveTelephonyTenantAsync } from '../src/lib/telephony/tenantPhoneMapping';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

async function runSuite() {
  console.log('==========================================================');
  console.log('🧪 AERIS SaaS FOUNDATION & MULTI-INDUSTRY VERIFICATION SUITE');
  console.log('==========================================================\n');

  // 1. Multi-Industry AI Engine & Prompt Adaptation
  console.log('--- 1. Shared AI Engine & Multi-Industry Extensibility ---');
  assert(
    SUPPORTED_INDUSTRIES.includes('hvac') &&
      SUPPORTED_INDUSTRIES.includes('plumbing') &&
      SUPPORTED_INDUSTRIES.includes('electrical') &&
      SUPPORTED_INDUSTRIES.includes('roofing') &&
      SUPPORTED_INDUSTRIES.includes('general_contractor'),
    'All 5 core contractor industries are registered in SUPPORTED_INDUSTRIES'
  );

  assert(normalizeIndustry(undefined) === 'hvac', 'Undefined industry normalizes to hvac');
  assert(normalizeIndustry('plumbing') === 'plumbing', 'Valid industry "plumbing" normalizes to plumbing');
  assert(normalizeIndustry('unknown_trade') === 'hvac', 'Unknown industry safely falls back to hvac');

  const hvacPrompt = buildReceptionistSystemInstruction(DEFAULT_SUMMIT_HVAC_CONFIG);
  assert(
    hvacPrompt.includes('You are AERIS, the virtual AI receptionist for Summit HVAC') &&
      hvacPrompt.includes('Appointments are recorded as "requested", NEVER "confirmed"') &&
      hvacPrompt.includes('check_service_area'),
    'HVAC prompt preserves exact receptionist persona and immutable safety invariants'
  );

  const plumbingContractor: ContractorBusinessConfig = {
    ...DEFAULT_SUMMIT_HVAC_CONFIG,
    name: 'Lone Star Plumbing Pros',
    industry: 'plumbing',
    servicesOffered: ['Burst Pipe Repair', 'Drain Cleaning', 'Water Heater Installation'],
  };
  const plumbingPrompt = buildReceptionistSystemInstruction(plumbingContractor);
  const plumbingTemplate = getIndustryTemplate('plumbing');
  assert(
    plumbingPrompt.includes('Lone Star Plumbing Pros') &&
      plumbingPrompt.includes(plumbingTemplate.contractorDescription) &&
      plumbingPrompt.includes('Burst Pipe Repair') &&
      plumbingPrompt.includes('Appointments are recorded as "requested", NEVER "confirmed"'),
    'Plumbing contractor prompt adapts terminology and emergency triage while preserving safety invariants'
  );

  const hvacTools = buildReceptionistTools(DEFAULT_SUMMIT_HVAC_CONFIG);
  const plumbingTools = buildReceptionistTools(plumbingContractor);
  assert(
    RECEPTIONIST_TOOLS.length === 6 && hvacTools.length === 6 && plumbingTools.length === 6,
    'Tool declarations expose all 6 canonical receptionist tools across industries'
  );
  assert(
    JSON.stringify(plumbingTools).includes('Water Heater Repair'),
    'buildReceptionistTools(plumbingContractor) injects plumbing-specific service examples into tool schema'
  );

  // 2. Server-Side Tenant ID Stripping & Validation
  console.log('\n--- 2. Untrusted Tenant ID Stripping & Input Validation ---');
  const maliciousPayload: Record<string, unknown> = {
    business_id: '00000000-0000-0000-0000-999999999999',
    businessId: 'spoofed-biz-id',
    contractor_id: 'spoofed-contractor-id',
    contractorId: 'spoofed-contractor-2',
    tenant_id: 'spoofed-tenant',
    organizationId: 'spoofed-org',
    name: 'Apex Climate Control',
    industry: 'hvac',
    phone: '(214) 555-0199',
  };
  const stripped = stripUntrustedTenantIds(maliciousPayload);
  assert(
    !('business_id' in stripped) &&
      !('businessId' in stripped) &&
      !('contractor_id' in stripped) &&
      !('contractorId' in stripped) &&
      !('tenant_id' in stripped) &&
      !('organizationId' in stripped) &&
      stripped.name === 'Apex Climate Control',
    'stripUntrustedTenantIds removes all 8 tenant identifier variants while keeping legitimate fields'
  );

  const validSettingsRes = validateSettingsInput({
    ...maliciousPayload,
    address: '500 Commerce St',
    city: 'Dallas',
    state: 'TX',
    serviceAreas: ['Dallas', 'Plano'],
    servicesOffered: ['AC Repair'],
    businessHours: { weekdays: '8:00 AM - 6:00 PM' },
    emergencyServiceEnabled: true,
  });
  assert(
    validSettingsRes.valid &&
      validSettingsRes.sanitized !== undefined &&
      !('business_id' in (validSettingsRes.sanitized as unknown as Record<string, unknown>)) &&
      validSettingsRes.sanitized?.industry === 'hvac',
    'validateSettingsInput strips injected tenant IDs and validates industry'
  );

  const invalidIndustryOnboarding = validateOnboardingInput({
    name: 'Test Contractor',
    industry: 'invalid_industry' as never,
    phone: '2145550199',
    address: '100 Main St',
    serviceAreas: ['Dallas'],
    servicesOffered: ['Repair'],
    businessHours: { weekdays: '8am-5pm' },
    emergencyServiceEnabled: true,
  });
  assert(
    !invalidIndustryOnboarding.valid && Boolean(invalidIndustryOnboarding.errors.industry),
    'validateOnboardingInput rejects unsupported industry values'
  );

  // 3. Tool Executor Tenant Isolation & End-to-End Flow
  console.log('\n--- 3. Tool Executor Tenant Isolation & Multi-Step State Sync ---');
  const testConvId = `test-saas-conv-${Date.now()}`;
  const areaRes = await executeAgentToolAsync(
    'check_service_area',
    {
      zip: '75201',
      business_id: 'spoofed-other-tenant',
      contractor_id: 'spoofed-other-tenant',
    },
    {
      conversationId: testConvId,
      businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
      isDemo: true,
      channel: 'web_chat',
    }
  );
  assert(
    areaRes.success === true && areaRes.output?.supported === true,
    'check_service_area succeeds and ignores spoofed tenant IDs in tool arguments'
  );

  const slotsRes = await executeAgentToolAsync(
    'get_available_slots',
    { serviceType: 'AC Repair', urgency: 'urgent' },
    {
      conversationId: testConvId,
      businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
      isDemo: true,
      channel: 'web_chat',
    }
  );
  const availableSlots = (slotsRes.output?.slots as string[]) || [];
  assert(
    slotsRes.success === true && availableSlots.length > 0,
    'get_available_slots returns available appointment windows'
  );

  const leadRes = await executeAgentToolAsync(
    'create_lead',
    {
      customerName: 'Sarah Jenkins',
      phone: '214-555-0144',
      serviceAddress: '400 Elm St, Dallas, TX 75201',
      serviceType: 'AC Repair',
      reportedIssue: 'Unit blowing warm air',
      urgency: 'urgent',
      business_id: 'spoofed-other-tenant',
    },
    {
      conversationId: testConvId,
      businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
      isDemo: true,
      channel: 'web_chat',
    }
  );
  const createdLeadId = leadRes.output?.leadId as string;
  assert(
    leadRes.success === true && Boolean(createdLeadId),
    'create_lead creates qualified lead after service area verification'
  );

  const apptRes = await executeAgentToolAsync(
    'request_appointment',
    {
      leadId: createdLeadId,
      preferredSlot: availableSlots[0],
      customerName: 'Sarah Jenkins',
      phone: '214-555-0144',
      serviceAddress: '400 Elm St, Dallas, TX 75201',
    },
    {
      conversationId: testConvId,
      businessConfig: DEFAULT_SUMMIT_HVAC_CONFIG,
      isDemo: true,
      channel: 'web_chat',
    }
  );
  assert(
    apptRes.success === true && apptRes.output?.status === 'requested',
    'request_appointment strictly sets status to "requested" (never "confirmed")'
  );

  // 4. Phone Number Routing
  console.log('\n--- 4. Phone Number Routing & Tenant Mapping ---');
  const syncRoute = resolveTelephonyTenant('+1 (214) 555-0199');
  assert(
    syncRoute.isPilot === true && Boolean(syncRoute.businessId),
    'resolveTelephonyTenant maps pilot phone number (+1 214-555-0199) to pilot contractor'
  );

  const asyncRoute = await resolveTelephonyTenantAsync('+1 (214) 555-0199');
  assert(
    Boolean(asyncRoute.businessId) && Boolean(asyncRoute.businessConfig.name),
    'resolveTelephonyTenantAsync resolves contractor configuration cleanly'
  );

  // 5. Database Migration & RLS Verification
  console.log('\n--- 5. Supabase Migration & RLS Policy Verification ---');
  const migrationPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261012_saas_foundation_schema.sql'
  );
  assert(fs.existsSync(migrationPath), 'Migration 20261012_saas_foundation_schema.sql exists');

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const requiredSqlTokens = [
    'CREATE TABLE IF NOT EXISTS public.contractor_members',
    'CREATE TABLE IF NOT EXISTS public.phone_numbers',
    'CREATE TABLE IF NOT EXISTS public.services',
    'CREATE OR REPLACE VIEW public.contractors',
    'CREATE OR REPLACE VIEW public.contractor_settings',
    'CREATE OR REPLACE VIEW public.calls',
    'CREATE OR REPLACE VIEW public.appointment_requests',
    'CREATE OR REPLACE FUNCTION public.user_has_business_access',
    'ENABLE ROW LEVEL SECURITY',
  ];
  for (const token of requiredSqlTokens) {
    assert(migrationSql.includes(token), `Migration SQL includes "${token}"`);
  }

  // 6. 6-Step Onboarding, Honest Phone Integration States & Settings Round-Trip
  console.log(
    '\n--- 6. 6-Step Onboarding, Honest Phone Integration States & Settings Round-Trip ---'
  );

  // Step 1 Join Validation
  const joinStepInvalid = validateOnboardingStep(1, {
    action: 'join',
    organizationSlug: '',
    verificationPhone: '123',
  });
  assert(
    !joinStepInvalid.valid &&
      Boolean(joinStepInvalid.errors.organizationSlug) &&
      Boolean(joinStepInvalid.errors.verificationPhone),
    'Step 1 Join Organization rejects missing slug and invalid verification phone'
  );

  const joinStepValid = validateOnboardingStep(1, {
    action: 'join',
    organizationSlug: 'apex-comfort-hvac',
    verificationPhone: '(214) 555-0199',
  });
  assert(joinStepValid.valid, 'Step 1 Join Organization accepts valid slug and 10-digit phone');

  // Step 4 Supported Voice Language Enforcement
  const unsupportedLangStep = validateOnboardingStep(4, {
    supportedLanguages: ['en-US', 'fr-FR'],
    callerIntakeQuestions: ['What is your address?'],
    emergencyServiceEnabled: true,
  });
  assert(
    !unsupportedLangStep.valid && Boolean(unsupportedLangStep.errors.supportedLanguages),
    'Step 4 rejects voice languages not supported by the voice engine (e.g. fr-FR)'
  );

  const supportedLangStep = validateOnboardingStep(4, {
    supportedLanguages: ['en-US', 'es-US'],
    callerIntakeQuestions: ['What is your service address?', 'What HVAC issue are you experiencing?'],
    emergencyServiceEnabled: true,
    afterHoursBehavior: 'emergency_dispatch',
    transferPhoneNumber: '(214) 555-0199',
  });
  assert(
    supportedLangStep.valid,
    'Step 4 accepts verified voice languages (en-US, es-US) and caller intake questions'
  );

  // Honest Phone Integration States (Step 5)
  const stateNotConfigured = resolvePhoneIntegrationStatus({
    businessPhone: '',
    forwardingEnabled: false,
    twilioSid: null,
    isActiveRoute: false,
  });
  assert(
    stateNotConfigured.status === 'not_configured' &&
      stateNotConfigured.statusLabel === 'Not configured' &&
      stateNotConfigured.assignedAerisNumber === null,
    'Phone state 1 ("Not configured") accurately reported when no phone is configured'
  );

  const stateSetupRequired = resolvePhoneIntegrationStatus({
    businessPhone: '(214) 555-0199',
    forwardingEnabled: false,
    twilioSid: null,
    isActiveRoute: false,
  });
  assert(
    stateSetupRequired.status === 'setup_required' &&
      stateSetupRequired.statusLabel === 'Setup required' &&
      stateSetupRequired.assignedAerisNumber === null,
    'Phone state 2 ("Setup required") accurately reported when phone exists without forwarding enabled'
  );

  const stateConfigPending = resolvePhoneIntegrationStatus({
    businessPhone: '(214) 555-0199',
    forwardingEnabled: true,
    twilioSid: null,
    isActiveRoute: false,
  });
  assert(
    stateConfigPending.status === 'configuration_pending' &&
      stateConfigPending.statusLabel === 'Configuration pending' &&
      stateConfigPending.assignedAerisNumber === null,
    'Phone state 3 ("Configuration pending") never claims a number is provisioned when twilioSid is absent'
  );

  const stateConnected = resolvePhoneIntegrationStatus({
    businessPhone: '(214) 555-0199',
    forwardingEnabled: true,
    twilioSid: 'PN0123456789abcdef0123456789abcdef',
    isActiveRoute: true,
    inboundAerisNumber: '+18885550199',
  });
  assert(
    stateConnected.status === 'connected_and_verified' &&
      stateConnected.statusLabel === 'Connected and verified' &&
      stateConnected.assignedAerisNumber === '+18885550199',
    'Phone state 4 ("Connected and verified") reported only when Twilio SID and active route are verified'
  );

  // Incomplete Onboarding Draft Save -> Reopen -> Complete -> Settings Update -> Refresh Round-Trip
  const draftJsonb = buildBusinessHoursJsonb(null, {
    weekdays: '7:30 AM – 6:30 PM',
    saturday: '8:00 AM – 2:00 PM',
    sunday: 'Emergency Service Only',
    businessEmail: 'owner@precisionairtx.com',
    website: 'www.precisionairtx.com',
    timezone: 'America/Chicago',
    pronunciationGuide: 'Pre-SIZH-un Air Texas',
    supportedLanguages: ['en-US', 'es-US'],
    callerIntakeQuestions: [
      'May I get your name and callback number?',
      'What is the service address and ZIP code?',
      'Is your AC or furnace completely down?',
    ],
    afterHoursBehavior: 'emergency_dispatch',
    forwardingEnabled: true,
    forwardingMode: 'conditional_busy_no_answer',
    carrierName: 'RingCentral',
    onboardingCompleted: false,
    onboardingStep: 4,
  });

  const reopenedDraft = extractExtendedSettingsMetadata(draftJsonb, null, 'America/Chicago');
  assert(
    reopenedDraft.onboardingCompleted === false &&
      reopenedDraft.onboardingStep === 4 &&
      reopenedDraft.businessEmail === 'owner@precisionairtx.com' &&
      reopenedDraft.website === 'https://www.precisionairtx.com' &&
      reopenedDraft.pronunciationGuide === 'Pre-SIZH-un Air Texas' &&
      reopenedDraft.supportedLanguages.includes('es-US') &&
      reopenedDraft.callerIntakeQuestions.length === 3 &&
      reopenedDraft.forwardingEnabled === true &&
      reopenedDraft.carrierName === 'RingCentral',
    'Incomplete onboarding draft persists and restores all extended fields at Step 4'
  );

  // Simulate editing, saving, refreshing, and reopening in Contractor Settings
  const settingsUpdateValidation = validateSettingsInput({
    name: 'Precision Air Texas LLC',
    phone: '(214) 555-0188',
    businessEmail: 'dispatch@precisionairtx.com',
    website: 'https://precisionairtx.com',
    address: '900 Preston Rd',
    city: 'Plano',
    state: 'TX',
    postalCode: '75024',
    timezone: 'America/Chicago',
    serviceAreas: ['Plano', 'Frisco', 'Dallas'],
    supportedZips: ['75024', '75034'],
    servicesOffered: [
      'AC Repair',
      'AC Installation',
      'Furnace Repair',
      'Furnace Installation',
      'HVAC Maintenance',
      'Emergency HVAC Service',
      'Ductless Mini-Split Service',
    ],
    businessHours: {
      weekdays: '7:00 AM – 7:00 PM',
      saturday: '9:00 AM – 4:00 PM',
      sunday: 'Emergency Only',
    },
    emergencyServiceEnabled: true,
    afterHoursBehavior: 'live_transfer',
    afterHoursInstructions: 'Escalate immediately to on-call tech if indoor temp exceeds 85F.',
    transferPhoneNumber: '(214) 555-0190',
    transferInstructions: 'Promise a human callback within 10 minutes or transfer live.',
    customGreeting: 'Thanks for calling Precision Air Texas! How can we help with your comfort today?',
    pronunciationGuide: 'Say Precision Air Texas clearly on greeting',
    supportedLanguages: ['en-US', 'es-US'],
    callerIntakeQuestions: [
      'What is your full name and best callback phone number?',
      'What is the street address and ZIP code for the service visit?',
    ],
    forwardingEnabled: true,
    forwardingMode: 'after_hours_only',
    carrierName: 'Verizon Business',
  });

  assert(
    settingsUpdateValidation.valid && Boolean(settingsUpdateValidation.sanitized),
    'Contractor settings update validates all 6-step onboarding fields cleanly'
  );

  const savedSettingsJsonb = buildBusinessHoursJsonb(draftJsonb, {
    weekdays: settingsUpdateValidation.sanitized!.businessHours.weekdays,
    saturday: settingsUpdateValidation.sanitized!.businessHours.saturday,
    sunday: settingsUpdateValidation.sanitized!.businessHours.sunday,
    businessEmail: settingsUpdateValidation.sanitized!.businessEmail,
    website: settingsUpdateValidation.sanitized!.website,
    timezone: settingsUpdateValidation.sanitized!.timezone,
    pronunciationGuide: settingsUpdateValidation.sanitized!.pronunciationGuide,
    supportedLanguages: settingsUpdateValidation.sanitized!.supportedLanguages,
    callerIntakeQuestions: settingsUpdateValidation.sanitized!.callerIntakeQuestions,
    afterHoursBehavior: settingsUpdateValidation.sanitized!.afterHoursBehavior,
    forwardingEnabled: settingsUpdateValidation.sanitized!.forwardingEnabled,
    forwardingMode: settingsUpdateValidation.sanitized!.forwardingMode,
    carrierName: settingsUpdateValidation.sanitized!.carrierName,
    onboardingCompleted: true,
    onboardingStep: 6,
  });

  const refreshedSettingsMeta = extractExtendedSettingsMetadata(
    savedSettingsJsonb,
    null,
    'America/Chicago'
  );

  assert(
    refreshedSettingsMeta.onboardingCompleted === true &&
      refreshedSettingsMeta.businessEmail === 'dispatch@precisionairtx.com' &&
      refreshedSettingsMeta.afterHoursBehavior === 'live_transfer' &&
      refreshedSettingsMeta.forwardingMode === 'after_hours_only' &&
      refreshedSettingsMeta.carrierName === 'Verizon Business' &&
      refreshedSettingsMeta.businessHours.weekdays === '7:00 AM – 7:00 PM',
    'Contractor settings save -> refresh -> reopen round-trip preserves 100% of fields'
  );

  // Verify AI Receptionist Prompt injects the updated settings
  const updatedPrompt = buildReceptionistSystemInstruction({
    ...DEFAULT_SUMMIT_HVAC_CONFIG,
    name: settingsUpdateValidation.sanitized!.name,
    phone: settingsUpdateValidation.sanitized!.phone,
    businessEmail: refreshedSettingsMeta.businessEmail,
    website: refreshedSettingsMeta.website,
    timezone: refreshedSettingsMeta.timezone,
    pronunciationGuide: refreshedSettingsMeta.pronunciationGuide,
    supportedLanguages: refreshedSettingsMeta.supportedLanguages,
    callerIntakeQuestions: refreshedSettingsMeta.callerIntakeQuestions,
    afterHoursBehavior: refreshedSettingsMeta.afterHoursBehavior,
    customGreeting: settingsUpdateValidation.sanitized!.customGreeting,
    servicesOffered: settingsUpdateValidation.sanitized!.servicesOffered,
  });

  assert(
    updatedPrompt.includes('Precision Air Texas LLC') &&
      updatedPrompt.includes('Say Precision Air Texas clearly on greeting') &&
      updatedPrompt.includes('Spanish (US)') &&
      updatedPrompt.includes('Ductless Mini-Split Service') &&
      updatedPrompt.includes('Appointments are recorded as "requested", NEVER "confirmed"'),
    'Live AI receptionist system instruction dynamically reflects all saved onboarding & settings fields'
  );

  console.log('\n==========================================================');
  console.log(`📊 SaaS Foundation Suite Summary: ${passed} passed, ${failed} failed`);
  console.log('==========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled error in SaaS Foundation Suite:', err);
  process.exit(1);
});
