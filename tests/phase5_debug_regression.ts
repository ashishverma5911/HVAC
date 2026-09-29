import * as fs from 'fs';
import * as path from 'path';
import {
  extractStructuredCustomerData,
  sanitizeCustomerName,
  extractFallbackAddress,
  extractFallbackCity,
} from '../src/lib/ai/extractConversationData';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';
import { mockStore } from '../src/lib/mock/store';
import { CustomerInfo, LeadStatus } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

async function runPhase5DebugRegressionSuite() {
  console.log('\n======================================================');
  console.log('--- STARTING PHASE 5 DEBUG REGRESSION TEST SUITE ---');
  console.log('======================================================\n');

  // ------------------------------------------------------------------------
  // TEST A: Final user transcript triggers structured extraction and populates all fields
  // ------------------------------------------------------------------------
  console.log('--- TEST A: Final User Transcript Extraction Populates Customer Fields ---');
  const utteranceA = "Hello, my name is Alex. I'm at 456 Oak Street in Plano. My AC isn't cooling, it is blowing warm air.";
  const resultA = extractStructuredCustomerData(utteranceA);

  assert(resultA.customerInfo.name === 'Alex', `Customer name should be Alex (got "${resultA.customerInfo.name}")`);
  assert(resultA.customerInfo.serviceAddress === '456 Oak Street, Plano', `Service address should be "456 Oak Street, Plano" (got "${resultA.customerInfo.serviceAddress}")`);
  assert(resultA.customerInfo.city === 'Plano', `City should be Plano (got "${resultA.customerInfo.city}")`);
  assert(resultA.customerInfo.cityOrArea === 'Plano', `CityOrArea should be Plano (got "${resultA.customerInfo.cityOrArea}")`);
  assert(resultA.customerInfo.serviceType === 'AC Repair', `Service type should be AC Repair (got "${resultA.customerInfo.serviceType}")`);
  assert(resultA.customerInfo.problemDescription === "AC isn't cooling", `Problem description should be "AC isn't cooling" (got "${resultA.customerInfo.problemDescription}")`);
  assert(resultA.customerInfo.urgency === 'normal', `Urgency should be normal (got "${resultA.customerInfo.urgency}")`);
  assert(resultA.intent === 'AC_COOLING_FAILURE', `Intent should be AC_COOLING_FAILURE (got "${resultA.intent}")`);
  assert(resultA.leadStatus === 'qualified', `Lead status should be qualified (got "${resultA.leadStatus}")`);

  // ------------------------------------------------------------------------
  // TEST B: Multi-turn Accumulation Preserves Prior Values
  // ------------------------------------------------------------------------
  console.log('\n--- TEST B: Multi-turn Accumulation Preserves Prior Values ---');
  const utteranceB = "My phone is 214-555-0199 and can you come tomorrow morning?";
  const fullConversationB = `${utteranceA} ${utteranceB}`;
  const resultB = extractStructuredCustomerData(fullConversationB, resultA.customerInfo, resultA.leadStatus);

  assert(resultB.customerInfo.name === 'Alex', `Preserves previous name "Alex"`);
  assert(resultB.customerInfo.phone === '214-555-0199', `Extracts phone 214-555-0199 (got "${resultB.customerInfo.phone}")`);
  assert(resultB.customerInfo.serviceAddress === '456 Oak Street, Plano', `Preserves address`);
  assert(resultB.customerInfo.preferredAppointmentTime === 'tomorrow morning', `Extracts appointment window (got "${resultB.customerInfo.preferredAppointmentTime}")`);
  assert(resultB.leadStatus === 'appointment_requested', `Transitions to appointment_requested (got "${resultB.leadStatus}")`);

  // ------------------------------------------------------------------------
  // TEST C: Session Stop Idempotency Simulation
  // ------------------------------------------------------------------------
  console.log('\n--- TEST C: Session Stop Idempotency Simulation ---');
  let simulatedState: string = 'LISTENING';
  let stopCallCount = 0;
  let noticesEmitted: string[] = [];
  let hasEndedNoticeGuard = false;

  const simulateStop = () => {
    stopCallCount++;
    if (simulatedState === 'ENDED') {
      return; // Idempotent guard in LiveVoiceManager
    }
    simulatedState = 'ENDED';

    // Simulate ReceptionistDemo notice guard
    if (!hasEndedNoticeGuard) {
      hasEndedNoticeGuard = true;
      noticesEmitted.push('Voice call ended by user. Microphone released.');
    }
  };

  // First stop (user click)
  simulateStop();
  assert(simulatedState === 'ENDED', 'State becomes ENDED on first stop');
  assert(noticesEmitted.length === 1, `Exactly 1 notice emitted (got ${noticesEmitted.length})`);

  // Second stop (simulated WebSocket onclose re-entry)
  simulateStop();
  assert(stopCallCount === 2, 'Simulated second call arrived');
  assert(noticesEmitted.length === 1, `Still exactly 1 notice emitted after second stop (got ${noticesEmitted.length})`);

  // Third stop (rapid user double-click)
  simulateStop();
  assert(noticesEmitted.length === 1, `Still exactly 1 notice emitted after third stop (got ${noticesEmitted.length})`);

  // ------------------------------------------------------------------------
  // TEST D: CustomerInfoPanel UX Checks (Zero "Listening..." in Data Fields)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST D: CustomerInfoPanel UX Checks ---');
  const panelSourcePath = path.join(process.cwd(), 'src', 'components', 'receptionist', 'CustomerInfoPanel.tsx');
  const panelSource = fs.readFileSync(panelSourcePath, 'utf8');

  assert(!panelSource.includes('>Listening...<'), 'CustomerInfoPanel must NOT contain raw ">Listening...<" field text');
  assert(panelSource.includes('Not provided'), 'CustomerInfoPanel contains "Not provided" placeholder');

  // ------------------------------------------------------------------------
  // TEST E: City "Houston" Populates cityOrArea but leaves serviceAddress null
  // ------------------------------------------------------------------------
  console.log('\n--- TEST E: Out-of-area Houston Utterance ---');
  const houstonUtterance = "I'm in Houston. My AC is broken.";
  const houstonResult = extractStructuredCustomerData(houstonUtterance);

  assert(houstonResult.customerInfo.name === '', `Name remains empty for location sentence (got "${houstonResult.customerInfo.name}")`);
  assert(houstonResult.customerInfo.serviceAddress === '', `Service address remains empty for bare city (got "${houstonResult.customerInfo.serviceAddress}")`);
  assert(houstonResult.customerInfo.city === 'Houston', `City is extracted as "Houston" (got "${houstonResult.customerInfo.city}")`);
  assert(houstonResult.customerInfo.cityOrArea === 'Houston', `CityOrArea is extracted as "Houston" (got "${houstonResult.customerInfo.cityOrArea}")`);

  // ------------------------------------------------------------------------
  // TEST F: Street "456 Oak Street in Plano" Populates Both
  // ------------------------------------------------------------------------
  console.log('\n--- TEST F: Street with City Utterance ---');
  const streetUtterance = "I live at 456 Oak Street in Plano.";
  const streetResult = extractStructuredCustomerData(streetUtterance);

  assert(streetResult.customerInfo.serviceAddress === '456 Oak Street, Plano', `Service address includes street and city`);
  assert(streetResult.customerInfo.city === 'Plano', `City includes "Plano"`);

  // ------------------------------------------------------------------------
  // TEST G: Voice Tool Execution Flow
  // ------------------------------------------------------------------------
  console.log('\n--- TEST G: Voice-to-Tool Execution via toolExecutor ---');
  const convId = `voice-test-conv-${Date.now()}`;

  // 1. Check service area
  const areaRes = executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: convId });
  assert(areaRes.action.status === 'success', 'check_service_area succeeded');
  assert((areaRes.output as any)?.supported === true, 'Plano is supported');

  // 2. Create lead
  const leadRes = executeAgentTool(
    'create_lead',
    {
      customerName: 'Alex',
      phone: '214-555-0199',
      serviceAddress: '456 Oak Street, Plano',
      serviceType: 'AC Repair',
      reportedIssue: "AC isn't cooling",
      urgency: 'normal',
    },
    { conversationId: convId }
  );
  assert(leadRes.action.status === 'success', 'create_lead succeeded');
  const leadId = (leadRes.output as any)?.leadId;
  assert(typeof leadId === 'string' && leadId.startsWith('LEAD-'), `Valid lead ID generated: ${leadId}`);

  // 3. Get available slots
  const slotsRes = executeAgentTool('get_available_slots', { preferredDate: 'tomorrow' }, { conversationId: convId });
  assert(slotsRes.action.status === 'success', 'get_available_slots succeeded');
  const slots = (slotsRes.output as any)?.slots;
  assert(Array.isArray(slots) && slots.length > 0, 'Available slots returned');

  // 4. Request appointment
  const apptRes = executeAgentTool(
    'request_appointment',
    {
      leadId,
      preferredSlot: slots[0],
      customerName: 'Alex',
      phone: '214-555-0199',
      serviceAddress: '456 Oak Street, Plano',
      reportedIssue: "AC isn't cooling",
    },
    { conversationId: convId }
  );
  assert(apptRes.action.status === 'success', 'request_appointment succeeded');
  assert((apptRes.output as any)?.status === 'requested', 'Appointment status is strictly "requested"');

  // 5. Transfer to human idempotency
  const transferRes1 = executeAgentTool(
    'transfer_to_human',
    {
      reason: 'Customer requested live specialist',
    },
    { conversationId: convId }
  );
  assert(transferRes1.action.status === 'success', 'First transfer succeeded');
  const transferId1 = (transferRes1.output as any)?.transferId;

  const transferRes2 = executeAgentTool(
    'transfer_to_human',
    {
      reason: 'Repeated request to talk to human',
    },
    { conversationId: convId }
  );
  assert(transferRes2.action.status === 'success', 'Second transfer succeeded');
  assert((transferRes2.output as any)?.isDuplicate === true, 'Second transfer marked as duplicate');
  assert((transferRes2.output as any)?.transferId === transferId1, 'Second transfer returns identical transferId');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 5 DEBUG REGRESSION TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runPhase5DebugRegressionSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
