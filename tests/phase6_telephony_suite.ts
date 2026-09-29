import { validateTwilioWebhookSignature } from '../src/lib/telephony/twilioSecurity';
import {
  MULAW_DECODE_TABLE,
  mulawToPcm16,
  linearSampleToMuLaw,
  pcm16ToMulaw,
  upsample8kTo16k,
  downsample24kTo8k,
  decodeTwilioMediaPayload,
  encodeTwilioOutboundPayload,
} from '../src/lib/telephony/audioCodec';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';
import * as crypto from 'crypto';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('PHASE 6: COMPREHENSIVE TELEPHONY INTEGRATION SUITE');
  console.log('====================================================\n');

  // --- SUITE 1: TWILIO HMAC-SHA1 SIGNATURE VERIFICATION ---
  console.log('--- Test Suite 1: Twilio Security & Signature Verification ---');
  const testAuthToken = '1234567890abcdef1234567890abcdef';
  const testUrl = 'https://summit-hvac.example.com/api/telephony/twilio/voice';
  const testParams = {
    CallSid: 'CA123456789',
    From: '+15551234567',
    To: '+15557654321',
  };

  // Generate valid signature matching Twilio's specification
  const sortedKeys = Object.keys(testParams).sort();
  let dataToSign = testUrl;
  for (const k of sortedKeys) {
    dataToSign += `${k}${(testParams as any)[k]}`;
  }
  const validSignature = crypto.createHmac('sha1', testAuthToken).update(dataToSign, 'utf8').digest('base64');

  // 1. Valid signature passes
  assert(
    validateTwilioWebhookSignature(testAuthToken, validSignature, testUrl, testParams) === true,
    'Valid Twilio signature is successfully validated'
  );

  // 2. Tampered signature fails
  const invalidSignature = 'invalid+signature+base64=';
  assert(
    validateTwilioWebhookSignature(testAuthToken, invalidSignature, testUrl, testParams) === false,
    'Tampered signature is rejected'
  );

  // 3. Tampered params fail
  const tamperedParams = { ...testParams, From: '+15550000000' };
  assert(
    validateTwilioWebhookSignature(testAuthToken, validSignature, testUrl, tamperedParams) === false,
    'Altered webhook payload params are rejected'
  );

  // 4. Missing signature fails
  assert(
    validateTwilioWebhookSignature(testAuthToken, null, testUrl, testParams) === false,
    'Missing signature is rejected'
  );

  // 5. Unset auth token (dev mode fallback)
  assert(
    validateTwilioWebhookSignature('', null, testUrl, testParams) === true,
    'Unset auth token logs warning and safely allows dev inspection'
  );

  // --- SUITE 2: AUDIO CODEC & TRANSCODING ACCURACY ---
  console.log('\n--- Test Suite 2: Audio Codec & Transcoding Accuracy ---');
  // 1. Digital silence (0x00) in linear PCM maps to 0xFF in μ-law
  const silenceMuLaw = linearSampleToMuLaw(0);
  assert(silenceMuLaw === 0xff, 'Linear PCM silence (0) correctly encodes to μ-law 0xFF');

  // 2. μ-law 0xFF decodes back to near-zero PCM
  const silenceDecoded = MULAW_DECODE_TABLE[0xff];
  assert(Math.abs(silenceDecoded) <= 4, `μ-law 0xFF decodes to silence (got ${silenceDecoded})`);

  // 3. 8kHz to 16kHz linear interpolation preserved
  const original8k = new Int16Array([100, 200, 300, 400]);
  const upsampled16k = upsample8kTo16k(original8k);
  assert(upsampled16k.length === 8, '8kHz -> 16kHz doubles sample length');
  assert(upsampled16k[0] === 100 && upsampled16k[2] === 200, 'Original sample values anchored');
  assert(upsampled16k[1] === 150, 'Linear midpoint interpolated correctly (100 -> 150 -> 200)');

  // 4. 24kHz to 8kHz downsampling
  const gemini24k = new Int16Array([300, 300, 300, 600, 600, 600]);
  const twilio8k = downsample24kTo8k(gemini24k);
  assert(twilio8k.length === 2, '24kHz -> 8kHz reduces length by exactly 3x');
  assert(twilio8k[0] === 300 && twilio8k[1] === 600, 'Averaged downsampled frames accurately match');

  // --- SUITE 3: MULTI-CALL CONCURRENCY & ISOLATION ---
  console.log('\n--- Test Suite 3: Multi-Call Concurrency & State Isolation ---');
  const sessionManager = CallSessionManager.getInstance();

  const callA = sessionManager.createSession({
    callSid: 'CA_CONCURRENT_A',
    streamSid: 'MZ_STREAM_A',
    callerPhone: '+15551111111',
  });

  const callB = sessionManager.createSession({
    callSid: 'CA_CONCURRENT_B',
    streamSid: 'MZ_STREAM_B',
    callerPhone: '+15552222222',
  });

  assert(callA.sessionId !== callB.sessionId, 'Concurrent calls have unique session IDs');
  assert(callA.callerPhone === '+15551111111', 'Call A caller phone preserved');
  assert(callB.callerPhone === '+15552222222', 'Call B caller phone preserved');

  // Customer utterance isolation
  sessionManager.recordCustomerUtterance('MZ_STREAM_A', 'My name is Sarah Connor and my furnace stopped working');
  sessionManager.recordCustomerUtterance('MZ_STREAM_B', 'This is Bob Vance, I want to check business hours');

  assert(callA.customerInfo.name.includes('Sarah Connor'), 'Call A extracted Sarah Connor');
  assert(callB.customerInfo.name.includes('Bob Vance'), 'Call B extracted Bob Vance');
  assert(!callA.customerInfo.name.includes('Bob Vance'), 'Call A is not polluted by Call B');
  assert(!callB.customerInfo.name.includes('Sarah Connor'), 'Call B is not polluted by Call A');

  // Tool execution isolation
  const toolResultA = executeAgentTool('check_service_area', { zipCode: '80202' }, { conversationId: callA.callSid });
  sessionManager.recordToolAction('MZ_STREAM_A', toolResultA.action);

  assert(callA.metrics.toolCalls === 1, 'Call A recorded 1 tool call');
  assert(callB.metrics.toolCalls === 0, 'Call B recorded 0 tool calls');

  // Clean termination of concurrent calls
  sessionManager.terminateSession('MZ_STREAM_A', 'Completed A');
  sessionManager.terminateSession('MZ_STREAM_B', 'Completed B');

  assert(callA.ended === true, 'Call A ended');
  assert(callB.ended === true, 'Call B ended');

  // --- SUITE 4: WATCHDOG DURATION LIMIT (COST PROTECTION) ---
  console.log('\n--- Test Suite 4: Cost Protection Watchdog Timer ---');
  let watchdogTriggered = false;
  const shortWatchdogSession = sessionManager.createSession({
    callSid: 'CA_WATCHDOG_TEST',
    streamSid: 'MZ_WATCHDOG_STREAM',
    callerPhone: '+15559990000',
    onDurationLimitReached: () => {
      watchdogTriggered = true;
    },
  });

  assert(shortWatchdogSession.durationTimer !== undefined, 'Watchdog duration timer was scheduled');
  sessionManager.terminateSession('MZ_WATCHDOG_STREAM', 'Manual early termination');
  assert(shortWatchdogSession.ended === true, 'Session successfully terminated before watchdog');
  assert(shortWatchdogSession.durationTimer === undefined, 'Watchdog timer cleanly cleared on termination');

  // --- SUITE 5: CALL METRICS AND PRIVACY MASKING ---
  console.log('\n--- Test Suite 5: Telemetry Summary & Phone Number Masking ---');
  const summary = sessionManager.getRecentSessionsSummary();
  assert(summary.length >= 2, 'Recent sessions summary contains calls');
  
  const callerAInSummary = summary.find((s) => s.callSid.startsWith('CA_CONCURRENT_A'.substring(0, 8)));
  assert(callerAInSummary !== undefined, 'Call A found in recent sessions');
  assert(callerAInSummary?.callerPhone === '+1***1111', 'Caller phone number is properly masked (+1***1111)');

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 6 TELEPHONY TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runTestSuite().catch((err) => {
  console.error('❌ Phase 6 Telephony Suite Failed:', err);
  process.exit(1);
});
