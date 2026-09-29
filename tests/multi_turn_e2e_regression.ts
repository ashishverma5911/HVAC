import { extractFallbackName, extractFallbackPhone, extractFallbackAddress, extractFallbackServiceType, extractFallbackReportedIssue, inferIntent, normalizeUrgency, mergeCustomerInfo } from '../src/lib/ai/extractConversationData';
import { mockStore } from '../src/lib/mock/store';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runRegressionTests() {
  console.log('\n--- TESTING EXTRACTION ON EXACT USER INPUT ---\n');

  const text1 = "My name is Alex, my phone number is 214-555-0199, I'm at 456 Oak Street in Plano, and my AC isn't cooling.";

  const name = extractFallbackName(text1);
  const phone = extractFallbackPhone(text1);
  const address = extractFallbackAddress(text1);
  const serviceType = extractFallbackServiceType(text1);
  const issue = extractFallbackReportedIssue(text1);
  const urgency = normalizeUrgency(null, text1);
  const intent = inferIntent(null, text1, []);

  console.log('Extracted Values:', { name, phone, address, serviceType, issue, urgency, intent });

  assert(name === 'Alex', `customerName should be "Alex", got: "${name}"`);
  assert(phone === '214-555-0199', `phone should be "214-555-0199", got: "${phone}"`);
  assert(address === '456 Oak Street, Plano', `serviceAddress should be "456 Oak Street, Plano", got: "${address}"`);
  assert(serviceType === 'AC Repair', `serviceType should be "AC Repair", got: "${serviceType}"`);
  assert(issue === "AC isn't cooling", `reportedIssue should be "AC isn't cooling", got: "${issue}"`);
  assert(urgency === 'normal', `urgency should be "normal", got: "${urgency}"`);
  assert(intent === 'AC_COOLING_FAILURE', `detectedIntent should be "AC_COOLING_FAILURE", got: "${intent}"`);

  console.log('\n--- TESTING MULTI-TURN SEQUENCE 1 ---\n');
  // Customer: "My name is Alex, my phone number is 214-555-0199, I'm at 456 Oak Street in Plano, and my AC isn't cooling."
  // Customer: "Can someone come tomorrow?"
  {
    mockStore.resetStore();
    const convId = 'regression-conv-1';
    const session = mockStore.getSession(convId);

    // Turn 1
    const saRes = executeAgentTool('check_service_area', { city: address! }, { conversationId: convId });
    assert(saRes.success && saRes.output?.supported === true, 'Turn 1: Service area supported');

    const leadRes = executeAgentTool('create_lead', {
      customerName: name!,
      phone: phone!,
      serviceAddress: address!,
      serviceType: serviceType!,
      reportedIssue: issue!,
      urgency,
    }, { conversationId: convId });
    assert(leadRes.success && Boolean(leadRes.output?.leadId), `Turn 1: Lead created with ID ${leadRes.output?.leadId}`);
    assert(session.leadId === leadRes.output?.leadId, 'Turn 1: session.leadId set');

    // Turn 2: "Can someone come tomorrow?"
    const fullConversation = text1 + '\nCan someone come tomorrow?';
    const intentTurn2 = inferIntent(null, fullConversation, []);
    assert(intentTurn2 === 'APPOINTMENT', `Turn 2 intent should be "APPOINTMENT", got: "${intentTurn2}"`);

    const slotsRes = executeAgentTool('get_available_slots', { serviceType: serviceType!, urgency }, { conversationId: convId });
    assert(slotsRes.success && Array.isArray(slotsRes.output?.slots), 'Turn 2: get_available_slots executed');
    assert(session.slotsChecked === true, 'Turn 2: session.slotsChecked is true');
    const slots = (slotsRes.output?.slots as string[]) || [];
    assert(slots.length === 8, 'Turn 2: 8 slots available');
  }

  console.log('\n--- TESTING MULTI-TURN SEQUENCE 2 (3 STEPS) ---\n');
  // 1. "My AC isn't cooling."
  // 2. "My name is Alex, my phone is 214-555-0199, and I'm at 456 Oak Street in Plano."
  // 3. "Can someone come tomorrow?"
  {
    mockStore.resetStore();
    const convId = 'regression-conv-2';
    const session = mockStore.getSession(convId);

    // Step 1: "My AC isn't cooling."
    const u1 = "My AC isn't cooling.";
    const intent1 = inferIntent(null, u1, []);
    assert(intent1 === 'AC_COOLING_FAILURE', 'Step 1 intent is AC_COOLING_FAILURE');
    assert(extractFallbackName(u1) === null, 'Step 1: name is null (incomplete)');
    assert(session.leadId === null, 'Step 1: lead NOT created with incomplete details');

    // Step 2: "My name is Alex, my phone is 214-555-0199, and I'm at 456 Oak Street in Plano."
    const u2 = u1 + '\nMy name is Alex, my phone is 214-555-0199, and I\'m at 456 Oak Street in Plano.';
    const name2 = extractFallbackName(u2);
    const phone2 = extractFallbackPhone(u2);
    const address2 = extractFallbackAddress(u2);
    const serviceType2 = extractFallbackServiceType(u2);
    const issue2 = extractFallbackReportedIssue(u2);

    assert(name2 === 'Alex', `Step 2 name is "Alex", got: "${name2}"`);
    assert(phone2 === '214-555-0199', `Step 2 phone is "214-555-0199", got: "${phone2}"`);
    assert(address2 === '456 Oak Street, Plano', `Step 2 address is "456 Oak Street, Plano", got: "${address2}"`);
    assert(serviceType2 === 'AC Repair', `Step 2 serviceType is "AC Repair", got: "${serviceType2}"`);
    assert(issue2 === "AC isn't cooling", `Step 2 issue is "AC isn't cooling", got: "${issue2}"`);

    // Verify lead creation
    executeAgentTool('check_service_area', { city: address2! }, { conversationId: convId });
    const lead2 = executeAgentTool('create_lead', {
      customerName: name2!,
      phone: phone2!,
      serviceAddress: address2!,
      serviceType: serviceType2!,
      reportedIssue: issue2!,
      urgency: 'normal',
    }, { conversationId: convId });
    assert(lead2.success && lead2.output?.leadId === 'LEAD-0001', 'Step 2: LEAD-0001 created');

    // Step 3: "Can someone come tomorrow?"
    const u3 = u2 + '\nCan someone come tomorrow?';
    const intent3 = inferIntent(null, u3, []);
    assert(intent3 === 'APPOINTMENT', `Step 3 intent is "APPOINTMENT", got: "${intent3}"`);

    const slots3 = executeAgentTool('get_available_slots', {}, { conversationId: convId });
    assert(slots3.success && Array.isArray(slots3.output?.slots), 'Step 3: Available slots returned');
    assert(session.slotsChecked === true, 'Step 3: session.slotsChecked is true');
    assert(session.leadId === 'LEAD-0001', 'Step 3: leadId LEAD-0001 strictly preserved across turns');

    // Verify address is never downgraded to just city
    let customerInfo = {
      name: name2!,
      phone: phone2!,
      address: address2!,
      serviceAddress: address2!,
      serviceType: serviceType2!,
      problemDescription: issue2!,
      urgency: 'normal' as const,
      preferredAppointmentTime: '',
    };

    // Simulate an incoming tool or city result with just "Plano"
    const mergedWithCity = mergeCustomerInfo(customerInfo, {
      serviceAddress: 'Plano',
      address: 'Plano',
    });
    assert(mergedWithCity.serviceAddress === '456 Oak Street, Plano', 'Address was NOT downgraded from "456 Oak Street, Plano" to "Plano"');
  }

  console.log('\n🎉 ALL REGRESSION TESTS PASSED CLEANLY!\n');
}

runRegressionTests().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
