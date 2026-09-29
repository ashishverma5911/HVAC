import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import {
  floatTo16BitPCM,
  pcm16ToFloat32,
  arrayBufferToBase64,
  base64ToInt16Array,
  downsampleBuffer,
} from '../src/lib/ai/audioUtils';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';
import { mockStore } from '../src/lib/mock/store';

// Load .env.local
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

async function runPhase5VoiceSuite() {
  console.log('\n======================================================');
  console.log('--- STARTING PHASE 5 REAL-TIME VOICE TEST SUITE ---');
  console.log('======================================================\n');

  // ------------------------------------------------------------------------
  // TEST 1: Ephemeral Token Generation & Constraints Locking
  // ------------------------------------------------------------------------
  console.log('--- TEST 1: Ephemeral Token Generation & Constraints Locking ---');
  assert(!!apiKey, 'GEMINI_API_KEY must be present in .env.local');

  const serverAi = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
  console.log(`Requesting ephemeral token for model: ${liveModel}...`);

  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
        },
      },
    },
  });

  assert(typeof token.name === 'string', 'Token name must be a string');
  assert(token.name!.startsWith('auth_tokens/'), `Token name must start with "auth_tokens/" (got ${token.name})`);
  assert(!token.name!.includes(apiKey), 'Token name must NEVER contain the raw GEMINI_API_KEY');
  console.log(`Created ephemeral token: ${token.name}`);

  // ------------------------------------------------------------------------
  // TEST 2: Ephemeral Token WebSocket Live Connection
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 2: Ephemeral Token WebSocket Live Connection ---');
  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let connectionOpened = false;
  let setupReceived = false;

  await new Promise<void>(async (resolve, reject) => {
    let session: any = null;
    const timeout = setTimeout(() => {
      reject(new Error('Live connection timed out after 10 seconds'));
    }, 10000);

    try {
      session = await clientAi.live.connect({
        model: liveModel,
        callbacks: {
          onopen: () => {
            connectionOpened = true;
          },
          onmessage: (msg: any) => {
            if (msg.setupComplete) {
              setupReceived = true;
              clearTimeout(timeout);
              setTimeout(() => {
                session?.close();
                resolve();
              }, 100);
            }
          },
          onerror: (err: any) => {
            clearTimeout(timeout);
            reject(err);
          },
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });

  assert(connectionOpened, 'Live WebSocket connection opened callback fired');
  assert(setupReceived, 'Live server setupComplete message received successfully');

  // ------------------------------------------------------------------------
  // TEST 3: Audio PCM Math & Round-trip Conversion
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 3: Audio PCM Math & Round-trip Conversion ---');
  const sampleCount = 480;
  const originalFloat = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    originalFloat[i] = Math.sin((2 * Math.PI * 440 * i) / 16000); // 440Hz sine wave
  }

  const pcm16 = floatTo16BitPCM(originalFloat);
  assert(pcm16.length === sampleCount, `PCM16 length matches float array length (${pcm16.length})`);
  assert(pcm16 instanceof Int16Array, 'Result is an Int16Array');

  const base64Audio = arrayBufferToBase64(pcm16.buffer);
  assert(typeof base64Audio === 'string' && base64Audio.length > 0, 'Base64 audio chunk generated');

  const reconstructedInt16 = base64ToInt16Array(base64Audio);
  assert(reconstructedInt16.length === pcm16.length, 'Base64 roundtrip preserves Int16 length');
  assert(reconstructedInt16[100] === pcm16[100], 'Base64 roundtrip preserves sample values');

  const playbackFloat = pcm16ToFloat32(reconstructedInt16);
  assert(playbackFloat.length === sampleCount, 'Playback float length matches sample count');
  assert(
    Math.abs(playbackFloat[100] - originalFloat[100]) < 0.001,
    'Float32 -> Int16 -> Float32 quantization error is < 0.001'
  );

  // ------------------------------------------------------------------------
  // TEST 4: Audio Downsampling (48kHz -> 16kHz)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 4: Audio Downsampling (48kHz -> 16kHz) ---');
  const input48k = new Float32Array(4800); // 100ms at 48kHz
  for (let i = 0; i < input48k.length; i++) input48k[i] = 0.5;

  const output16k = downsampleBuffer(input48k, 48000, 16000);
  assert(output16k.length === 1600, `Downsampled length from 4800 at 48kHz is 1600 at 16kHz (got ${output16k.length})`);
  assert(Math.abs(output16k[0] - 0.5) < 0.01, 'Downsampled amplitude matches input');

  // ------------------------------------------------------------------------
  // TEST 5: Voice Tool Execution Pipeline (Phase 4 Tools in Voice Session)
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 5: Voice Tool Execution Pipeline ---');
  const convId = `voice-test-conv-${Date.now()}`;

  // 5.1 Check Service Area
  const areaRes = executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: convId });
  assert(areaRes.success, 'check_service_area succeeds for Plano');
  assert((areaRes.output as any)?.supported === true, 'Plano is in primary service area');

  // 5.2 Create Lead
  const leadRes = executeAgentTool(
    'create_lead',
    {
      customerName: 'Alex Mercer',
      phone: '214-555-0199',
      serviceAddress: '456 Oak Street, Plano',
      serviceType: 'AC Repair',
      reportedIssue: 'AC is not cooling',
      urgency: 'normal',
    },
    { conversationId: convId }
  );
  assert(leadRes.success, 'create_lead succeeds for voice intake');
  const leadId = (leadRes.output as any)?.leadId;
  assert(typeof leadId === 'string' && leadId.startsWith('LEAD-'), 'Valid leadId generated');

  // 5.3 Fetch Available Slots
  const slotsRes = executeAgentTool(
    'get_available_slots',
    { serviceType: 'AC Repair', urgency: 'normal', preferredDate: 'tomorrow' },
    { conversationId: convId }
  );
  assert(slotsRes.success, 'get_available_slots succeeds');
  const slots = (slotsRes.output as any)?.slots as string[];
  assert(Array.isArray(slots) && slots.length > 0, 'Available slots returned');
  const chosenSlot = slots[0];

  // 5.4 Request Appointment
  const apptRes = executeAgentTool(
    'request_appointment',
    {
      leadId,
      preferredSlot: chosenSlot,
      customerName: 'Alex Mercer',
      phone: '214-555-0199',
      serviceAddress: '456 Oak Street, Plano',
    },
    { conversationId: convId }
  );
  assert(apptRes.success, 'request_appointment succeeds with valid slot');
  assert((apptRes.output as any)?.status === 'requested', 'Appointment status is strictly "requested"');

  // 5.5 Transfer to Human (Idempotent)
  const transfer1 = executeAgentTool(
    'transfer_to_human',
    { reason: 'Customer requested human dispatcher', urgency: 'normal' },
    { conversationId: convId }
  );
  assert(transfer1.success, 'transfer_to_human succeeds');
  assert((transfer1.output as any)?.status === 'transferred', 'First transfer status is "transferred"');

  const transfer2 = executeAgentTool(
    'transfer_to_human',
    { reason: 'Customer repeated transfer request', urgency: 'normal' },
    { conversationId: convId }
  );
  assert(transfer2.success, 'Second transfer call succeeds gracefully');
  assert((transfer2.output as any)?.isDuplicate === true, 'Second transfer is flagged as duplicate (idempotent)');

  // ------------------------------------------------------------------------
  // TEST 6: Secret Safety Check
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 6: Secret Safety Check ---');
  const tokenPayload = JSON.stringify({ token: token.name, model: liveModel });
  assert(!tokenPayload.includes(apiKey), 'Token response payload does NOT contain GEMINI_API_KEY');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 5 REAL-TIME VOICE TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runPhase5VoiceSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
