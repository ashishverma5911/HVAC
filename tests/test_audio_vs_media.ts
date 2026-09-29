import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

// 0.5s of 16kHz silence/tone
function generateChunk(): string {
  const buf = new Int16Array(1600); // 100ms
  return Buffer.from(buf.buffer).toString('base64');
}

async function testParam(name: 'audio' | 'media') {
  console.log(`\nTesting sendRealtimeInput with param: "${name}"...`);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  return new Promise<void>((resolve) => {
    let session: any;
    const timeout = setTimeout(() => {
      console.log(`Param "${name}" stayed open for 3s successfully!`);
      session?.close();
      resolve();
    }, 3000);

    ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
      },
      callbacks: {
        onopen: () => console.log(`[${name}] onopen`),
        onmessage: (m: any) => console.log(`[${name}] onmessage:`, Object.keys(m)),
        onerror: (e: any) => console.error(`[${name}] onerror:`, e),
        onclose: (c: any) => {
          console.log(`[${name}] onclose: code=${c.code} reason="${c.reason}"`);
          clearTimeout(timeout);
          resolve();
        },
      }
    }).then((s) => {
      session = s;
      setTimeout(() => {
        const data = generateChunk();
        console.log(`[${name}] Sending chunk...`);
        try {
          if (name === 'audio') {
            session.sendRealtimeInput({
              audio: { mimeType: 'audio/pcm;rate=16000', data },
            });
          } else {
            session.sendRealtimeInput({
              media: { mimeType: 'audio/pcm;rate=16000', data },
            });
          }
          console.log(`[${name}] Chunk sent without error!`);
        } catch (err: any) {
          console.error(`[${name}] Error sending chunk:`, err);
        }
      }, 500);
    }).catch((err) => {
      console.error(`[${name}] connect error:`, err);
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  await testParam('media');
  await testParam('audio');
}

main().catch(console.error);
