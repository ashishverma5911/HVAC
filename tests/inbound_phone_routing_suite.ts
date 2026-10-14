/**
 * Production Inbound Phone Routing & Telephony Security Test Suite
 *
 * Verifies:
 * 1. Destination-number-to-contractor mapping (multi-tenant routing + untrusted ID stripping)
 * 2. Unknown / unassigned destination number safe rejection
 * 3. Twilio webhook signature validation (valid HMAC-SHA1 vs forged/missing signatures across Vercel & Railway URLs)
 * 4. Duplicate webhook delivery idempotency (by CallSid)
 * 5. Tenant isolation, mid-call contractor immutability, and honest phone number provisioning
 * 6. WebSocket start correlation, abnormal disconnection, status callbacks, and AI failure fallback
 * 7. End-to-end call, event, transcript, and lead persistence scoped to the routed contractor
 */

import http from 'http';
import { NextRequest } from 'next/server';
import { WebSocket } from 'ws';
import { createTelephonyServer } from '../src/server/telephonyServer';
import { POST as nextVoiceWebhookPost } from '../src/app/api/telephony/twilio/voice/route';
import { POST as nextStatusWebhookPost } from '../src/app/api/telephony/twilio/status/route';
import {
  clearRegisteredDestinationRoutes,
  resolveInboundDestinationRoute,
  resolveInboundDestinationRouteAsync,
} from '../src/lib/telephony/tenantPhoneMapping';
import {
  computeTwilioSignature,
  createStreamCorrelationToken,
  validateTwilioWebhookMultiUrl,
  verifyStreamCorrelationToken,
} from '../src/lib/telephony/twilioSecurity';
import { buildUnknownDestinationTwiml } from '../src/lib/telephony/twimlBuilder';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import { ContractorPersistenceService, withBoundedRetry } from '../src/lib/services/contractorPersistence';
import { resolvePhoneIntegrationStatus } from '../src/lib/services/contractorConfigMapper';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import {
  ContractorBusinessConfig,
  DEFAULT_APPOINTMENT_REQUEST_RULES,
  DEFAULT_CONVERSATION_PREFERENCES,
} from '../src/lib/ai/contractorConfig';

let passed = 0;
let failed = 0;

// Hard 15s watchdog so this test suite can never hang indefinitely
const suiteWatchdog = setTimeout(() => {
  const handles = (process as any)._getActiveHandles?.() || [];
  console.error(
    `[WATCHDOG] inbound_phone_routing_suite.ts exceeded 15s timeout! Active handles (${handles.length}):`,
    handles.map((h: any) => h?.constructor?.name || typeof h)
  );
  process.exit(1);
}, 15000);
suiteWatchdog.unref();

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function postFormHttp(
  url: string,
  params: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const bodyStr = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr).toString(),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, headers: res.headers, body: data })
        );
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const CONTRACTOR_ALPHA: ContractorBusinessConfig = {
  id: 'biz-routing-alpha-111',
  name: 'North Texas Precision Air',
  slug: 'north-texas-precision-air',
  industry: 'hvac',
  phone: '(972) 555-0101',
  businessEmail: 'dispatch@ntxprecisionair.com',
  address: '100 Main St, Frisco, TX 75034',
  city: 'Frisco',
  state: 'TX',
  postalCode: '75034',
  timezone: 'America/Chicago',
  serviceAreas: ['Frisco', 'Plano', 'McKinney'],
  supportedZips: ['75034', '75024'],
  servicesOffered: ['AC Repair', 'Heat Pump Installation', 'Seasonal Tune-Up'],
  businessHours: {
    weekdays: '7:00 AM - 7:00 PM',
    saturday: '8:00 AM - 4:00 PM',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'emergency_dispatch',
  afterHoursInstructions: 'Page the on-call Frisco technician immediately for no-cool emergencies.',
  callbackInstructions: 'A Frisco comfort advisor will call back within 20 minutes.',
  appointmentRequestRules: DEFAULT_APPOINTMENT_REQUEST_RULES,
  transferPhoneNumber: '+19725550101',
  transferInstructions: 'Transfer to Frisco dispatch desk.',
  customGreeting:
    'Thank you for calling North Texas Precision Air! This is AERIS, how can I help with your comfort today?',
  conversationPreferences: DEFAULT_CONVERSATION_PREFERENCES,
  supportedLanguages: ['en-US', 'es-US'],
  businessFaqs: [
    {
      question: 'What is your diagnostic fee?',
      answer: 'Our Frisco diagnostic fee is $79.',
    },
  ],
};

const CONTRACTOR_BETA: ContractorBusinessConfig = {
  id: 'biz-routing-beta-222',
  name: 'Lone Star Furnace & Cooling',
  slug: 'lone-star-furnace-cooling',
  industry: 'hvac',
  phone: '(214) 555-0202',
  businessEmail: 'service@lonestarfurnace.com',
  address: '500 Commerce St, Dallas, TX 75201',
  city: 'Dallas',
  state: 'TX',
  postalCode: '75201',
  timezone: 'America/Chicago',
  serviceAreas: ['Dallas', 'Irving', 'Garland'],
  supportedZips: ['75201', '75038'],
  servicesOffered: ['Furnace Repair', 'Emergency Heating Service', 'Ductless Mini-Split'],
  businessHours: {
    weekdays: '8:00 AM - 5:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'next_day_callback',
  afterHoursInstructions: 'Log urgent furnace issues for priority 8 AM Dallas dispatch.',
  callbackInstructions: 'Our Dallas service coordinator will call back within 15 minutes.',
  appointmentRequestRules: DEFAULT_APPOINTMENT_REQUEST_RULES,
  transferPhoneNumber: '+12145550202',
  transferInstructions: 'Transfer to Dallas service manager.',
  customGreeting:
    'Welcome to Lone Star Furnace and Cooling! I am AERIS, how can we assist you today?',
  conversationPreferences: DEFAULT_CONVERSATION_PREFERENCES,
  supportedLanguages: ['en-US'],
  businessFaqs: [
    {
      question: 'Do you repair gas furnaces?',
      answer: 'Yes, we service all residential gas and electric furnaces in Dallas.',
    },
  ],
};

async function runSuite() {
  console.log('=================================================================');
  console.log('--- PRODUCTION INBOUND PHONE ROUTING & SECURITY TEST SUITE ---');
  console.log('=================================================================\n');

  clearRegisteredDestinationRoutes();

  // ---------------------------------------------------------------------------
  // 1. Honest Phone Number Provisioning & Destination Number Association
  // ---------------------------------------------------------------------------
  console.log('1. Honest Phone Number Provisioning & Destination Number Association');

  const unprovisionedStatus = resolvePhoneIntegrationStatus({
    businessPhone: CONTRACTOR_ALPHA.phone,
    forwardingEnabled: true,
    twilioSid: null,
    isActiveRoute: false,
    inboundAerisNumber: null,
  });
  assert(
    unprovisionedStatus.status === 'configuration_pending' &&
      unprovisionedStatus.assignedAerisNumber === null &&
      unprovisionedStatus.twilioProvisioned === false,
    'Contractor is NEVER marked connected_and_verified or given a fabricated number before real Twilio provisioning'
  );

  // Associate dedicated AERIS/Twilio destination numbers for Contractor Alpha and Contractor Beta
  const alphaPhoneAssoc = await ContractorPersistenceService.associateProvisionedPhoneNumber({
    businessId: CONTRACTOR_ALPHA.id,
    phoneNumber: '(972) 555-0140',
    twilioSid: 'PN11111111111111111111111111111111',
    label: 'North Texas Precision Air AERIS Line',
    isActive: true,
    businessConfig: CONTRACTOR_ALPHA,
  });
  assert(
    alphaPhoneAssoc.phoneNumber === '+19725550140' &&
      alphaPhoneAssoc.normalizedDigits === '9725550140' &&
      alphaPhoneAssoc.twilioSidVerified === true,
    'Contractor Alpha provisioned destination number (+19725550140) associated and verified with PN SID'
  );

  const betaPhoneAssoc = await ContractorPersistenceService.associateProvisionedPhoneNumber({
    businessId: CONTRACTOR_BETA.id,
    phoneNumber: '+12145550188',
    twilioSid: 'PN22222222222222222222222222222222',
    label: 'Lone Star Furnace AERIS Line',
    isActive: true,
    businessConfig: CONTRACTOR_BETA,
  });
  assert(
    betaPhoneAssoc.phoneNumber === '+12145550188' &&
      betaPhoneAssoc.normalizedDigits === '2145550188' &&
      betaPhoneAssoc.twilioSidVerified === true,
    'Contractor Beta provisioned destination number (+12145550188) associated and verified with PN SID'
  );

  // Verify cross-tenant phone claiming protection
  let crossTenantClaimBlocked = false;
  try {
    await ContractorPersistenceService.associateProvisionedPhoneNumber({
      businessId: CONTRACTOR_BETA.id,
      phoneNumber: '+19725550140', // Already owned by Contractor Alpha!
      twilioSid: 'PN33333333333333333333333333333333',
      isActive: true,
      businessConfig: CONTRACTOR_BETA,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    crossTenantClaimBlocked = msg.includes('already assigned to another contractor');
  }
  assert(
    crossTenantClaimBlocked,
    'Cross-tenant protection blocks Contractor Beta from claiming Contractor Alpha active destination number'
  );

  const verifiedStatus = resolvePhoneIntegrationStatus({
    businessPhone: CONTRACTOR_ALPHA.phone,
    forwardingEnabled: true,
    twilioSid: alphaPhoneAssoc.twilioSid,
    isActiveRoute: alphaPhoneAssoc.isActive,
    inboundAerisNumber: alphaPhoneAssoc.phoneNumber,
  });
  assert(
    verifiedStatus.status === 'connected_and_verified' &&
      verifiedStatus.assignedAerisNumber === '+19725550140',
    'Contractor is marked connected_and_verified ONLY when destination number, Twilio SID, active route, and forwarding are verified'
  );

  // ---------------------------------------------------------------------------
  // 2. Destination-Number-to-Contractor Mapping & Untrusted ID Stripping
  // ---------------------------------------------------------------------------
  console.log('\n2. Destination-Number-to-Contractor Mapping & Untrusted ID Stripping');

  const maliciousPayload: Record<string, unknown> = {
    businessId: CONTRACTOR_BETA.id,
    contractorId: CONTRACTOR_BETA.id,
    tenantId: CONTRACTOR_BETA.id,
  };
  const routeAlpha = await resolveInboundDestinationRouteAsync('+19725550140', {
    untrustedPayload: maliciousPayload,
  });
  assert(
    routeAlpha.matched &&
      routeAlpha.businessId === CONTRACTOR_ALPHA.id &&
      routeAlpha.businessConfig.name === 'North Texas Precision Air',
    'Destination +19725550140 maps strictly to Contractor Alpha and ignores untrusted caller businessId'
  );
  assert(
    !('businessId' in maliciousPayload) &&
      !('contractorId' in maliciousPayload) &&
      !('tenantId' in maliciousPayload),
    'Untrusted businessId/contractorId/tenantId keys are stripped from incoming payload'
  );

  const routeBeta = await resolveInboundDestinationRouteAsync('+1 (214) 555-0188');
  assert(
    routeBeta.matched &&
      routeBeta.businessId === CONTRACTOR_BETA.id &&
      routeBeta.businessConfig.name === 'Lone Star Furnace & Cooling',
    'Destination +12145550188 maps strictly to Contractor Beta and loads Contractor Beta configuration'
  );

  // ---------------------------------------------------------------------------
  // 3. Unknown / Unassigned Destination Number Rejection
  // ---------------------------------------------------------------------------
  console.log('\n3. Unknown / Unassigned Destination Number Rejection');

  const routeUnknown = await resolveInboundDestinationRouteAsync('+14695559999');
  assert(
    !routeUnknown.matched && routeUnknown.reason === 'UNASSIGNED_DESTINATION_NUMBER',
    'Unassigned destination number (+14695559999) returns matched=false with UNASSIGNED_DESTINATION_NUMBER'
  );

  const routeMissing = resolveInboundDestinationRoute('');
  assert(
    !routeMissing.matched && routeMissing.reason === 'MISSING_DESTINATION_NUMBER',
    'Missing destination number returns matched=false with MISSING_DESTINATION_NUMBER'
  );

  const routeInvalid = resolveInboundDestinationRoute('12345');
  assert(
    !routeInvalid.matched && routeInvalid.reason === 'INVALID_DESTINATION_NUMBER',
    'Malformed destination number returns matched=false with INVALID_DESTINATION_NUMBER'
  );

  const unknownTwiml = buildUnknownDestinationTwiml('+14695559999');
  assert(
    unknownTwiml.includes('<Say') &&
      unknownTwiml.includes('not currently assigned') &&
      unknownTwiml.includes('<Hangup/>') &&
      !unknownTwiml.includes('<Stream'),
    'Unknown destination number TwiML plays polite notice and hangs up without connecting a Media Stream'
  );

  // ---------------------------------------------------------------------------
  // 4. Twilio Request Signature Validation (Valid vs Invalid across Topologies)
  // ---------------------------------------------------------------------------
  console.log('\n4. Twilio Request Signature Validation');

  const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const TEST_AUTH_TOKEN = 'test_twilio_auth_token_production_routing_99';
  process.env.TWILIO_AUTH_TOKEN = TEST_AUTH_TOKEN;

  const vercelWebhookUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/voice';
  const railwayWebhookUrl = 'https://hvac-production-4391.up.railway.app/api/telephony/twilio/voice';
  const sampleParams = {
    CallSid: 'CA_SIG_TEST_001',
    From: '+19725559000',
    To: '+19725550140',
    ForwardedFrom: '+19725550101',
    CallStatus: 'ringing',
  };

  const validVercelSig = computeTwilioSignature(TEST_AUTH_TOKEN, vercelWebhookUrl, sampleParams);
  const validRailwaySig = computeTwilioSignature(TEST_AUTH_TOKEN, railwayWebhookUrl, sampleParams);

  const multiCheckVercel = validateTwilioWebhookMultiUrl(
    TEST_AUTH_TOKEN,
    validVercelSig,
    [railwayWebhookUrl, vercelWebhookUrl],
    sampleParams,
    { strictMode: true }
  );
  assert(
    multiCheckVercel.valid && multiCheckVercel.matchedUrl === vercelWebhookUrl,
    'Multi-URL signature validator accepts valid signature signed for Vercel public webhook URL'
  );

  const multiCheckRailway = validateTwilioWebhookMultiUrl(
    TEST_AUTH_TOKEN,
    validRailwaySig,
    [vercelWebhookUrl, railwayWebhookUrl],
    sampleParams,
    { strictMode: true }
  );
  assert(
    multiCheckRailway.valid && multiCheckRailway.matchedUrl === railwayWebhookUrl,
    'Multi-URL signature validator accepts valid signature signed for Railway public webhook URL'
  );

  const forgedCheck = validateTwilioWebhookMultiUrl(
    TEST_AUTH_TOKEN,
    'forged_signature_value_xyz==',
    [vercelWebhookUrl, railwayWebhookUrl],
    sampleParams,
    { strictMode: true }
  );
  assert(
    !forgedCheck.valid && forgedCheck.reason === 'INVALID_TWILIO_SIGNATURE',
    'Forged X-Twilio-Signature is strictly rejected'
  );

  const missingHeaderCheck = validateTwilioWebhookMultiUrl(
    TEST_AUTH_TOKEN,
    null,
    [vercelWebhookUrl],
    sampleParams,
    { strictMode: true }
  );
  assert(
    !missingHeaderCheck.valid && missingHeaderCheck.reason === 'MISSING_SIGNATURE_HEADER',
    'Missing X-Twilio-Signature header is strictly rejected when TWILIO_AUTH_TOKEN is configured'
  );

  // Test Next.js POST /api/telephony/twilio/voice with invalid signature -> HTTP 403
  const badNextReq = new NextRequest(vercelWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'invalid_signature_header==',
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(sampleParams).toString(),
  });
  const badNextRes = await nextVoiceWebhookPost(badNextReq);
  assert(
    badNextRes.status === 403,
    `Next.js POST /api/telephony/twilio/voice rejects invalid Twilio signature with HTTP 403 (got ${badNextRes.status})`
  );

  // ---------------------------------------------------------------------------
  // 5. Duplicate Webhook Idempotency & Next.js Voice Route Verification
  // ---------------------------------------------------------------------------
  console.log('\n5. Duplicate Webhook Delivery Idempotency');

  const validNextReq1 = new NextRequest(vercelWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': validVercelSig,
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(sampleParams).toString(),
  });
  const validNextRes1 = await nextVoiceWebhookPost(validNextReq1);
  const twiml1 = await validNextRes1.text();
  assert(
    validNextRes1.status === 200 &&
      validNextRes1.headers.get('x-aeris-route-status') === 'MATCHED' &&
      validNextRes1.headers.get('x-aeris-contractor-id') === CONTRACTOR_ALPHA.id &&
      twiml1.includes('<Connect>') &&
      twiml1.includes(`<Parameter name="businessId" value="${CONTRACTOR_ALPHA.id}" />`),
    'First valid webhook delivery routes +19725550140 to Contractor Alpha and returns Stream TwiML'
  );

  // Deliver exact same webhook a second time (simulating Twilio webhook retry)
  const validNextReq2 = new NextRequest(vercelWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': validVercelSig,
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(sampleParams).toString(),
  });
  const validNextRes2 = await nextVoiceWebhookPost(validNextReq2);
  const twiml2 = await validNextRes2.text();
  const regAfterDup = CallSessionManager.getInstance().getWebhookRegistration('CA_SIG_TEST_001');
  assert(
    validNextRes2.status === 200 &&
      validNextRes2.headers.get('x-aeris-webhook-duplicate') === 'true' &&
      twiml1 === twiml2 &&
      regAfterDup?.deliveryCount === 2,
    'Duplicate webhook delivery for CallSid CA_SIG_TEST_001 is handled idempotently and returns identical TwiML'
  );
  assert(
    ContractorPersistenceService.getContractorCalls(CONTRACTOR_ALPHA.id).filter(
      (c) => c.callSid === 'CA_SIG_TEST_001'
    ).length === 1,
    'Duplicate webhook delivery does not create duplicate call records for Contractor Alpha'
  );

  // Test unknown destination number on Next.js voice route
  const unknownParams = {
    CallSid: 'CA_UNKNOWN_999',
    From: '+19725559000',
    To: '+14695559999',
  };
  const unknownSig = computeTwilioSignature(TEST_AUTH_TOKEN, vercelWebhookUrl, unknownParams);
  const unknownNextReq = new NextRequest(vercelWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': unknownSig,
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(unknownParams).toString(),
  });
  const unknownNextRes = await nextVoiceWebhookPost(unknownNextReq);
  const unknownBody = await unknownNextRes.text();
  assert(
    unknownNextRes.status === 200 &&
      unknownNextRes.headers.get('x-aeris-route-status') === 'UNASSIGNED_DESTINATION_NUMBER' &&
      unknownBody.includes('<Hangup/>') &&
      !unknownBody.includes('<Stream'),
    'Webhook to unassigned destination number (+14695559999) safely returns rejection TwiML without starting a stream'
  );

  // ---------------------------------------------------------------------------
  // 6. Mid-Call Contractor Immutability & Stream Correlation Tokens
  // ---------------------------------------------------------------------------
  console.log('\n6. Mid-Call Contractor Immutability & Stream Correlation Tokens');

  const corrToken = createStreamCorrelationToken({
    callSid: 'CA_IMMUTABLE_01',
    calledPhone: '+19725550140',
    callerPhone: '+19725551234',
    businessId: CONTRACTOR_ALPHA.id,
  });
  assert(
    verifyStreamCorrelationToken(corrToken, {
      callSid: 'CA_IMMUTABLE_01',
      calledPhone: '+19725550140',
      callerPhone: '+19725551234',
      businessId: CONTRACTOR_ALPHA.id,
    }),
    'Cryptographic stream correlation token verifies matching CallSid, destination phone, and businessId'
  );
  assert(
    !verifyStreamCorrelationToken(corrToken, {
      callSid: 'CA_IMMUTABLE_01',
      calledPhone: '+19725550140',
      callerPhone: '+19725551234',
      businessId: CONTRACTOR_BETA.id,
    }),
    'Cryptographic stream correlation token rejects tampered businessId'
  );

  const sessionManager = CallSessionManager.getInstance();
  const lockedSession = sessionManager.createSession({
    callSid: 'CA_IMMUTABLE_01',
    streamSid: 'MZ_IMMUTABLE_01',
    callerPhone: '+19725551234',
    calledPhone: '+19725550140',
    businessId: CONTRACTOR_ALPHA.id,
    businessConfig: CONTRACTOR_ALPHA,
  });

  // Attempt direct property mutation
  let directMutationBlocked = false;
  try {
    (lockedSession as unknown as Record<string, unknown>).businessId = CONTRACTOR_BETA.id;
  } catch {
    directMutationBlocked = true;
  }
  assert(
    directMutationBlocked && lockedSession.businessId === CONTRACTOR_ALPHA.id,
    'Direct runtime mutation of session.businessId is blocked by non-writable property descriptor'
  );

  // Attempt mid-call contractor switch via CallSessionManager
  const switchAttempt = sessionManager.attemptMidCallContractorSwitch(
    'MZ_IMMUTABLE_01',
    CONTRACTOR_BETA.id
  );
  assert(
    !switchAttempt.allowed &&
      switchAttempt.reason === 'MID_CALL_CONTRACTOR_SWITCH_FORBIDDEN' &&
      lockedSession.businessId === CONTRACTOR_ALPHA.id &&
      lockedSession.securityViolations === 1,
    'attemptMidCallContractorSwitch blocks switching contractors mid-call and records security violation'
  );
  sessionManager.terminateSession('MZ_IMMUTABLE_01', 'Test complete');

  // ---------------------------------------------------------------------------
  // 7. Live Railway Server: Webhook -> WebSocket Stream -> Disconnect & Status Callbacks
  // ---------------------------------------------------------------------------
  console.log('\n7. Live Telephony Server: Webhook -> WebSocket Stream -> Disconnect & Call Failures');

  const TEST_PORT = 9889;
  const { server, shutdown } = createTelephonyServer();
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => resolve());
  });

  const serverVoiceUrl = `http://127.0.0.1:${TEST_PORT}/api/telephony/twilio/voice`;
  const betaCallParams = {
    CallSid: 'CA_BETA_LIVE_202',
    From: '+12145557777',
    To: '+12145550188',
  };
  const betaSig = computeTwilioSignature(TEST_AUTH_TOKEN, serverVoiceUrl, betaCallParams);

  const betaWebhookRes = await postFormHttp(serverVoiceUrl, betaCallParams, {
    'X-Twilio-Signature': betaSig,
  });
  assert(
    betaWebhookRes.status === 200 &&
      betaWebhookRes.headers['x-aeris-contractor-id'] === CONTRACTOR_BETA.id &&
      betaWebhookRes.body.includes(`<Parameter name="businessId" value="${CONTRACTOR_BETA.id}" />`),
    'Live telephony server POST /api/telephony/twilio/voice routes +12145550188 to Contractor Beta'
  );

  // Validate stream start correlation when an untrusted client tries to spoof Contractor Alpha on Contractor Beta's call
  const correlatedBeta = await sessionManager.validateAndCorrelateStreamStart({
    streamSid: 'MZ_BETA_STREAM_202',
    callSid: 'CA_BETA_LIVE_202',
    customParameters: {
      callSid: 'CA_BETA_LIVE_202',
      callerPhone: '+12145557777',
      calledPhone: '+12145550188',
      businessId: CONTRACTOR_ALPHA.id, // Spoofed override attempt!
    },
  });
  assert(
    correlatedBeta.valid &&
      correlatedBeta.businessId === CONTRACTOR_BETA.id &&
      correlatedBeta.businessConfig?.name === 'Lone Star Furnace & Cooling',
    'validateAndCorrelateStreamStart enforces webhook-registered Contractor Beta despite spoofed customParameters.businessId'
  );

  // Validate stream start rejection for unassigned destination number
  const unassignedStreamStart = await sessionManager.validateAndCorrelateStreamStart({
    streamSid: 'MZ_UNASSIGNED_999',
    callSid: 'CA_UNASSIGNED_999',
    customParameters: {
      calledPhone: '+14695550000',
    },
  });
  assert(
    !unassignedStreamStart.valid &&
      unassignedStreamStart.reason === 'UNASSIGNED_DESTINATION_NUMBER',
    'validateAndCorrelateStreamStart rejects stream start for unassigned destination number'
  );

  // Test AI session unavailable fallback behavior (never pretends a transfer occurred if it failed)
  process.env.FORCE_AI_SESSION_UNAVAILABLE = 'true';
  const unavailableParams = {
    CallSid: 'CA_FAIL_FALLBACK_303',
    From: '+19725558888',
    To: '+19725550140',
  };
  const unavailableSig = computeTwilioSignature(TEST_AUTH_TOKEN, serverVoiceUrl, unavailableParams);
  const unavailableRes = await postFormHttp(serverVoiceUrl, unavailableParams, {
    'X-Twilio-Signature': unavailableSig,
  });
  delete process.env.FORCE_AI_SESSION_UNAVAILABLE;

  assert(
    unavailableRes.status === 200 &&
      unavailableRes.headers['x-aeris-route-status'] === 'FALLBACK_UNAVAILABLE' &&
      unavailableRes.body.includes('temporarily unavailable') &&
      !unavailableRes.body.includes('<Stream') &&
      !unavailableRes.body.includes('transfer complete'),
    'When AI session cannot start, webhook logs failure and returns honest fallback TwiML without pretending a transfer succeeded'
  );

  // Test WebSocket abnormal disconnect handling on live server
  process.env.SKIP_GEMINI_LIVE_IN_TESTS = 'true';
  const wsUrl = `ws://127.0.0.1:${TEST_PORT}/api/telephony/twilio-stream`;
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          event: 'start',
          streamSid: 'MZ_BETA_WS_LIVE_202',
          start: {
            streamSid: 'MZ_BETA_WS_LIVE_202',
            callSid: 'CA_BETA_LIVE_202',
            customParameters: {
              callSid: 'CA_BETA_LIVE_202',
              callerPhone: '+12145557777',
              calledPhone: '+12145550188',
            },
          },
        })
      );
      setTimeout(() => {
        ws.close(1006 === 1006 ? 4001 : 1000, 'Simulated mid-call carrier drop');
      }, 60);
    });
    ws.on('close', () => resolve());
    ws.on('error', reject);
  });

  await new Promise((r) => setTimeout(r, 60));
  const droppedSession = sessionManager.getSessionByStream('MZ_BETA_WS_LIVE_202');
  assert(
    Boolean(droppedSession && droppedSession.ended && droppedSession.failed),
    'Unexpected WebSocket disconnect marks call session as ended and failed'
  );

  // Test Twilio Status Callback endpoint (POST /api/telephony/twilio/status)
  const statusUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/status';
  const statusParams = {
    CallSid: 'CA_SIG_TEST_001',
    CallStatus: 'completed',
    CallDuration: '94',
    From: '+19725559000',
    To: '+19725550140',
  };
  const statusSig = computeTwilioSignature(TEST_AUTH_TOKEN, statusUrl, statusParams);
  const statusReq = new NextRequest(statusUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': statusSig,
      host: 'hvac-pearl-seven.vercel.app',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams(statusParams).toString(),
  });
  const statusRes = await nextStatusWebhookPost(statusReq);
  const statusJson = await statusRes.json();
  assert(
    statusRes.status === 200 &&
      statusJson.success === true &&
      statusJson.callStatus === 'completed' &&
      statusJson.businessId === CONTRACTOR_ALPHA.id,
    'POST /api/telephony/twilio/status validates signature and updates CallSid CA_SIG_TEST_001 status to completed for Contractor Alpha'
  );

  // ---------------------------------------------------------------------------
  // 8. Bounded Retry & Tenant-Isolated Call/Lead Persistence Verification
  // ---------------------------------------------------------------------------
  console.log('\n8. Bounded Retry & Tenant-Isolated Call/Lead Persistence');

  let retryAttempts = 0;
  const retryResult = await withBoundedRetry(
    'testTransientDatabaseOp',
    async () => {
      retryAttempts += 1;
      if (retryAttempts < 3) {
        throw new Error('Transient connection reset');
      }
      return 'OK_ON_ATTEMPT_3';
    },
    3,
    10
  );
  assert(
    retryResult === 'OK_ON_ATTEMPT_3' && retryAttempts === 3,
    'withBoundedRetry retries transient failures up to bounded limit and succeeds'
  );

  // Execute tool calls for Contractor Alpha call CA_SIG_TEST_001 and Contractor Beta call CA_BETA_LIVE_202
  const alphaLeadRes = await executeAgentToolAsync(
    'create_lead',
    {
      customerName: 'Logan Carter',
      phone: '972-555-9000',
      serviceAddress: '450 Stonebrook Pkwy, Frisco, TX 75034',
      serviceType: 'AC Repair',
      problemDescription: 'Upstairs AC blowing warm air',
      urgency: 'urgent',
    },
    {
      conversationId: 'CA_SIG_TEST_001',
      businessId: CONTRACTOR_ALPHA.id,
      businessConfig: CONTRACTOR_ALPHA,
      isDemo: false,
      channel: 'telephony',
    }
  );
  assert(
    alphaLeadRes.success &&
      alphaLeadRes.output?.businessId === CONTRACTOR_ALPHA.id &&
      String(alphaLeadRes.output?.message || '').includes('North Texas Precision Air'),
    'Telephony lead created during Call CA_SIG_TEST_001 is associated with Contractor Alpha'
  );

  const betaLeadRes = await executeAgentToolAsync(
    'create_lead',
    {
      customerName: 'Marcus Vance',
      phone: '214-555-7777',
      serviceAddress: '800 Main St, Dallas, TX 75201',
      serviceType: 'Furnace Repair',
      problemDescription: 'Furnace igniter clicking and not heating',
      urgency: 'emergency',
    },
    {
      conversationId: 'CA_BETA_LIVE_202',
      businessId: CONTRACTOR_BETA.id,
      businessConfig: CONTRACTOR_BETA,
      isDemo: false,
      channel: 'telephony',
    }
  );
  assert(
    betaLeadRes.success &&
      betaLeadRes.output?.businessId === CONTRACTOR_BETA.id &&
      String(betaLeadRes.output?.message || '').includes('Lone Star Furnace & Cooling'),
    'Telephony lead created during Call CA_BETA_LIVE_202 is associated with Contractor Beta'
  );

  const alphaCalls = ContractorPersistenceService.getContractorCalls(CONTRACTOR_ALPHA.id);
  const betaCalls = ContractorPersistenceService.getContractorCalls(CONTRACTOR_BETA.id);
  const alphaLeads = ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id);
  const betaLeads = ContractorPersistenceService.getContractorLeads(CONTRACTOR_BETA.id);

  assert(
    alphaCalls.some((c) => c.callSid === 'CA_SIG_TEST_001' && c.status === 'completed') &&
      !alphaCalls.some((c) => c.callSid === 'CA_BETA_LIVE_202'),
    'Contractor Alpha call ledger contains CA_SIG_TEST_001 (completed) and zero Contractor Beta calls'
  );
  assert(
    betaCalls.some((c) => c.callSid === 'CA_BETA_LIVE_202') &&
      !betaCalls.some((c) => c.callSid === 'CA_SIG_TEST_001'),
    'Contractor Beta call ledger contains CA_BETA_LIVE_202 and zero Contractor Alpha calls'
  );
  assert(
    alphaLeads.length === 1 &&
      alphaLeads[0].customerName === 'Logan Carter' &&
      alphaLeads[0].businessId === CONTRACTOR_ALPHA.id,
    'Contractor Alpha lead ledger contains ONLY Contractor Alpha customer lead'
  );
  assert(
    betaLeads.length === 1 &&
      betaLeads[0].customerName === 'Marcus Vance' &&
      betaLeads[0].businessId === CONTRACTOR_BETA.id,
    'Contractor Beta lead ledger contains ONLY Contractor Beta customer lead'
  );

  await new Promise<void>((resolve) => shutdown('SIGTERM', () => resolve()));
  delete process.env.SKIP_GEMINI_LIVE_IN_TESTS;
  if (originalAuthToken !== undefined) {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  } else {
    delete process.env.TWILIO_AUTH_TOKEN;
  }
  clearRegisteredDestinationRoutes();

  console.log('\n=================================================================');
  console.log(`INBOUND PHONE ROUTING SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('=================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('Inbound phone routing test suite failed unexpectedly:', err);
  process.exit(1);
});
