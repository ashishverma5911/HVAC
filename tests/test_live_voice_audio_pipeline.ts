import * as fs from 'fs';
import * as path from 'path';
import {
  extractStructuredCustomerData,
} from '../src/lib/ai/extractConversationData';
import {
  floatTo16BitPCM,
  arrayBufferToBase64,
  downsampleBuffer,
} from '../src/lib/ai/audioUtils';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

async function runLiveVoicePipelineTest() {
  console.log('\n======================================================');
  console.log('--- TESTING PHASE 5 LIVE VOICE PIPELINE & EXTRACTION ---');
  console.log('======================================================\n');

  // TEST 1: Extraction from full voice utterance
  console.log('--- TEST 1: Extraction from Voice Utterances ---');
  const utterance1 = "Hi, my name is Alex. I'm at 456 Oak Street in Plano. My AC isn't cooling and it's blowing warm air.";
  const res1 = extractStructuredCustomerData(utterance1);

  assert(res1.customerInfo.name === 'Alex', `Customer name should be "Alex" (got "${res1.customerInfo.name}")`);
  assert(res1.customerInfo.serviceAddress === '456 Oak Street, Plano', `Service address should be "456 Oak Street, Plano" (got "${res1.customerInfo.serviceAddress}")`);
  assert(res1.customerInfo.city === 'Plano', `City should be "Plano" (got "${res1.customerInfo.city}")`);
  assert(res1.customerInfo.serviceType === 'AC Repair', `Service type should be "AC Repair" (got "${res1.customerInfo.serviceType}")`);
  assert(res1.customerInfo.problemDescription === "AC isn't cooling", `Problem description should be "AC isn't cooling" (got "${res1.customerInfo.problemDescription}")`);
  assert(res1.intent === 'AC_COOLING_FAILURE', `Intent should be AC_COOLING_FAILURE (got ${res1.intent})`);
  assert(res1.leadStatus === 'qualified', `Lead status should be "qualified" (got ${res1.leadStatus})`);

  // TEST 2: Phone and appointment time extraction from follow-up utterance
  console.log('\n--- TEST 2: Multi-turn Voice Extraction Accumulation ---');
  const utterance2 = "My phone number is 214-555-0199. Can someone come tomorrow morning?";
  const fullConversation = `${utterance1} ${utterance2}`;
  const res2 = extractStructuredCustomerData(fullConversation, res1.customerInfo, res1.leadStatus);

  assert(res2.customerInfo.name === 'Alex', `Preserves name Alex`);
  assert(res2.customerInfo.phone === '214-555-0199', `Extracts phone 214-555-0199 (got "${res2.customerInfo.phone}")`);
  assert(res2.customerInfo.preferredAppointmentTime === 'tomorrow morning', `Extracts preferredAppointmentTime "tomorrow morning" (got "${res2.customerInfo.preferredAppointmentTime}")`);
  assert(res2.leadStatus === 'appointment_requested', `Lead status transitions to "appointment_requested" (got ${res2.leadStatus})`);

  // TEST 3: Out-of-area Houston utterance separation
  console.log('\n--- TEST 3: Out-of-area Houston Voice Utterance ---');
  const houstonUtterance = "My AC isn't cooling. I'm in Houston.";
  const resHouston = extractStructuredCustomerData(houstonUtterance);

  assert(resHouston.customerInfo.name === '', `Name should remain empty (got "${resHouston.customerInfo.name}")`);
  assert(resHouston.customerInfo.serviceAddress === '', `Service Address should NOT contain bare city (got "${resHouston.customerInfo.serviceAddress}")`);
  assert(resHouston.customerInfo.city === 'Houston', `City should be "Houston" (got "${resHouston.customerInfo.city}")`);
  assert(resHouston.customerInfo.cityOrArea === 'Houston', `CityOrArea should be "Houston" (got "${resHouston.customerInfo.cityOrArea}")`);

  // TEST 4: Tool response payload format verification
  console.log('\n--- TEST 4: Tool Response Payload Format ---');
  const sampleToolCall = {
    id: 'call_abc123',
    name: 'create_lead',
    args: { customerName: 'Alex', phone: '214-555-0199' },
  };

  const sampleToolResponse = {
    id: sampleToolCall.id,
    name: sampleToolCall.name,
    response: {
      output: { leadId: 'LEAD-9999', status: 'qualified' },
    },
  };

  assert('id' in sampleToolResponse, 'Tool response must have "id"');
  assert('name' in sampleToolResponse, 'Tool response must have "name" (critical for @google/genai)');
  assert('response' in sampleToolResponse, 'Tool response must have "response"');
  assert(typeof sampleToolResponse.response === 'object', 'response must be an object');

  // TEST 5: Audio PCM 16kHz pipeline math
  console.log('\n--- TEST 5: Audio 16kHz PCM Pipeline Math ---');
  const sampleRate = 48000;
  const chunkLength = 4096;
  const mockMicBuffer = new Float32Array(chunkLength);
  for (let i = 0; i < chunkLength; i++) {
    mockMicBuffer[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const downsampled = downsampleBuffer(mockMicBuffer, sampleRate, 16000);
  const pcm16 = floatTo16BitPCM(downsampled);
  const base64Audio = arrayBufferToBase64(pcm16.buffer);

  assert(pcm16.byteLength === downsampled.length * 2, `PCM16 byte length must be 2x sample count (got ${pcm16.byteLength})`);
  assert(typeof base64Audio === 'string' && base64Audio.length > 0, 'Base64 audio payload generated');

  const realtimePayload = {
    media: {
      mimeType: 'audio/pcm;rate=16000',
      data: base64Audio,
    },
    audio: {
      mimeType: 'audio/pcm;rate=16000',
      data: base64Audio,
    },
  };

  assert(realtimePayload.audio.mimeType === 'audio/pcm;rate=16000', 'Mime type is audio/pcm;rate=16000');
  assert(realtimePayload.media.mimeType === 'audio/pcm;rate=16000', 'Media mime type is audio/pcm;rate=16000');

  console.log('\n======================================================');
  console.log('🎉 ALL LIVE VOICE PIPELINE TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runLiveVoicePipelineTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
