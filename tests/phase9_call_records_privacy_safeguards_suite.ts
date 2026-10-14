/**
 * PHASE 9 VERIFICATION SUITE — CALL RECORDS, PRIVACY, AND OPERATIONAL SAFEGUARDS
 *
 * Verifies:
 * 1. Call Lifecycle Events (all 8 canonical events, timestamps, contractor & call correlation, retry deduplication)
 * 2. Call History (date/time, caller info when available, duration when available, outcome, service, related lead, failure reason, zero fabricated data)
 * 3. Transcripts (persisted for telephony bridge & text chat, partial transcript handling on disconnect, cross-tenant isolation)
 * 4. Call Recording & Consent (disabled by default, no <Record> in TwiML, US federal & state all-party consent documentation, no false legal compliance claim)
 * 5. Customer Privacy (SSN/card/secret/raw-audio minimization, log secret scrubbing, safe error sanitization, PII redaction/correction/deletion)
 * 6. Operational Failure Handling (Gemini init failure, WebSocket drop, DB failure fallback, invalid contractor config, missing caller ID, unknown destination number, failed human escalation, late webhook status safeguard)
 */

import { NextRequest } from 'next/server';
import { POST as twilioVoicePost } from '../src/app/api/telephony/twilio/voice/route';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import { ContractorPersistenceService } from '../src/lib/services/contractorPersistence';
import {
  VALID_CALL_LIFECYCLE_EVENTS,
  CALL_LIFECYCLE_EVENT_LABELS,
  US_CALL_RECORDING_CONSENT_REQUIREMENTS,
  evaluateCallRecordingPolicy,
  minimizeCustomerText,
  minimizeEventPayload,
  normalizeCallerPhoneInput,
  sanitizeClientErrorMessage,
} from '../src/lib/compliance/callPrivacyAndCompliance';
import { sanitizeLogPayload, scrubStringSecrets } from '../src/lib/diagnostics/piiMask';
import { createSafeErrorResponse } from '../src/lib/errors/safeResponse';
import {
  validateContractorConfiguration,
  ContractorBusinessConfig,
} from '../src/lib/ai/contractorConfig';
import { buildInboundStreamTwiml } from '../src/lib/telephony/twimlBuilder';

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

const CONTRACTOR_A_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACTOR_B_ID = '22222222-2222-4222-8222-222222222222';

function buildValidContractorConfig(
  businessId: string,
  businessName: string,
  phone: string
): ContractorBusinessConfig {
  return {
    id: businessId,
    name: businessName,
    slug: businessName.toLowerCase().replace(/\s+/g, '-'),
    industry: 'hvac',
    phone,
    businessEmail: 'dispatch@example.com',
    website: 'https://example.com',
    address: '100 Main St, Dallas, TX',
    city: 'Dallas',
    state: 'TX',
    timezone: 'America/Chicago',
    serviceAreas: ['Dallas', 'Fort Worth'],
    servicesOffered: ['AC Repair', 'Emergency HVAC Service'],
    businessHours: {
      weekdays: '8:00 AM - 6:00 PM',
    },
    emergencyServiceEnabled: true,
    afterHoursInstructions: 'Page on-call technician immediately.',
    callbackInstructions: 'On-call dispatcher returns urgent calls within 15 minutes.',
    transferPhoneNumber: '+12145550199',
    customGreeting: `Thank you for calling ${businessName}.`,
    supportedLanguages: ['en-US', 'es-US'],
  };
}

async function runSuite() {
  console.log('================================================================');
  console.log('PHASE 9 SUITE: CALL RECORDS, PRIVACY & OPERATIONAL SAFEGUARDS');
  console.log('================================================================\n');

  ContractorPersistenceService.clearLedger();
  ContractorPersistenceService.setSimulatedDatabaseFailure(false);

  // -------------------------------------------------------------------------
  // SECTION 1: CALL LIFECYCLE EVENTS & IDEMPOTENCY
  // -------------------------------------------------------------------------
  console.log('--- 1. Call Lifecycle Events & Retry Deduplication ---');

  assert(
    VALID_CALL_LIFECYCLE_EVENTS.length === 8,
    'Defines all 8 required canonical call lifecycle event types',
    `Got ${VALID_CALL_LIFECYCLE_EVENTS.length}`
  );

  for (const eventType of VALID_CALL_LIFECYCLE_EVENTS) {
    assert(
      typeof CALL_LIFECYCLE_EVENT_LABELS[eventType] === 'string' &&
        CALL_LIFECYCLE_EVENT_LABELS[eventType].length > 0,
      `Lifecycle event '${eventType}' has human-readable label '${CALL_LIFECYCLE_EVENT_LABELS[eventType]}'`
    );
  }

  const callSid1 = 'CA_PHASE9_LIFECYCLE_001';
  const convId1 = await ContractorPersistenceService.ensureConversation(
    CONTRACTOR_A_ID,
    callSid1,
    'telephony',
    {
      externalCallSid: callSid1,
      callerIdentifier: '+12145551234',
      calledNumber: '+18005559001',
    }
  );

  assert(Boolean(convId1), 'Starts voice conversation record with contractor and callSid correlation');

  // 1. incoming_call_received (and retry idempotency)
  const evIncomingId1 = await ContractorPersistenceService.recordCallLifecycleEvent(
    CONTRACTOR_A_ID,
    callSid1,
    'incoming_call_received',
    { destinationNumber: '+18005559001' }
  );
  const evIncomingRetryId = await ContractorPersistenceService.recordCallLifecycleEvent(
    CONTRACTOR_A_ID,
    callSid1,
    'incoming_call_received',
    { destinationNumber: '+18005559001' }
  );

  assert(Boolean(evIncomingId1), 'Records incoming_call_received event');
  assert(
    evIncomingRetryId === evIncomingId1,
    'Prevents duplicate incoming_call_received event on webhook retry (returns same event ID)'
  );

  // 2. call_answered
  const evAnsweredId = await ContractorPersistenceService.recordCallLifecycleEvent(
    CONTRACTOR_A_ID,
    callSid1,
    'call_answered',
    { streamSid: 'MZ_STREAM_001' }
  );
  assert(Boolean(evAnsweredId), 'Records call_answered lifecycle event');

  // 3. ai_session_initialized
  const evAiInitId = await ContractorPersistenceService.recordCallLifecycleEvent(
    CONTRACTOR_A_ID,
    callSid1,
    'ai_session_initialized',
    { model: 'gemini-2.5-flash-native-audio-preview' }
  );
  assert(Boolean(evAiInitId), 'Records ai_session_initialized lifecycle event');

  // 4. Persist transcript turns (Caller + Assistant)
  await ContractorPersistenceService.persistMessage(
    CONTRACTOR_A_ID,
    callSid1,
    'customer',
    'Hi, my AC is blowing warm air at 450 Elm St in Dallas. My name is Sarah Jenkins.',
    { source: 'twilio_media_stream', callSid: callSid1 }
  );
  await ContractorPersistenceService.persistMessage(
    CONTRACTOR_A_ID,
    callSid1,
    'ai',
    'I can help arrange an AC repair visit in Dallas right away, Sarah.',
    { source: 'twilio_media_stream', callSid: callSid1 }
  );

  // 5. lead_captured (automatically emitted by persistLead)
  const leadResult = await ContractorPersistenceService.persistLead(CONTRACTOR_A_ID, {
    conversationId: callSid1,
    sourceCallId: callSid1,
    customerName: 'Sarah Jenkins',
    phone: '+12145551234',
    serviceAddress: '450 Elm St, Dallas, TX',
    serviceType: 'AC Repair',
    reportedIssue: 'AC blowing warm air on second floor',
    urgency: 'urgent',
    preferredAppointmentWindow: 'Today 2pm - 5pm',
    source: 'telephony',
  });
  assert(Boolean(leadResult.leadId) && !leadResult.deduplicated, 'Persists lead for call');

  // 6. appointment_requested (automatically emitted by persistAppointment)
  const apptResult = await ContractorPersistenceService.persistAppointment(CONTRACTOR_A_ID, {
    leadId: leadResult.leadId!,
    conversationId: callSid1,
    requestedSlot: 'Today 2pm - 5pm',
    notes: 'Gate code 1234',
  });
  assert(
    Boolean(apptResult.appointmentId) && apptResult.status === 'requested',
    'Persists appointment request (status=requested) and emits appointment_requested lifecycle event'
  );

  // 7. human_assistance_requested (automatically emitted by recordHumanEscalation)
  const escResult = await ContractorPersistenceService.recordHumanEscalation(CONTRACTOR_A_ID, {
    conversationId: callSid1,
    leadId: leadResult.leadId!,
    callbackPhone: '+12145551234',
    reason: 'Caller asked to confirm dispatch ETA with human coordinator',
    urgency: 'urgent',
    summary: 'AC blowing warm air',
    transferNumber: '+12145550199',
    liveTransferConnected: false,
    callbackRequested: true,
  });
  assert(
    escResult.escalationType === 'callback_requested' && escResult.liveTransferConnected === false,
    'Records human_assistance_requested event and honestly reports callback_requested (not live transfer)'
  );

  // 8. call_completed (automatically emitted by persistCallStatusUpdate)
  await ContractorPersistenceService.persistCallStatusUpdate(CONTRACTOR_A_ID, callSid1, {
    callStatus: 'completed',
    durationSeconds: 142,
  });

  // Retry status callback to verify idempotency
  await ContractorPersistenceService.persistCallStatusUpdate(CONTRACTOR_A_ID, callSid1, {
    callStatus: 'completed',
    durationSeconds: 142,
  });

  // -------------------------------------------------------------------------
  // SECTION 2: CALL HISTORY & TRANSCRIPT VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Call History & Transcript Accuracy ---');

  const historyA = await ContractorPersistenceService.getContractorCallHistory(CONTRACTOR_A_ID);
  assert(historyA.length === 1, 'Contractor A has exactly 1 call record in history');

  const callRecord1 = historyA[0];
  assert(callRecord1.callSid === callSid1, 'Call record preserves callSid');
  assert(callRecord1.callerName === 'Sarah Jenkins', 'Call record displays captured callerName');
  assert(callRecord1.callerPhone === '+12145551234', 'Call record displays callerPhone');
  assert(callRecord1.durationSeconds === 142, 'Call record displays verified durationSeconds (142s)');
  assert(callRecord1.requestedService === 'AC Repair', 'Call record displays requestedService');
  assert(
    callRecord1.relatedLead?.id === leadResult.leadId &&
      callRecord1.relatedLead?.status === 'appointment_requested',
    'Call record links to relatedLead with accurate status'
  );
  assert(callRecord1.failureReason === null, 'Completed call has null failureReason');
  assert(
    callRecord1.transcriptStatus === 'complete' && callRecord1.transcriptCount === 2,
    'Call record reports complete transcript status with 2 persisted turns'
  );
  assert(
    callRecord1.recordingAvailable === false,
    'Call record never invents a recording and reports recordingAvailable: false'
  );

  // Check that all 7 non-failure lifecycle events were recorded once on this call
  const detail1 = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_A_ID,
    callRecord1.id
  );
  assert(Boolean(detail1), 'Authorized contractor can retrieve full call detail and transcript');
  const detailEventTypes = detail1!.lifecycleEvents.map((e) => e.lifecycleEvent);
  for (const expectedType of [
    'incoming_call_received',
    'call_answered',
    'ai_session_initialized',
    'lead_captured',
    'appointment_requested',
    'human_assistance_requested',
    'call_completed',
  ] as const) {
    const count = detailEventTypes.filter((t) => t === expectedType).length;
    assert(
      count === 1,
      `Call detail contains exactly 1 '${expectedType}' lifecycle event (no duplicates)`,
      `Found ${count}`
    );
  }
  assert(detail1!.transcripts.length === 2, 'Call detail returns both persisted transcript turns');

  // -------------------------------------------------------------------------
  // SECTION 3: CROSS-TENANT ISOLATION (CONTRACTOR A vs CONTRACTOR B)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Cross-Tenant Isolation ---');

  const historyB = await ContractorPersistenceService.getContractorCallHistory(CONTRACTOR_B_ID);
  assert(historyB.length === 0, 'Contractor B cannot see Contractor A call history');

  const crossTenantDetail = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_B_ID,
    callRecord1.id
  );
  assert(crossTenantDetail === null, 'Contractor B cannot access Contractor A call transcript or detail');

  const crossTenantDelete = await ContractorPersistenceService.correctOrDeleteCallRecord(
    CONTRACTOR_B_ID,
    callRecord1.id,
    { action: 'delete' }
  );
  assert(
    !crossTenantDelete.ok && crossTenantDelete.code === 'NOT_FOUND',
    'Contractor B cannot delete or modify Contractor A call record'
  );

  // -------------------------------------------------------------------------
  // SECTION 4: CALL RECORDING & US CONSENT SAFEGUARDS
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Call Recording & Consent Safeguards ---');

  const recPolicy = evaluateCallRecordingPolicy({
    requestedRecording: true,
    explicitContractorOptIn: true,
    callerConsentDisclosed: true,
  });
  assert(
    recPolicy.recordingEnabled === false && recPolicy.autoRecordingDisabled === true,
    'Call recording remains disabled even if requestedRecording is passed'
  );
  assert(
    recPolicy.legalComplianceVerified === false,
    'Policy explicitly states legalComplianceVerified: false'
  );
  assert(
    US_CALL_RECORDING_CONSENT_REQUIREMENTS.allPartyConsentStates.length >= 14 &&
      US_CALL_RECORDING_CONSENT_REQUIREMENTS.allPartyConsentStates.some((s) =>
        s.includes('California')
      ) &&
      US_CALL_RECORDING_CONSENT_REQUIREMENTS.allPartyConsentStates.some((s) =>
        s.includes('Pennsylvania')
      ) &&
      US_CALL_RECORDING_CONSENT_REQUIREMENTS.allPartyConsentStates.some((s) =>
        s.includes('Florida')
      ),
    'Documents US federal ECPA and state all-party consent jurisdictions (CA, PA, FL, etc.)'
  );

  const sampleTwiml = buildInboundStreamTwiml({
    wsUrl: 'wss://hvac-production-4391.up.railway.app/api/telephony/twilio-stream',
    businessId: CONTRACTOR_A_ID,
    callSid: callSid1,
    callerPhone: '+12145551234',
    calledPhone: '+18005559001',
    correlationToken: 'signed-token',
  });
  assert(
    !sampleTwiml.includes('<Record') && !sampleTwiml.includes('record='),
    'Generated TwiML does not enable automatic call recording'
  );

  // -------------------------------------------------------------------------
  // SECTION 5: CUSTOMER PRIVACY, SECRET SCRUBBING & RECORD REDACTION/DELETION
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Customer Privacy, Minimization & Secret Scrubbing ---');

  const rawCustomerInput =
    'My SSN is 123-45-6789 and my Visa card is 4532 0151 1283 0366. API key AIzaSyD1234567890abcdefghijklmnopqrstuvwx';
  const minimized = minimizeCustomerText(rawCustomerInput);
  assert(
    !minimized.includes('123-45-6789') &&
      minimized.includes('[REDACTED_SSN]') &&
      !minimized.includes('4532 0151 1283 0366') &&
      minimized.includes('[REDACTED_PAYMENT_DATA]') &&
      !minimized.includes('AIzaSyD1234567890abcdefghijklmnopqrstuvwx'),
    'minimizeCustomerText strips SSNs, payment card numbers, and inline API keys'
  );

  const payloadMinimized = minimizeEventPayload({
    note: 'Customer SSN 123-45-6789',
    raw_audio: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA',
    api_key: 'sk-1234567890abcdefghijklmnop',
  });
  assert(
    !('raw_audio' in payloadMinimized) &&
      !('api_key' in payloadMinimized) &&
      String(payloadMinimized.note).includes('[REDACTED_SSN]'),
    'minimizeEventPayload strips raw audio buffers, secret keys, and inline SSNs'
  );

  const maskedLog = sanitizeLogPayload({
    error:
      'Failed auth with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    geminiApiKey: 'AIzaSyD1234567890abcdefghijklmnopqrstuvwx',
    phone: '+12145559876',
  }) as Record<string, string>;
  assert(
    maskedLog.geminiApiKey === '[REDACTED_SECRET]' &&
      !maskedLog.error.includes('eyJhbGciOi') &&
      maskedLog.phone.includes('***-**76'),
    'sanitizeLogPayload redacts secret keys, inline Bearer JWTs, and masks phone numbers in logs'
  );

  const safeClientMsg = sanitizeClientErrorMessage(
    'Database error for caller +12145551234 email sarah@example.com key AIzaSyD1234567890abcdefghijklmnopqrstuvwx'
  );
  assert(
    !safeClientMsg.includes('+12145551234') &&
      !safeClientMsg.includes('sarah@example.com') &&
      !safeClientMsg.includes('AIzaSy') &&
      scrubStringSecrets(safeClientMsg) === safeClientMsg,
    'sanitizeClientErrorMessage strips caller phone, email, and secrets from error messages'
  );

  const errRes = createSafeErrorResponse({
    userMessage: 'Failed for +12145551234 with token Bearer secret_token_1234567890',
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
  });
  const errBody = await errRes.json();
  assert(
    !errBody.error.includes('+12145551234') && !errBody.error.includes('secret_token_1234567890'),
    'createSafeErrorResponse never leaks customer PII or tokens in JSON response'
  );

  // Test caller PII correction & redaction on call record
  const redactRes = await ContractorPersistenceService.correctOrDeleteCallRecord(
    CONTRACTOR_A_ID,
    callRecord1.id,
    { action: 'redact_pii' }
  );
  assert(
    redactRes.ok && redactRes.action === 'redact_pii',
    'Authorized contractor can redact PII on a call record'
  );

  const detailAfterRedact = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_A_ID,
    callRecord1.id
  );
  assert(
    detailAfterRedact?.call.callerPhone === null &&
      detailAfterRedact?.transcripts.every((t) => t.text === '[REDACTED PER PRIVACY REQUEST]'),
    'Redacting call PII clears callerPhone and replaces transcript text'
  );

  // -------------------------------------------------------------------------
  // SECTION 6: OPERATIONAL FAILURE HANDLING & HONEST REPORTING
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Operational Failure Scenarios & Honest Reporting ---');

  // 6a. Missing / Anonymous Caller ID normalization
  assert(normalizeCallerPhoneInput('') === null, 'Empty caller ID normalizes to null');
  assert(normalizeCallerPhoneInput('Anonymous') === null, 'Anonymous caller ID normalizes to null');
  assert(normalizeCallerPhoneInput('Restricted') === null, 'Restricted caller ID normalizes to null');
  assert(normalizeCallerPhoneInput('+15555550000') === null, 'Placeholder 555-0000 caller ID normalizes to null');

  // 6b. Invalid Contractor Configuration validation
  const invalidConfigCheck = validateContractorConfiguration({
    id: CONTRACTOR_A_ID,
    name: '   ', // Blank business name
    timezone: 'America/Chicago',
  });
  assert(
    !invalidConfigCheck.valid &&
      invalidConfigCheck.reason === 'INVALID_CONTRACTOR_CONFIGURATION' &&
      invalidConfigCheck.errors.some((e) => e.includes('business name')),
    'validateContractorConfiguration rejects blank businessName with INVALID_CONTRACTOR_CONFIGURATION'
  );

  // 6c. Unknown destination phone number on Twilio inbound webhook
  process.env.ALLOW_UNSIGNED_TWILIO_WEBHOOKS = 'true';
  const unknownNumberForm = new URLSearchParams({
    CallSid: 'CA_UNKNOWN_DEST_001',
    From: 'Anonymous',
    To: '+19998887777',
    CallStatus: 'ringing',
  });
  const unknownReq = new NextRequest('http://localhost:3000/api/telephony/twilio/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: unknownNumberForm.toString(),
  });
  const unknownRes = await twilioVoicePost(unknownReq);
  const unknownTwiml = await unknownRes.text();
  assert(
    unknownRes.status === 200 &&
      unknownRes.headers.get('X-Aeris-Route-Status') === 'UNASSIGNED_DESTINATION_NUMBER' &&
      unknownTwiml.includes('<Hangup/>'),
    'Unknown destination number returns safe fallback TwiML with X-Aeris-Route-Status=UNASSIGNED_DESTINATION_NUMBER'
  );

  // 6d. Gemini initialization failure + WebSocket abnormal disconnect + post-failure completed callback safeguard
  const callSidFail = 'CA_PHASE9_FAIL_002';
  const streamSidFail = 'MZ_PHASE9_FAIL_002';
  const validConfig = buildValidContractorConfig(
    CONTRACTOR_A_ID,
    'Summit Climate Control',
    '+18005559001'
  );
  const csm = CallSessionManager.getInstance();
  const failSession = csm.createSession({
    callSid: callSidFail,
    streamSid: streamSidFail,
    businessId: CONTRACTOR_A_ID,
    callerPhone: 'Anonymous', // Missing caller ID
    calledPhone: '+18005559001',
    businessConfig: validConfig,
  });

  assert(
    failSession.callerPhone === null,
    'CallSessionManager stores null (never fabricated phone) when caller ID is Anonymous'
  );

  await ContractorPersistenceService.ensureConversation(
    CONTRACTOR_A_ID,
    callSidFail,
    'telephony',
    {
      externalCallSid: callSidFail,
      callerIdentifier: 'Anonymous',
      calledNumber: '+18005559001',
    }
  );

  // Simulate partial transcript followed by Gemini / WebSocket failure
  await ContractorPersistenceService.persistMessage(
    CONTRACTOR_A_ID,
    callSidFail,
    'customer',
    'Hello, my heater stopped working...',
    { source: 'twilio_media_stream', callSid: callSidFail, incomplete: true, reason: 'websocket_1006' }
  );

  // Simulate failed human escalation (never claim transfer succeeded)
  const failedEscalation = await ContractorPersistenceService.recordHumanEscalation(
    CONTRACTOR_A_ID,
    {
      conversationId: callSidFail,
      reason: 'Caller requested live transfer during outage',
      urgency: 'emergency',
      summary: 'Heater stopped working',
      transferNumber: '+12145550199',
      liveTransferConnected: true, // Even if caller requested live transfer, failed=true must override!
      failed: true,
      failureReason: 'Live transfer bridge unavailable',
    }
  );
  assert(
    failedEscalation.liveTransferConnected === false &&
      failedEscalation.escalationType === 'callback_requested',
    'Failed human escalation forces liveTransferConnected=false and never claims live transfer succeeded'
  );

  // Mark session failed due to Gemini / WebSocket disconnect
  csm.markSessionFailure(
    callSidFail,
    'Gemini Live connection closed unexpectedly (code=1006)'
  );
  await ContractorPersistenceService.persistCallStatusUpdate(CONTRACTOR_A_ID, callSidFail, {
    callStatus: 'failed',
    errorCode: 'WS_1006',
    errorMessage: 'Gemini Live connection closed unexpectedly (code=1006)',
  });

  // Now simulate Twilio sending a late CallStatus=completed webhook after the AI session failed
  const callbackCheck = csm.recordCallStatusCallback({
    callSid: callSidFail,
    callStatus: 'completed',
    callDuration: 18,
  });
  assert(
    callbackCheck.normalizedStatus === 'failed',
    'CallSessionManager.recordCallStatusCallback preserves failed status when a late completed callback arrives'
  );

  await ContractorPersistenceService.persistCallStatusUpdate(CONTRACTOR_A_ID, callSidFail, {
    callStatus: 'completed',
    durationSeconds: 18,
  });

  const failedDetail = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_A_ID,
    callSidFail
  );
  assert(
    failedDetail?.call.outcome === 'failed' &&
      failedDetail?.call.status === 'failed' &&
      Boolean(failedDetail?.call.failureReason?.includes('1006')),
    'Failed call session preserves outcome=failed and failureReason even if Twilio sends a late completed callback'
  );
  assert(
    !failedDetail?.lifecycleEvents.some((e) => e.lifecycleEvent === 'call_completed'),
    'Late completed callback does not record a false call_completed event on a failed call'
  );
  assert(
    failedDetail?.call.transcriptStatus === 'partial',
    'Call with interrupted transcript turn is accurately marked transcriptStatus=partial'
  );

  // 6e. Incomplete Call Lifecycle Handling (e.g., call still active with no answered/completed events)
  const callSidIncomplete = 'CA_PHASE9_INCOMPLETE_003';
  await ContractorPersistenceService.ensureConversation(
    CONTRACTOR_A_ID,
    callSidIncomplete,
    'telephony',
    {
      externalCallSid: callSidIncomplete,
      callerIdentifier: 'Restricted',
      calledNumber: '+18005559001',
    }
  );
  await ContractorPersistenceService.recordCallLifecycleEvent(
    CONTRACTOR_A_ID,
    callSidIncomplete,
    'incoming_call_received',
    { destinationNumber: '+18005559001' }
  );
  const incompleteDetail = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_A_ID,
    callSidIncomplete
  );
  assert(
    incompleteDetail?.call.answered === false &&
      incompleteDetail?.call.outcome === 'in_progress' &&
      incompleteDetail?.call.callerPhone === null &&
      incompleteDetail?.call.durationSeconds === null &&
      incompleteDetail?.call.transcriptStatus === 'unavailable',
    'Incomplete call session never fabricates answered=true, completed outcome, callerPhone, duration, or transcript'
  );

  // 6f. Simulated Database Failure Handling
  ContractorPersistenceService.setSimulatedDatabaseFailure('Simulated Supabase outage');
  const dbFailUpdate = await ContractorPersistenceService.correctOrDeleteCallRecord(
    CONTRACTOR_A_ID,
    callRecord1.id,
    { action: 'redact_pii' }
  );
  assert(
    !dbFailUpdate.ok && dbFailUpdate.code === 'DATABASE_FAILURE',
    'Database error during call record update returns structured DATABASE_FAILURE without crashing'
  );
  ContractorPersistenceService.setSimulatedDatabaseFailure(false);

  // 6g. Call Record Deletion
  const deleteRes = await ContractorPersistenceService.correctOrDeleteCallRecord(
    CONTRACTOR_A_ID,
    callRecord1.id,
    { action: 'delete' }
  );
  assert(
    deleteRes.ok && deleteRes.action === 'delete',
    'Authorized contractor can delete a call record'
  );
  const deletedDetail = await ContractorPersistenceService.getContractorCallDetail(
    CONTRACTOR_A_ID,
    callRecord1.id
  );
  assert(deletedDetail === null, 'Deleted call record is removed from contractor call history and detail');

  console.log('\n================================================================');
  console.log(`PHASE 9 SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled error in Phase 9 verification suite:', err);
  process.exit(1);
});
