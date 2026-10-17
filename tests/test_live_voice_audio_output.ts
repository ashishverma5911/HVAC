import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { LiveVoiceManager, LiveTranscriptTurn, VoiceState } from '../src/lib/ai/liveVoiceManager';
import { base64ToInt16Array, pcm16ToFloat32 } from '../src/lib/ai/audioUtils';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

async function runLiveVoiceAudioOutputTests() {
  console.log('\n======================================================');
  console.log('--- TESTING LIVE VOICE AUDIO OUTPUT & ROBUSTNESS ---');
  console.log('======================================================\n');

  // TEST 1: Robust base64ToInt16Array with odd lengths and non-standard base64
  console.log('--- TEST 1: base64ToInt16Array Resilience ---');
  
  // Standard valid base64 (2 samples = 4 bytes)
  const validPcm = new Int16Array([1000, -2000]);
  const validB64 = Buffer.from(validPcm.buffer).toString('base64');
  const decoded1 = base64ToInt16Array(validB64);
  assert(decoded1.length === 2, `Decodes 2 samples (got ${decoded1.length})`);
  assert(decoded1[0] === 1000 && decoded1[1] === -2000, 'Preserves PCM sample values');

  // Odd byte length (3 bytes = 1 sample + 1 trailing byte)
  const oddBytes = Buffer.from([0x10, 0x20, 0x30]); // 3 bytes
  const oddB64 = oddBytes.toString('base64');
  const decodedOdd = base64ToInt16Array(oddB64);
  assert(decodedOdd.length === 1, `Safely truncates odd byte without throwing RangeError (got ${decodedOdd.length})`);

  // URL-safe unpadded base64
  const urlSafe = validB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const decodedUrlSafe = base64ToInt16Array(urlSafe);
  assert(decodedUrlSafe.length === 2, 'Decodes URL-safe unpadded base64 cleanly');

  // TEST 2: LiveVoiceManager instance lifecycle & opening greeting
  console.log('\n--- TEST 2: LiveVoiceManager Greeting & Methods ---');
  let currentState: VoiceState = 'IDLE';
  let receivedTurns: LiveTranscriptTurn[] = [];

  const manager = new LiveVoiceManager({
    onStateChange: (state) => {
      currentState = state;
    },
    onTranscript: (turn) => {
      receivedTurns.push(turn);
    },
  });

  assert(manager.getState() === 'IDLE', 'Initial state is IDLE');
  assert(!manager.isMuted(), 'Initial mute state is false');

  const customGreeting = "Thanks for calling Apex HVAC. I'm AERIS, how can I help you?";
  manager.setOpeningGreeting(customGreeting);

  // Verify sendUserText returns false when not connected
  const sentWhenIdle = manager.sendUserText("My AC is broken");
  assert(sentWhenIdle === false, 'sendUserText safely returns false when session is not connected');

  // TEST 3: Mock live session connection & spoken greeting verification
  console.log('\n--- TEST 3: Live Session Trigger & Spoken Output ---');
  let sentClientContentPayloads: any[] = [];
  let sentRealtimeInputPayloads: any[] = [];

  const mockSession = {
    sendClientContent: (payload: any) => {
      sentClientContentPayloads.push(payload);
    },
    sendRealtimeInput: (payload: any) => {
      sentRealtimeInputPayloads.push(payload);
    },
    close: () => {},
  };

  // Inject mock session into manager using private property access for testing
  (manager as any).liveSession = mockSession;
  (manager as any).state = 'LISTENING';

  // Trigger opening greeting
  manager.triggerInitialGreeting();

  assert(sentClientContentPayloads.length === 1, 'Initial greeting was sent to live session');
  const greetingTurn = sentClientContentPayloads[0].turns?.[0]?.parts?.[0]?.text;
  assert(greetingTurn.includes(customGreeting), `Payload contains custom greeting (got "${greetingTurn}")`);

  // Triggering again should be idempotent (prevent duplicate greetings)
  manager.triggerInitialGreeting();
  assert(sentClientContentPayloads.length === 1, 'triggerInitialGreeting is strictly idempotent');

  // Send user text during active call
  const sentSuccess = manager.sendUserText("Hello, my AC is blowing warm air.");
  assert(sentSuccess === true, 'sendUserText succeeds during active call');
  assert(sentClientContentPayloads.length === 2, 'User turn was sent to live session');
  const userTurn = sentClientContentPayloads[1].turns?.[0]?.parts?.[0]?.text;
  assert(userTurn === "Hello, my AC is blowing warm air.", 'User turn text sent verbatim');

  // TEST 4: Stop and restart lifecycle
  console.log('\n--- TEST 4: Stop and Restart Lifecycle ---');
  manager.stop();
  assert(manager.getState() === 'ENDED', 'State is ENDED after stop()');
  assert((manager as any).liveSession === null, 'Live session reference cleared after stop()');

  console.log('\n======================================================');
  console.log('🎉 ALL AUDIO OUTPUT & ROBUSTNESS TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runLiveVoiceAudioOutputTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
