/**
 * High-performance audio transcoding utilities for Twilio Media Streams <-> Gemini Live API.
 * Conforms strictly to ITU-T G.711 μ-law standard.
 * 
 * Inbound:
 * - Twilio: 8kHz G.711 μ-law (audio/x-mulaw), base64 encoded.
 * - Gemini Live: 16kHz 16-bit Linear PCM (audio/pcm;rate=16000), base64 encoded.
 * 
 * Outbound:
 * - Gemini Live: 24kHz (or 16kHz) 16-bit Linear PCM, base64 encoded.
 * - Twilio: 8kHz G.711 μ-law (audio/x-mulaw), base64 encoded.
 */

const BIAS = 0x84; // 132
const CLIP = 8159;
const SEG_UEND = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];

// Precomputed 256-element ITU-T G.711 μ-law decode lookup table (8-bit μ-law to 16-bit signed PCM)
export const MULAW_DECODE_TABLE = new Int16Array(256);

function searchSegment(val: number): number {
  for (let i = 0; i < 8; i++) {
    if (val <= SEG_UEND[i]) return i;
  }
  return 8;
}

(function initMuLawDecodeTable() {
  for (let i = 0; i < 256; i++) {
    const u_val = ~i & 0xff;
    let t = ((u_val & 0x0f) << 3) + BIAS;
    t <<= (u_val & 0x70) >> 4;
    MULAW_DECODE_TABLE[i] = (u_val & 0x80) ? (BIAS - t) : (t - BIAS);
  }
})();

/**
 * Decodes an 8-bit G.711 μ-law buffer into 16-bit signed Linear PCM (Int16Array).
 * O(1) per-sample execution via precomputed decode table.
 */
export function mulawToPcm16(mulawBuffer: Uint8Array | Buffer): Int16Array {
  const len = mulawBuffer.length;
  const pcm16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    pcm16[i] = MULAW_DECODE_TABLE[mulawBuffer[i]];
  }
  return pcm16;
}

/**
 * Encodes a single 16-bit linear PCM sample into an 8-bit G.711 μ-law byte.
 */
export function linearSampleToMuLaw(pcm_val: number): number {
  let mask: number;
  pcm_val = pcm_val >> 2;
  if (pcm_val < 0) {
    pcm_val = -pcm_val;
    mask = 0x7f;
  } else {
    mask = 0xff;
  }
  if (pcm_val > CLIP) pcm_val = CLIP;
  pcm_val += (BIAS >> 2);

  const seg = searchSegment(pcm_val);
  if (seg >= 8) {
    return (0x7f ^ mask) & 0xff;
  } else {
    const uval = (seg << 4) | ((pcm_val >> (seg + 1)) & 0x0f);
    return (uval ^ mask) & 0xff;
  }
}

/**
 * Encodes an Int16Array (Linear PCM) into a Uint8Array (G.711 μ-law).
 */
export function pcm16ToMulaw(pcm16: Int16Array): Uint8Array {
  const len = pcm16.length;
  const mulaw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    mulaw[i] = linearSampleToMuLaw(pcm16[i]);
  }
  return mulaw;
}

/**
 * Resamples 8000 Hz Linear PCM to 16000 Hz using linear interpolation (exact 2x upsampling).
 */
export function upsample8kTo16k(input: Int16Array): Int16Array {
  const inLen = input.length;
  if (inLen === 0) return new Int16Array(0);

  const outLen = inLen * 2;
  const output = new Int16Array(outLen);

  for (let i = 0; i < inLen; i++) {
    const current = input[i];
    const next = i + 1 < inLen ? input[i + 1] : current;

    output[i * 2] = current;
    output[i * 2 + 1] = Math.round((current + next) / 2);
  }

  return output;
}

/**
 * Resamples 24000 Hz Linear PCM to 8000 Hz using 3x box filtering (exact 3x downsampling).
 */
export function downsample24kTo8k(input: Int16Array): Int16Array {
  const outLen = Math.floor(input.length / 3);
  const output = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const idx = i * 3;
    const avg = Math.round((input[idx] + input[idx + 1] + input[idx + 2]) / 3);
    output[i] = Math.max(-32768, Math.min(32767, avg));
  }

  return output;
}

/**
 * Resamples 16000 Hz Linear PCM to 8000 Hz using 2x averaging (exact 2x downsampling).
 */
export function downsample16kTo8k(input: Int16Array): Int16Array {
  const outLen = Math.floor(input.length / 2);
  const output = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const idx = i * 2;
    const avg = Math.round((input[idx] + input[idx + 1]) / 2);
    output[i] = Math.max(-32768, Math.min(32767, avg));
  }

  return output;
}

/**
 * Decodes an inbound Twilio Media Streams payload (base64 μ-law 8kHz)
 * directly into 16kHz 16-bit linear PCM (Int16Array).
 */
export function decodeTwilioMediaPayload(base64Payload: string): Int16Array {
  const buffer = Buffer.from(base64Payload, 'base64');
  const pcm8k = mulawToPcm16(buffer);
  return upsample8kTo16k(pcm8k);
}

/**
 * Converts an Int16Array (16kHz PCM) into a base64 string suitable for Gemini Live real-time input.
 */
export function pcm16ToBase64(pcm16: Int16Array): string {
  const buffer = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  return buffer.toString('base64');
}

/**
 * Converts a base64-encoded PCM string (from Gemini Live output) into an Int16Array.
 */
export function base64ToPcm16(base64Pcm: string): Int16Array {
  const buffer = Buffer.from(base64Pcm, 'base64');
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
}

/**
 * Encodes Gemini Live output PCM audio into a base64-encoded 8kHz G.711 μ-law payload
 * ready for Twilio Media Streams outbound transmission.
 * 
 * Supports both 24000Hz (standard Gemini Live output) and 16000Hz source rates.
 */
export function encodeTwilioOutboundPayload(pcmData: Int16Array, sourceSampleRate: number = 24000): string {
  let pcm8k: Int16Array;
  if (sourceSampleRate === 24000) {
    pcm8k = downsample24kTo8k(pcmData);
  } else if (sourceSampleRate === 16000) {
    pcm8k = downsample16kTo8k(pcmData);
  } else if (sourceSampleRate === 8000) {
    pcm8k = pcmData;
  } else {
    // Dynamic ratio fallback
    const ratio = sourceSampleRate / 8000;
    const outLen = Math.floor(pcmData.length / ratio);
    pcm8k = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = Math.round(i * ratio);
      pcm8k[i] = pcmData[srcIdx] || 0;
    }
  }

  const mulaw = pcm16ToMulaw(pcm8k);
  return Buffer.from(mulaw.buffer, mulaw.byteOffset, mulaw.byteLength).toString('base64');
}
