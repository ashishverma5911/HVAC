import assert from 'assert';
import { validateEnvironment } from '../src/lib/config/envValidation';
import { createSafeErrorResponse } from '../src/lib/errors/safeResponse';
import { demoLimiter } from '../src/lib/security/demoLimiter';
import { maskPhone, maskAddress, maskName, sanitizeLogPayload } from '../src/lib/diagnostics/piiMask';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { buildReceptionistSystemInstruction } from '../src/lib/ai/receptionistPrompt';
import { buildReceptionistTools } from '../src/lib/ai/tools';
import { PILOT_CONFIG } from '../scripts/seed_pilot_account';
import { ContractorBusinessConfig } from '../src/lib/ai/contractorConfig';

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

async function runPilotReadinessSuite() {
  console.log('\n======================================================');
  console.log('--- PHASE 7 - STEP 7: PILOT READINESS & HARDENING SUITE ---');
  console.log('======================================================\n');

  // Pilot Contractor Configuration
  const pilotConfig: ContractorBusinessConfig = {
    id: 'pilot-abc-cooling',
    name: PILOT_CONFIG.name,
    slug: 'abc-cooling-heating',
    phone: PILOT_CONFIG.phone,
    address: `${PILOT_CONFIG.address}, ${PILOT_CONFIG.city}, ${PILOT_CONFIG.state} ${PILOT_CONFIG.postalCode}`,
    city: PILOT_CONFIG.city,
    state: PILOT_CONFIG.state,
    serviceAreas: PILOT_CONFIG.serviceAreas,
    servicesOffered: PILOT_CONFIG.services,
    businessHours: {
      weekdays: '8:00 AM - 6:00 PM',
      saturday: 'Closed',
      sunday: 'Closed',
    },
    emergencyServiceEnabled: PILOT_CONFIG.emergencyService,
    afterHoursInstructions: PILOT_CONFIG.afterHoursPolicy,
    transferInstructions: PILOT_CONFIG.transferInstructions,
    transferPhoneNumber: PILOT_CONFIG.phone,
  };

  // -------------------------------------------------------------------------
  // 1. PRODUCTION ENVIRONMENT VALIDATION
  // -------------------------------------------------------------------------
  console.log('1. Production Environment Validation & Safety');

  await runTest('validateEnvironment reports configuration status without leaking keys', () => {
    const res = validateEnvironment();
    assert.strictEqual(typeof res.healthy, 'boolean');
    assert.strictEqual(typeof res.timestamp, 'string');
    assert.ok(res.services.gemini);
    assert.ok(res.services.supabase);

    // Verify key values are never returned
    const jsonStr = JSON.stringify(res);
    assert.strictEqual(jsonStr.includes(process.env.GEMINI_API_KEY || 'NOT_PRESENT'), false);
    assert.strictEqual(jsonStr.includes(process.env.SUPABASE_SERVICE_ROLE_KEY || 'NOT_PRESENT'), false);
  });

  // -------------------------------------------------------------------------
  // 2. ERROR RESPONSE SANITIZATION
  // -------------------------------------------------------------------------
  console.log('\n2. Production-Safe Error Sanitization');

  await runTest('createSafeErrorResponse does not leak internal error or stack traces to client', async () => {
    const rawSensitiveError = new Error('FATAL: Database connection leaked at postgres://admin:supersecret@db.internal:5432');
    const response = createSafeErrorResponse({
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      internalError: rawSensitiveError,
    });

    const body = await response.json();
    assert.strictEqual(response.status, 503);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, 'DATABASE_UNAVAILABLE');
    assert.ok(body.error.includes('Contractor data services are temporarily unreachable'));

    // Verify raw postgres error or credentials NEVER appear in response body
    const bodyStr = JSON.stringify(body);
    assert.strictEqual(bodyStr.includes('supersecret'), false);
    assert.strictEqual(bodyStr.includes('postgres://'), false);
    assert.strictEqual(bodyStr.includes('db.internal'), false);
  });

  await runTest('createSafeErrorResponse handles missing business profile correctly', async () => {
    const response = createSafeErrorResponse({
      code: 'MISSING_BUSINESS_PROFILE',
      status: 403,
    });
    const body = await response.json();
    assert.strictEqual(response.status, 403);
    assert.strictEqual(body.code, 'MISSING_BUSINESS_PROFILE');
  });

  // -------------------------------------------------------------------------
  // 3. PUBLIC DEMO ABUSE LIMITER
  // -------------------------------------------------------------------------
  console.log('\n3. Public Demo Abuse Limiter & Quota Protection');

  await runTest('demoLimiter allows normal turns up to limit and blocks when exceeded', () => {
    const testConvId = `test-demo-${Date.now()}`;
    demoLimiter.reset(testConvId);

    // Initial turns should be allowed
    for (let i = 1; i <= 30; i++) {
      const turn = demoLimiter.recordTurn(testConvId);
      assert.strictEqual(turn.allowed, true);
      assert.strictEqual(turn.turns, i);
    }

    // 31st turn should be blocked
    const exceeded = demoLimiter.recordTurn(testConvId);
    assert.strictEqual(exceeded.allowed, false);
    assert.strictEqual(exceeded.remaining, 0);
    assert.ok(exceeded.reason?.includes('Demo turn limit'));
  });

  await runTest('demoLimiter limits token requests per session', () => {
    const testConvId = `test-demo-tokens-${Date.now()}`;
    demoLimiter.reset(testConvId);

    for (let i = 1; i <= 6; i++) {
      const tok = demoLimiter.recordTokenRequest(testConvId);
      assert.strictEqual(tok.allowed, true);
    }

    const blocked = demoLimiter.recordTokenRequest(testConvId);
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.reason?.includes('Demo audio session limit'));
  });

  // -------------------------------------------------------------------------
  // 4. CUSTOMER DATA PRIVACY & PII MASKING
  // -------------------------------------------------------------------------
  console.log('\n4. Customer Data Privacy & PII Scrubbing');

  await runTest('maskPhone correctly obscures middle digits', () => {
    assert.strictEqual(maskPhone('(214) 555-0199'), '(214) ***-**99');
    assert.strictEqual(maskPhone('972-555-4321'), '972-***-**21');
    assert.strictEqual(maskPhone(''), '');
  });

  await runTest('maskAddress obscures street numbers', () => {
    assert.strictEqual(maskAddress('1400 Preston Rd, Suite 400'), '*** Preston Rd, Suite 400');
    assert.strictEqual(maskAddress('55 Elm Street, Richardson'), '*** Elm Street, Richardson');
  });

  await runTest('maskName obscures last name and first name initials', () => {
    assert.strictEqual(maskName('Jane Doe'), 'J*** D***');
    assert.strictEqual(maskName('Robert Smith'), 'R*** S***');
  });

  await runTest('sanitizeLogPayload scrubs API keys, passwords, and PII', () => {
    const sensitivePayload = {
      apiKey: 'AIzaSySecretApiKey123',
      password: 'UserSecretPassword',
      customerName: 'Alice Walker',
      phone: '(469) 555-0123',
      serviceAddress: '123 Cottonwood Ln, Plano',
      normalField: 'AC unit blowing warm air',
    };

    const sanitized: any = sanitizeLogPayload(sensitivePayload);
    assert.strictEqual(sanitized.apiKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.password, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.customerName, 'A*** W***');
    assert.ok(sanitized.phone.includes('***'));
    assert.ok(sanitized.serviceAddress.includes('*** '));
    assert.strictEqual(sanitized.normalField, 'AC unit blowing warm air');
  });

  // -------------------------------------------------------------------------
  // 5. PILOT ACCOUNT & AERIS CONFIGURATION INTEGRATION
  // -------------------------------------------------------------------------
  console.log('\n5. Pilot Account & Dynamic AERIS Prompts');

  await runTest('buildReceptionistSystemInstruction accurately incorporates pilot business rules', () => {
    const prompt = buildReceptionistSystemInstruction(pilotConfig);
    assert.ok(prompt.includes(PILOT_CONFIG.name));
    assert.ok(prompt.includes('Plano'));
    assert.ok(prompt.includes('Richardson'));
    assert.ok(prompt.includes('AC Repair & Diagnostic'));
    assert.ok(prompt.includes('8:00 AM - 6:00 PM'));

    // Critical Safety Invariant preserved
    assert.ok(prompt.includes('NO DANGEROUS REPAIR INSTRUCTIONS'));
    assert.ok(prompt.includes('NEVER INVENT PRICING OR FEES'));
    assert.ok(prompt.includes('NEVER INVENT AVAILABILITY OR GUARANTEE BOOKING'));
  });

  await runTest('buildReceptionistTools generates tool declarations for pilot business', () => {
    const tools = buildReceptionistTools(pilotConfig);
    assert.strictEqual(Array.isArray(tools), true);
    const toolNames = tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('check_service_area'));
    assert.ok(toolNames.includes('check_business_hours'));
    assert.ok(toolNames.includes('get_available_slots'));
    assert.ok(toolNames.includes('create_lead'));
    assert.ok(toolNames.includes('request_appointment'));
    assert.ok(toolNames.includes('transfer_to_human'));
  });

  // -------------------------------------------------------------------------
  // 6. END-TO-END PILOT SCENARIOS
  // -------------------------------------------------------------------------
  console.log('\n6. End-to-End Pilot Scenarios');

  // Scenario A: Normal Lead Creation
  await runTest('Scenario A: Normal Lead in Pilot Service Area', async () => {
    const convId = `pilot-scen-a-${Date.now()}`;

    // 1. Check service area (Plano)
    const areaRes = await executeAgentToolAsync(
      'check_service_area',
      { city: 'Plano' },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true, // Use in-memory store for unit test execution
      }
    );
    assert.strictEqual(areaRes.output?.supported, true);

    // 2. Create lead
    const leadRes = await executeAgentToolAsync(
      'create_lead',
      {
        customerName: 'David Miller',
        phone: '972-555-0144',
        serviceAddress: '2200 Legacy Dr, Plano, TX',
        serviceType: 'AC Repair & Diagnostic',
        reportedIssue: 'AC unit is blowing warm air and outside fan is buzzing.',
        urgency: 'normal',
      },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );
    assert.strictEqual(leadRes.output?.status, 'created');
    assert.ok(leadRes.output?.leadId);
    assert.strictEqual(leadRes.action.status, 'success');
  });

  // Scenario B: Appointment Request (Status strictly 'requested')
  await runTest('Scenario B: Appointment Request with strict requested status invariant', async () => {
    const convId = `pilot-scen-b-${Date.now()}`;

    // 1. Service area check
    await executeAgentToolAsync(
      'check_service_area',
      { city: 'Plano' },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );

    // 2. Create lead
    const leadRes = await executeAgentToolAsync(
      'create_lead',
      {
        customerName: 'Sarah Connor',
        phone: '972-555-0188',
        serviceAddress: '1500 Custer Rd, Plano, TX',
        serviceType: 'AC Repair & Diagnostic',
        reportedIssue: 'AC not cooling',
        urgency: 'normal',
      },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );
    const leadId = String(leadRes.output?.leadId);

    // 3. Query available slots
    const slotsRes = await executeAgentToolAsync(
      'get_available_slots',
      { serviceType: 'AC Repair & Diagnostic' },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );
    const slots = (slotsRes.output?.slots as string[]) || [];
    assert.ok(slots.length > 0);
    const chosenSlot = slots[0];

    // 4. Request appointment
    const apptRes = await executeAgentToolAsync(
      'request_appointment',
      {
        leadId,
        customerName: 'Sarah Connor',
        phone: '972-555-0188',
        serviceAddress: '1500 Custer Rd, Plano, TX',
        preferredSlot: chosenSlot,
      },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );

    // CRITICAL INVARIANT: status MUST be 'requested' — NEVER 'confirmed'
    assert.strictEqual(apptRes.output?.status, 'requested');
    assert.notStrictEqual(apptRes.output?.status, 'confirmed');
    assert.strictEqual(apptRes.action.status, 'success');
  });

  // Scenario C: Human Transfer Request
  await runTest('Scenario C: Escalation / Human Transfer Workflow', async () => {
    const convId = `pilot-scen-c-${Date.now()}`;

    const transferRes = await executeAgentToolAsync(
      'transfer_to_human',
      {
        reason: 'Customer explicitly asked to speak with the dispatch manager.',
        urgency: 'normal',
        summary: 'Transfer requested for scheduling clarification.',
      },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );

    assert.strictEqual(transferRes.output?.status, 'transferred');
    assert.strictEqual(transferRes.action.status, 'success');
    assert.ok(transferRes.output?.message);
  });

  // Scenario D: Unsupported Location Rejection
  await runTest('Scenario D: Unsupported Territory Gracefully Rejected', async () => {
    const convId = `pilot-scen-d-${Date.now()}`;

    const unsupportedRes = await executeAgentToolAsync(
      'check_service_area',
      { city: 'Houston' },
      {
        conversationId: convId,
        businessConfig: pilotConfig,
        businessId: pilotConfig.id,
        isDemo: true,
      }
    );

    assert.strictEqual(unsupportedRes.output?.supported, false);
    assert.ok(unsupportedRes.output?.primaryServiceAreas);
    const serviceAreas = unsupportedRes.output?.primaryServiceAreas as string[];
    assert.ok(serviceAreas.includes('Plano'));
    assert.ok(serviceAreas.includes('Richardson'));
    assert.strictEqual(serviceAreas.includes('Houston'), false);
  });

  // Scenario E: Safety Invariant (Gas / Smoke / Hazard)
  await runTest('Scenario E: Emergency Safety Invariant with zero DIY repair advice', () => {
    const prompt = buildReceptionistSystemInstruction(pilotConfig);
    // Safety instructions are strictly immutable
    assert.ok(
      prompt.includes('Smell of natural gas, rotten eggs, or sulfur'),
      'Prompt must instruct immediate evacuation for gas leaks'
    );
    assert.ok(
      prompt.includes('Prioritize getting the caller and all occupants to a safe location outdoors or away from danger immediately.'),
      'Must direct occupants outdoors away from danger'
    );
    assert.ok(
      prompt.includes('NO DANGEROUS REPAIR INSTRUCTIONS'),
      'Zero DIY hazardous advice invariant'
    );
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`PILOT READINESS SUITE COMPLETE: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPilotReadinessSuite();
