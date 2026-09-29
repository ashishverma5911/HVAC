const BIAS = 0x84;
const CLIP = 8159;

const seg_uend = [0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF];

function searchSeg(val: number): number {
  for (let i = 0; i < 8; i++) {
    if (val <= seg_uend[i]) return i;
  }
  return 8;
}

export function linear2ulaw(pcm_val: number): number {
  let mask: number;
  pcm_val = pcm_val >> 2;
  if (pcm_val < 0) {
    pcm_val = -pcm_val;
    mask = 0x7F;
  } else {
    mask = 0xFF;
  }
  if (pcm_val > CLIP) pcm_val = CLIP;
  pcm_val += (BIAS >> 2);

  const seg = searchSeg(pcm_val);
  if (seg >= 8) {
    return (0x7F ^ mask) & 0xFF;
  } else {
    const uval = (seg << 4) | ((pcm_val >> (seg + 1)) & 0x0F);
    return (uval ^ mask) & 0xFF;
  }
}

export function ulaw2linear(u_val: number): number {
  u_val = ~u_val & 0xFF;
  let t = ((u_val & 0x0F) << 3) + BIAS;
  t <<= (u_val & 0x70) >> 4;
  return (u_val & 0x80) ? (BIAS - t) : (t - BIAS);
}

const testSamples = [0, 100, 1000, 5000, 16000, -100, -1000, -16000];
for (const s of testSamples) {
  const u = linear2ulaw(s);
  const p = ulaw2linear(u);
  console.log(`Sample: ${s} -> uLaw: 0x${u.toString(16).padStart(2, '0')} -> PCM: ${p} (diff: ${Math.abs(s - p)})`);
}
