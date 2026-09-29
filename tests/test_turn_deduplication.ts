import { LiveTranscriptTurn } from '../src/lib/ai/liveVoiceManager';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

interface Message {
  id: string;
  sender: 'customer' | 'ai' | 'system';
  text: string;
  timestamp: string;
}

// React State Reducer Simulation matching ReceptionistDemo.tsx
function applyTurnToMessages(prev: Message[], turn: LiveTranscriptTurn): Message[] {
  const timeStr = '10:00 PM';
  const existingIndex = prev.findIndex((m) => m.id === turn.turnId);
  if (existingIndex !== -1) {
    const updated = [...prev];
    updated[existingIndex] = {
      ...updated[existingIndex],
      text: turn.text,
      timestamp: timeStr,
    };
    return updated;
  }
  return [
    ...prev,
    {
      id: turn.turnId,
      sender: turn.speaker,
      text: turn.text,
      timestamp: timeStr,
    },
  ];
}

async function testTurnDeduplication() {
  console.log('--------------------------------------------------');
  console.log('Testing Canonical Turn Deduplication Architecture');
  console.log('--------------------------------------------------\n');

  let messages: Message[] = [];

  // Scenario: Customer speaks "Hi, my name is Alex. My AC is broken." in 4 streaming deltas
  const userTurnId = 'turn-user-1';
  const userDeltas = [
    'Hi, ',
    'Hi, my name is ',
    'Hi, my name is Alex. ',
    'Hi, my name is Alex. My AC is broken.',
  ];

  for (const delta of userDeltas) {
    messages = applyTurnToMessages(messages, {
      turnId: userTurnId,
      speaker: 'customer',
      text: delta,
      isFinal: false,
    });
  }

  assert(messages.length === 1, `After 4 interim chunks, exactly 1 message should exist (got ${messages.length})`);
  assert(messages[0].text === 'Hi, my name is Alex. My AC is broken.', 'Interim message text updated in place');

  // Model begins speaking -> finalizeUserTurn is called with isFinal: true
  messages = applyTurnToMessages(messages, {
    turnId: userTurnId,
    speaker: 'customer',
    text: 'Hi, my name is Alex. My AC is broken.',
    isFinal: true,
  });

  assert(messages.length === 1, `After final user turn, message count must remain EXACTLY 1 (got ${messages.length})`);
  assert(messages[0].id === userTurnId, `Message ID must match canonical turnId ${userTurnId}`);

  // Scenario: AI speaks "I can help with your AC. What is your address?" in 3 streaming deltas
  const aiTurnId = 'turn-ai-1';
  const aiDeltas = [
    'I can help ',
    'I can help with your AC. ',
    'I can help with your AC. What is your address?',
  ];

  for (const delta of aiDeltas) {
    messages = applyTurnToMessages(messages, {
      turnId: aiTurnId,
      speaker: 'ai',
      text: delta,
      isFinal: false,
    });
  }

  assert(messages.length === 2, `After AI interim chunks, exactly 2 messages should exist (got ${messages.length})`);
  assert(messages[1].text === 'I can help with your AC. What is your address?', 'AI message text updated in place');

  // turnComplete fires -> finalizeAiTurn is called with isFinal: true
  messages = applyTurnToMessages(messages, {
    turnId: aiTurnId,
    speaker: 'ai',
    text: 'I can help with your AC. What is your address?',
    isFinal: true,
  });

  assert(messages.length === 2, `After AI turn finalized, message count must remain EXACTLY 2 (got ${messages.length})`);
  assert(messages[1].id === aiTurnId, `AI message ID must match canonical turnId ${aiTurnId}`);

  // Edge Case: If another finalize call runs for the same turn, messages must not duplicate
  messages = applyTurnToMessages(messages, {
    turnId: aiTurnId,
    speaker: 'ai',
    text: 'I can help with your AC. What is your address?',
    isFinal: true,
  });

  assert(messages.length === 2, `Redundant finalize calls must NEVER create duplicates (got ${messages.length})`);

  console.log('\n🎉 ALL TURN DEDUPLICATION TESTS PASSED! 🎉\n');
}

testTurnDeduplication().catch((err) => {
  console.error(err);
  process.exit(1);
});
