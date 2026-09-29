import {
  mulawToPcm16,
  pcm16ToMulaw,
  upsample8kTo16k,
  downsample24kTo8k,
  downsample16kTo8k,
  decodeTwilioMediaPayload,
  encodeTwilioOutboundPayload,
  linearSampleToMuLaw,
} from '../src/lib/telephony/audioCodec';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ Passed: ${msg}`);
}

async function runAudioCodecTests() {
  console.log('--------------------------------------------------');
  console.log('Testing Telephony Audio Codec & Resampling Engine');
  console.log('--------------------------------------------------\n');

  // TEST 1: G.711 μ-law decode and encode roundtrip fidelity
  console.log('--- TEST 1: μ-law Codec Roundtrip ---');
  // Generate 8000Hz sine wave (440Hz tone, 160 samples = 20ms frame)
  const samples8k = 160;
  const originalPcm = new Int16Array(samples8k);
  for (let i = 0; i < samples8k; i++) {
    const t = i / 8000;
    originalPcm[i] = Math.round(Math.sin(2 * Math.PI * 440 * t) * 16000);
  }

  const encodedMulaw = pcm16ToMulaw(originalPcm);
  assert(encodedMulaw.length === samples8k, `Encoded μ-law length should be 160 bytes (got ${encodedMulaw.length})`);

  const decodedPcm = mulawToPcm16(encodedMulaw);
  assert(decodedPcm.length === samples8k, `Decoded PCM length should be 160 samples (got ${decodedPcm.length})`);

  // Calculate Mean Absolute Error (quantization noise for 8-bit μ-law should be minimal)
  let totalError = 0;
  for (let i = 0; i < samples8k; i++) {
    totalError += Math.abs(originalPcm[i] - decodedPcm[i]);
  }
  const avgError = totalError / samples8k;
  console.log(`μ-law Quantization Average Error: ${avgError.toFixed(2)} on ±16000 scale`);
  assert(avgError < 150, `Quantization error must be small (< 150), got ${avgError}`);

  // TEST 2: Resampling 8kHz to 16kHz
  console.log('\n--- TEST 2: 8kHz -> 16kHz Upsampling ---');
  const upsampled16k = upsample8kTo16k(decodedPcm);
  assert(upsampled16k.length === samples8k * 2, `Upsampled length must be exactly 2x (got ${upsampled16k.length})`);
  assert(upsampled16k[0] === decodedPcm[0], 'First sample is preserved');
  assert(upsampled16k[2] === decodedPcm[1], 'Second sample is preserved at index 2');

  // TEST 3: Resampling 24kHz to 8kHz
  console.log('\n--- TEST 3: 24kHz -> 8kHz Downsampling ---');
  const samples24k = 480; // 20ms at 24kHz
  const original24k = new Int16Array(samples24k);
  for (let i = 0; i < samples24k; i++) {
    original24k[i] = 1000;
  }
  const downsampled8k = downsample24kTo8k(original24k);
  assert(downsampled8k.length === 160, `24k -> 8k downsample length must be exactly 1/3 (got ${downsampled8k.length})`);
  assert(downsampled8k[0] === 1000, `Average value should remain 1000 (got ${downsampled8k[0]})`);

  // TEST 4: Twilio Media Payload Inbound Decode
  console.log('\n--- TEST 4: Twilio Base64 Inbound Decoding ---');
  // Simulated Twilio payload: 160 bytes of silence / silence-byte in μ-law is 0xFF
  const silenceMulaw = Buffer.alloc(160, 0xff);
  const base64Payload = silenceMulaw.toString('base64');
  const pcmFromTwilio = decodeTwilioMediaPayload(base64Payload);
  assert(pcmFromTwilio.length === 320, `160 μ-law samples decoded to 320 16kHz PCM samples (got ${pcmFromTwilio.length})`);

  // TEST 5: Twilio Outbound Payload Encoding
  console.log('\n--- TEST 5: Twilio Base64 Outbound Encoding ---');
  const outPayload = encodeTwilioOutboundPayload(original24k, 24000);
  assert(typeof outPayload === 'string' && outPayload.length > 0, 'Outbound payload generated');
  const decodedBack = Buffer.from(outPayload, 'base64');
  assert(decodedBack.length === 160, `Outbound μ-law buffer length is 160 bytes (got ${decodedBack.length})`);

  console.log('\n🎉 ALL AUDIO CODEC TESTS PASSED! 🎉\n');
}

runAudioCodecTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
