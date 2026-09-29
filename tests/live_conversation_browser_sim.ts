async function runLiveSimulation() {
  console.log('\n================================================================');
  console.log('--- RUNNING LIVE MULTI-TURN BROWSER-IDENTICAL WORKFLOW ---');
  console.log('================================================================\n');

  const conversationId = `live-sim-${Date.now()}`;
  const messages: { role: 'user' | 'model'; content: string }[] = [];
  let currentData: any = {};
  let leadId: string | undefined;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
    }
    console.log(`✅ PASSED: ${msg}`);
  }

  // -------------------------------------------------------------
  // TURN 1
  // -------------------------------------------------------------
  console.log('\n--- TURN 1: Customer Details Intake ---');
  const turn1Msg = "My name is Alex, my phone is 214-555-0199, I'm at 456 Oak Street in Plano, and my AC isn't cooling.";
  messages.push({ role: 'user', content: turn1Msg });

  const res1 = await fetch('http://localhost:3000/api/receptionist/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      currentData,
      conversationId,
      leadId,
    }),
  });

  const data1 = await res1.json();
  console.log('Turn 1 Response Message:\n', data1.message);
  console.log('Turn 1 Executed Actions:', data1.executedActions?.map((a: any) => `${a.toolName}: ${a.status}`));
  console.log('Turn 1 Extracted Data:', data1.extractedData);
  console.log('Turn 1 Lead Status:', data1.leadStatus, '| LeadId:', data1.leadId);

  assert(res1.status === 200, 'Turn 1 HTTP status is 200');
  assert(data1.executedActions?.some((a: any) => a.toolName === 'check_service_area' && a.status === 'success'), 'Turn 1: check_service_area executed successfully');
  assert(data1.executedActions?.some((a: any) => a.toolName === 'create_lead' && a.status === 'success'), 'Turn 1: create_lead executed successfully');
  assert(typeof data1.leadId === 'string' && data1.leadId.startsWith('LEAD-'), 'Turn 1: Valid leadId returned');
  assert(data1.extractedData.customerName === 'Alex', 'Turn 1: customerName is Alex');
  assert(data1.extractedData.serviceAddress === '456 Oak Street, Plano', 'Turn 1: serviceAddress is 456 Oak Street, Plano');
  assert(data1.extractedData.phone === '214-555-0199', 'Turn 1: phone is 214-555-0199');
  assert(data1.leadStatus === 'qualified', 'Turn 1: leadStatus is qualified');
  assert(!data1.message.includes('$89'), 'Turn 1: No $89 hallucinated');
  assert(!/\$\s*\d+/.test(data1.message), 'Turn 1: No dollar amount invented');

  leadId = data1.leadId;
  currentData = data1.extractedData;
  messages.push({ role: 'model', content: data1.message });

  // -------------------------------------------------------------
  // TURN 2
  // -------------------------------------------------------------
  console.log('\n--- TURN 2: Inquire About Tomorrow ---');
  const turn2Msg = "Can someone come tomorrow?";
  messages.push({ role: 'user', content: turn2Msg });

  const res2 = await fetch('http://localhost:3000/api/receptionist/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      currentData,
      conversationId,
      leadId,
    }),
  });

  const data2 = await res2.json();
  console.log('Turn 2 Response Message:\n', data2.message);
  console.log('Turn 2 Executed Actions:', data2.executedActions?.map((a: any) => `${a.toolName}: ${a.status}`));
  console.log('Turn 2 Lead Status:', data2.leadStatus, '| LeadId:', data2.leadId);

  assert(res2.status === 200, 'Turn 2 HTTP status is 200');
  assert(data2.executedActions?.some((a: any) => a.toolName === 'get_available_slots' && a.status === 'success'), 'Turn 2: get_available_slots executed successfully');
  assert(data2.leadId === leadId, 'Turn 2: Lead ID strictly preserved across turns');
  assert(!data2.message.includes('$89'), 'Turn 2: No $89 hallucinated');
  assert(!/\$\s*\d+/.test(data2.message), 'Turn 2: No dollar amount invented');
  assert(!data2.message.startsWith('Thank you for reaching out to Summit HVAC'), 'Turn 2: Does not repeat generic opening greeting');

  currentData = data2.extractedData;
  messages.push({ role: 'model', content: data2.message });

  // -------------------------------------------------------------
  // TURN 3
  // -------------------------------------------------------------
  console.log('\n--- TURN 3: Select Slot ---');
  const turn3Msg = "3 PM works for me.";
  messages.push({ role: 'user', content: turn3Msg });

  const res3 = await fetch('http://localhost:3000/api/receptionist/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      currentData,
      conversationId,
      leadId,
    }),
  });

  const data3 = await res3.json();
  console.log('Turn 3 Response Message:\n', data3.message);
  console.log('Turn 3 Executed Actions:', data3.executedActions?.map((a: any) => `${a.toolName}: ${a.status}`));
  console.log('Turn 3 Lead Status:', data3.leadStatus, '| AppointmentId:', data3.appointmentId);

  assert(res3.status === 200, 'Turn 3 HTTP status is 200');
  assert(data3.executedActions?.some((a: any) => a.toolName === 'request_appointment' && a.status === 'success'), 'Turn 3: request_appointment executed successfully');
  assert(typeof data3.appointmentId === 'string' && data3.appointmentId.startsWith('APT-'), 'Turn 3: Valid appointmentId returned');
  assert(data3.leadStatus === 'appointment_requested', 'Turn 3: leadStatus is appointment_requested');
  assert(!data3.message.includes('$89'), 'Turn 3: No $89 hallucinated');
  assert(!/\$\s*\d+/.test(data3.message), 'Turn 3: No dollar amount invented');

  currentData = data3.extractedData;
  messages.push({ role: 'model', content: data3.message });

  // -------------------------------------------------------------
  // TURN 4
  // -------------------------------------------------------------
  console.log('\n--- TURN 4: Demand Human Representative ---');
  const turn4Msg = "I want to speak with a person.";
  messages.push({ role: 'user', content: turn4Msg });

  const res4 = await fetch('http://localhost:3000/api/receptionist/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      currentData,
      conversationId,
      leadId,
    }),
  });

  const data4 = await res4.json();
  console.log('Turn 4 Response Message:\n', data4.message);
  console.log('Turn 4 Executed Actions:', data4.executedActions?.map((a: any) => `${a.toolName}: ${a.status}`));
  console.log('Turn 4 Lead Status:', data4.leadStatus);

  assert(res4.status === 200, 'Turn 4 HTTP status is 200');
  assert(data4.executedActions?.some((a: any) => a.toolName === 'transfer_to_human' && a.status === 'success'), 'Turn 4: transfer_to_human executed successfully');
  assert(data4.leadStatus === 'transferred', 'Turn 4: leadStatus is transferred');
  assert(!data4.message.includes('$89'), 'Turn 4: No $89 hallucinated');
  assert(!/\$\s*\d+/.test(data4.message), 'Turn 4: No dollar amount invented');

  console.log('\n================================================================');
  console.log('🎉 LIVE WORKFLOW PASSED ALL 4 TURNS & ALL CRITERIA! 🎉');
  console.log('================================================================\n');
}

runLiveSimulation().catch((err) => {
  console.error('Fatal error during live simulation:', err);
  process.exit(1);
});
