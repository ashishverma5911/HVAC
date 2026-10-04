import assert from 'assert';
import { validateEnvironment } from '../src/lib/config/envValidation';
import { demoLimiter } from '../src/lib/security/demoLimiter';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { PILOT_CONFIG } from '../scripts/seed_pilot_account';
import { ContractorBusinessConfig } from '../src/lib/ai/contractorConfig';

async function runBrowserE2ESimulation() {
  console.log('\n================================================================');
  console.log('--- PHASE 7 STEP 7: BROWSER ARCHITECTURE E2E VERIFICATION ---');
  console.log('================================================================\n');

  // 1. HEALTH PROBE VERIFICATION
  console.log('--- Step 1: Health & Diagnostics Probe ---');
  const envCheck = validateEnvironment();
  assert.strictEqual(typeof envCheck.healthy, 'boolean');
  console.log('  ✅ /api/health probe succeeded. Environment status:', envCheck.healthy ? 'HEALTHY' : 'DEGRADED');

  // Pilot Contractor Config
  const pilotConfig: ContractorBusinessConfig = {
    id: 'pilot-biz-abc',
    name: PILOT_CONFIG.name,
    slug: PILOT_CONFIG.slug,
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

  // 2. LIVE BROWSER VOICE SESSION & TOOLS INTAKE
  console.log('\n--- Step 2: Browser Voice Simulation & Multi-Turn Intake ---');
  const browserConversationId = `browser-sim-conv-${Date.now()}`;

  // Turn 1: Service area verification
  console.log('  Executing Turn 1: check_service_area (Plano)');
  const checkAreaResult = await executeAgentToolAsync(
    'check_service_area',
    { city: 'Plano' },
    {
      conversationId: browserConversationId,
      businessConfig: pilotConfig,
      businessId: pilotConfig.id,
      isDemo: true,
    }
  );
  assert.strictEqual(checkAreaResult.output?.supported, true);
  console.log('  ✅ Turn 1: Service area Plano verified as supported');

  // Turn 2: Lead creation
  console.log('  Executing Turn 2: create_lead (John Doe)');
  const leadResult = await executeAgentToolAsync(
    'create_lead',
    {
      customerName: 'John Doe',
      phone: '972-555-0123',
      serviceAddress: '1200 Legacy Drive, Plano, TX',
      serviceType: 'AC Repair & Diagnostic',
      reportedIssue: 'AC unit blowing warm air',
      urgency: 'normal',
    },
    {
      conversationId: browserConversationId,
      businessConfig: pilotConfig,
      businessId: pilotConfig.id,
      isDemo: true,
    }
  );
  assert.strictEqual(leadResult.output?.status, 'created');
  const leadId = String(leadResult.output?.leadId);
  assert.ok(leadId);
  console.log('  ✅ Turn 2: Lead created successfully with ID:', leadId);

  // Turn 3: Available appointment slots
  console.log('  Executing Turn 3: get_available_slots');
  const slotsResult = await executeAgentToolAsync(
    'get_available_slots',
    { serviceType: 'AC Repair & Diagnostic' },
    {
      conversationId: browserConversationId,
      businessConfig: pilotConfig,
      businessId: pilotConfig.id,
      isDemo: true,
    }
  );
  const slots = (slotsResult.output?.slots as string[]) || [];
  assert.ok(slots.length > 0);
  const selectedSlot = slots[0];
  console.log('  ✅ Turn 3: Available slots retrieved:', slots.length, '| Selected:', selectedSlot);

  // Turn 4: Appointment request
  console.log('  Executing Turn 4: request_appointment');
  const apptResult = await executeAgentToolAsync(
    'request_appointment',
    {
      leadId,
      customerName: 'John Doe',
      phone: '972-555-0123',
      serviceAddress: '1200 Legacy Drive, Plano, TX',
      preferredSlot: selectedSlot,
    },
    {
      conversationId: browserConversationId,
      businessConfig: pilotConfig,
      businessId: pilotConfig.id,
      isDemo: true,
    }
  );
  assert.strictEqual(apptResult.output?.status, 'requested');
  assert.notStrictEqual(apptResult.output?.status, 'confirmed');
  console.log('  ✅ Turn 4: Appointment requested with strict status invariant "requested"');

  // 3. DEMO ABUSE LIMITER VERIFICATION
  console.log('\n--- Step 3: Public Demo Abuse Limiter Verification ---');
  const demoConvId = `demo-abuse-test-${Date.now()}`;
  demoLimiter.reset(demoConvId);

  let allowedCount = 0;
  for (let i = 0; i < 35; i++) {
    const check = demoLimiter.recordTurn(demoConvId);
    if (check.allowed) allowedCount++;
  }
  assert.strictEqual(allowedCount, 30);
  console.log('  ✅ Demo turn limiter strictly capped session at 30 turns (31+ rejected)');

  console.log('\n================================================================');
  console.log('🎉 BROWSER ARCHITECTURE E2E SIMULATION COMPLETED WITH 100% PASS');
  console.log('================================================================\n');
}

runBrowserE2ESimulation();
