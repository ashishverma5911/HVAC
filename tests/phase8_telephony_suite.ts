import assert from 'assert';
import * as crypto from 'crypto';
import { validateTwilioWebhookSignature } from '../src/lib/telephony/twilioSecurity';
import { getTelephonyEndpoints } from '../src/lib/telephony/telephonyConfig';
import { resolveTelephonyTenant, PILOT_CONTRACTOR_CONFIG } from '../src/lib/telephony/tenantPhoneMapping';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import {
  decodeTwilioMediaPayload,
  encodeTwilioOutboundPayload,
  pcm16ToBase64,
  base64ToPcm16,
} from '../src/lib/telephony/audioCodec';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { buildReceptionistSystemInstruction } from '../src/lib/ai/receptionistPrompt';
import { maskPhone, sanitizeLogPayload } from '../src/lib/diagnostics/piiMask';

let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  [FAIL] ${name}:`, err);
          failedTests++;
        });
    } else {
      console.log(`  [PASS] ${name}`);
      passedTests++;
      return Promise.resolve();
    }
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err);
    failedTests++;
    return Promise.resolve();
  }
}

async function runPhase8TelephonySuite() {
  console.log('\n======================================================');
  console.log('--- PHASE 8: REAL TWILIO PSTN INTEGRATION TEST SUITE ---');
  console.log('======================================================\n');

  const testAuthToken = 'test_secret_auth_token_12345';
  const testWebhookUrl = 'https://pilot.summithvac.com/api/telephony/twilio/voice';
  const testParams = {
    CallSid: 'CA1234567890abcdef',
    From: '+12145550199',
    To: '+19725550100',
    CallStatus: 'ringing',
  };

  // Helper to generate legitimate Twilio signature
  function generateTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += `${key}${params[key]}`;
    }
    return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  }

  // -------------------------------------------------------------------------
  // 1. TWILIO SIGNATURE VERIFICATION
  // -------------------------------------------------------------------------
  console.log('1. Twilio Webhook HMAC-SHA1 Signature Security');

  await runTest('Valid Twilio signature is accepted', () => {
    const validSig = generateTwilioSignature(testAuthToken, testWebhookUrl, testParams);
    const result = validateTwilioWebhookSignature(testAuthToken, validSig, testWebhookUrl, testParams);
    assert.strictEqual(result, true);
  });

  await runTest('Tampered Twilio signature is rejected', () => {
    const tamperedSig = 'invalid_tampered_signature_string';
    const result = validateTwilioWebhookSignature(testAuthToken, tamperedSig, testWebhookUrl, testParams);
    assert.strictEqual(result, false);
  });

  await runTest('Missing Twilio signature header is rejected', () => {
    const result = validateTwilioWebhookSignature(testAuthToken, null, testWebhookUrl, testParams);
    assert.strictEqual(result, false);
  });

  await runTest('Tampered parameter payload is rejected with original signature', () => {
    const originalSig = generateTwilioSignature(testAuthToken, testWebhookUrl, testParams);
    const tamperedParams = { ...testParams, From: '+19999999999' };
    const result = validateTwilioWebhookSignature(testAuthToken, originalSig, testWebhookUrl, tamperedParams);
    assert.strictEqual(result, false);
  });

  // -------------------------------------------------------------------------
  // 2. ENDPOINT CONFIGURATION & TWIML GENERATION
  // -------------------------------------------------------------------------
  console.log('\n2. Public Endpoint Configuration & WSS Streaming TwiML');

  await runTest('getTelephonyEndpoints correctly forms HTTPS webhook and WSS stream URLs', () => {
    const prevHttp = process.env.PUBLIC_HTTP_BASE_URL;
    const prevWs = process.env.PUBLIC_WS_BASE_URL;

    process.env.PUBLIC_HTTP_BASE_URL = 'https://hvac-pilot.vercel.app';
    process.env.PUBLIC_WS_BASE_URL = 'wss://telephony-pilot.railway.app';

    const endpoints = getTelephonyEndpoints();
    assert.strictEqual(endpoints.webhookUrl, 'https://hvac-pilot.vercel.app/api/telephony/twilio/voice');
    assert.strictEqual(endpoints.streamUrl, 'wss://telephony-pilot.railway.app/api/telephony/twilio-stream');
    assert.ok(endpoints.streamUrl.startsWith('wss://'));

    process.env.PUBLIC_HTTP_BASE_URL = prevHttp;
    process.env.PUBLIC_WS_BASE_URL = prevWs;
  });

  // -------------------------------------------------------------------------
  // 3. AUDIO PIPELINE CODEC VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n3. Audio Codec Pipeline (8kHz G.711 μ-law ↔ 16kHz/24kHz Linear PCM)');

  await runTest('Twilio 8kHz μ-law decodes to 16kHz Linear PCM with 2x samples', () => {
    // Generate synthetic 80-sample μ-law payload (10ms at 8kHz)
    const rawMulaw = new Uint8Array(80);
    for (let i = 0; i < 80; i++) rawMulaw[i] = i % 256;
    const base64Mulaw = Buffer.from(rawMulaw).toString('base64');

    const decodedPcm16 = decodeTwilioMediaPayload(base64Mulaw);
    // Upsampled 8kHz -> 16kHz must have exactly 160 samples (2x)
    assert.strictEqual(decodedPcm16.length, 160);
  });

  await runTest('Gemini 24kHz Linear PCM encodes to Twilio 8kHz μ-law with 1/3 samples', () => {
    // Generate synthetic 240-sample PCM chunk (10ms at 24kHz)
    const pcm24k = new Int16Array(240);
    for (let i = 0; i < 240; i++) pcm24k[i] = Math.round(10000 * Math.sin(i / 10));

    const encodedBase64 = encodeTwilioOutboundPayload(pcm24k, 24000);
    const decodedBytes = Buffer.from(encodedBase64, 'base64');
    // Downsampled 24kHz -> 8kHz must have exactly 80 μ-law bytes (1/3)
    assert.strictEqual(decodedBytes.length, 80);
  });

  // -------------------------------------------------------------------------
  // 4. SERVER-CONTROLLED TENANT PHONE MAPPING
  // -------------------------------------------------------------------------
  console.log('\n4. Server-Controlled Tenant Mapping');

  await runTest('Incoming call to Twilio number resolves to pilot contractor ABC Cooling & Heating', () => {
    const tenant = resolveTelephonyTenant('+19725550199');
    assert.strictEqual(tenant.businessConfig.name, 'ABC Cooling & Heating');
    assert.strictEqual(tenant.businessConfig.phone, '(972) 555-0199');
    assert.ok(tenant.businessConfig.serviceAreas.includes('Plano'));
    assert.ok(tenant.businessConfig.serviceAreas.includes('Richardson'));
  });

  await runTest('Caller or LLM cannot spoof business_id (strict server resolution)', () => {
    const tenant = resolveTelephonyTenant(null);
    assert.strictEqual(tenant.businessConfig.name, 'ABC Cooling & Heating');
    assert.notStrictEqual(tenant.businessId, 'malicious_injected_tenant_id');
  });

  // -------------------------------------------------------------------------
  // 5. CALL SESSION LIFECYCLE & WATCHDOG TIMER
  // -------------------------------------------------------------------------
  console.log('\n5. Call Session Lifecycle & Guardrails');

  await runTest('CallSessionManager initializes session with correlation ID and business config', () => {
    const mgr = CallSessionManager.getInstance();
    const callSid = `CA_test_${Date.now()}`;
    const streamSid = `MZ_test_${Date.now()}`;

    const session = mgr.createSession({
      callSid,
      streamSid,
      callerPhone: '+12145550199',
      calledPhone: '+19725550199',
    });

    assert.ok(session.sessionId.startsWith('LIVE-CALL-'));
    assert.strictEqual(session.callSid, callSid);
    assert.strictEqual(session.streamSid, streamSid);
    assert.strictEqual(session.businessConfig.name, 'ABC Cooling & Heating');
    assert.strictEqual(session.leadStatus, 'new');
    assert.strictEqual(session.metrics.twilioChunksReceived, 0);

    // Clean up
    mgr.terminateSession(streamSid, 'Test cleanup');
    assert.strictEqual(session.ended, true);
  });

  // -------------------------------------------------------------------------
  // 6. FIRST CALL SCRIPT SIMULATION (AERIS TOOLS INTAKE)
  // -------------------------------------------------------------------------
  console.log('\n6. First Real Call Script Intake Verification');

  const sessionCallSid = `CA_first_call_${Date.now()}`;
  let persistedLeadId: string | undefined;
  let selectedSlot: string | undefined;

  await runTest('Turn 1 & 2: Service area check & Lead creation for Alex in Plano', async () => {
    // 1. Check service area
    const areaRes = await executeAgentToolAsync(
      'check_service_area',
      { city: 'Plano' },
      {
        conversationId: sessionCallSid,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true, // In-memory for unit test
      }
    );
    assert.strictEqual(areaRes.output?.supported, true);

    // 2. Create lead
    const leadRes = await executeAgentToolAsync(
      'create_lead',
      {
        customerName: 'Alex',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
        serviceType: 'AC Repair & Diagnostic',
        reportedIssue: "AC isn't cooling",
        urgency: 'normal',
      },
      {
        conversationId: sessionCallSid,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true,
      }
    );
    assert.strictEqual(leadRes.output?.status, 'created');
    assert.ok(leadRes.output?.leadId);
    persistedLeadId = String(leadRes.output?.leadId);
  });

  await runTest('Turn 3: Available appointment slots retrieved', async () => {
    const slotsRes = await executeAgentToolAsync(
      'get_available_slots',
      { serviceType: 'AC Repair & Diagnostic' },
      {
        conversationId: sessionCallSid,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true,
      }
    );
    const slots = (slotsRes.output?.slots as string[]) || [];
    assert.ok(slots.length > 0);
    selectedSlot = slots[0];
  });

  await runTest('Turn 4: Appointment requested with strict requested status invariant', async () => {
    assert.ok(persistedLeadId);
    assert.ok(selectedSlot);

    const apptRes = await executeAgentToolAsync(
      'request_appointment',
      {
        leadId: persistedLeadId,
        customerName: 'Alex',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
        preferredSlot: selectedSlot,
      },
      {
        conversationId: sessionCallSid,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true,
      }
    );

    assert.strictEqual(apptRes.output?.status, 'requested');
    assert.notStrictEqual(apptRes.output?.status, 'confirmed');
  });

  await runTest('Turn 5: Human transfer workflow triggers upon request', async () => {
    const transferRes = await executeAgentToolAsync(
      'transfer_to_human',
      {
        reason: 'Customer requested to speak with a person.',
        urgency: 'normal',
        summary: 'Alex requested human representative.',
      },
      {
        conversationId: sessionCallSid,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true,
      }
    );

    assert.strictEqual(transferRes.output?.status, 'transferred');
    assert.strictEqual(transferRes.action.status, 'success');
  });

  // -------------------------------------------------------------------------
  // 7. NEGATIVE SCENARIOS
  // -------------------------------------------------------------------------
  console.log('\n7. Negative Scenarios & Safety Invariants');

  await runTest('Unsupported service area (Houston) rejected', async () => {
    const areaRes = await executeAgentToolAsync(
      'check_service_area',
      { city: 'Houston' },
      {
        conversationId: `neg-houston-${Date.now()}`,
        businessConfig: PILOT_CONTRACTOR_CONFIG,
        businessId: PILOT_CONTRACTOR_CONFIG.id,
        isDemo: true,
      }
    );
    assert.strictEqual(areaRes.output?.supported, false);
  });

  await runTest('Emergency gas leak protocol instructs immediate evacuation with zero DIY advice', () => {
    const prompt = buildReceptionistSystemInstruction(PILOT_CONTRACTOR_CONFIG);
    assert.ok(prompt.includes('Smell of natural gas, rotten eggs, or sulfur'));
    assert.ok(prompt.includes('NO DANGEROUS REPAIR INSTRUCTIONS'));
  });

  // -------------------------------------------------------------------------
  // 8. PRIVACY AUDIT & LOG MASKING
  // -------------------------------------------------------------------------
  console.log('\n8. Privacy Audit & Secret Masking');

  await runTest('Customer phone numbers masked in telephony operational logs', () => {
    assert.strictEqual(maskPhone('+12145550199'), '+121***-**99');
    assert.strictEqual(maskPhone('972-555-0100'), '972-***-**00');
  });

  await runTest('Auth tokens and secrets scrubbed from diagnostic payloads', () => {
    const rawPayload = {
      twilioAuthToken: 'secret_auth_token_here',
      geminiApiKey: 'secret_gemini_key_here',
      callSid: 'CA12345',
      customerPhone: '214-555-0199',
    };
    const sanitized: any = sanitizeLogPayload(rawPayload);
    assert.strictEqual(sanitized.twilioAuthToken, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.geminiApiKey, '[REDACTED_SECRET]');
    assert.ok(sanitized.customerPhone.includes('***'));
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`PHASE 8 TELEPHONY SUITE COMPLETE: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase8TelephonySuite();
