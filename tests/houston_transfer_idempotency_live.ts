async function runHoustonTest() {
  console.log('\n================================================================');
  console.log('--- TESTING HOUSTON MULTI-TURN TRANSFER IDEMPOTENCY ---');
  console.log('================================================================\n');

  const conversationId = `houston-test-${Date.now()}`;
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
  // TURN 1: Unsupported location
  // -------------------------------------------------------------
  console.log('\n--- TURN 1: "My AC isn\'t cooling. I\'m in Houston." ---');
  const turn1Msg = "My AC isn't cooling. I'm in Houston.";
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
  console.log('Turn 1 Lead Status:', data1.leadStatus);

  assert(res1.status === 200, 'Turn 1 HTTP status is 200');
  assert(data1.extractedData.city === 'Houston', 'Turn 1: city is Houston');
  assert(data1.extractedData.serviceAddress === null, 'Turn 1: serviceAddress is null (no street address invented)');
  assert(data1.executedActions?.some((a: any) => a.toolName === 'check_service_area'), 'Turn 1: check_service_area was called');
  assert(data1.executedActions?.some((a: any) => a.toolName === 'transfer_to_human' && a.status === 'success'), 'Turn 1: transfer_to_human was executed');
  assert(data1.leadStatus === 'transferred', 'Turn 1: leadStatus is transferred');

  currentData = data1.extractedData;
  messages.push({ role: 'model', content: data1.message });

  // -------------------------------------------------------------
  // TURN 2: Customer asks to speak with a person again
  // -------------------------------------------------------------
  console.log('\n--- TURN 2: "I\'d like to speak with a person." ---');
  const turn2Msg = "I'd like to speak with a person.";
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
  console.log('Turn 2 Lead Status:', data2.leadStatus);

  assert(res2.status === 200, 'Turn 2 HTTP status is 200');
  assert(
    !data2.executedActions?.some((a: any) => a.toolName === 'transfer_to_human'),
    'Turn 2: transfer_to_human did NOT execute again (idempotent)'
  );
  assert(
    data2.message.toLowerCase().includes('already') ||
    data2.message.toLowerCase().includes('connecting') ||
    data2.message.toLowerCase().includes('routed'),
    'Turn 2: Response clarifies that caller is already being routed/transferred'
  );
  assert(data2.leadStatus === 'transferred', 'Turn 2: leadStatus remains transferred');
  assert(data2.extractedData.city === 'Houston', 'Turn 2: city remains Houston');
  assert(data2.extractedData.serviceAddress === null, 'Turn 2: serviceAddress remains null');

  console.log('\n================================================================');
  console.log('🎉 HOUSTON TRANSFER IDEMPOTENCY TEST PASSED COMPLETELY! 🎉');
  console.log('================================================================\n');
}

runHoustonTest().catch((err) => {
  console.error('Fatal error during Houston test:', err);
  process.exit(1);
});
