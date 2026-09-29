import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

// Generate 2 seconds of 16kHz sine wave audio (440Hz beep)
function generateBeepPCM(): string {
  const sampleRate = 16000;
  const duration = 2; // seconds
  const totalSamples = sampleRate * duration;
  const buffer = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return Buffer.from(buffer.buffer).toString('base64');
}

async function testAudioOnModel(modelName: string) {
  console.log(`\n=== Testing PCM Audio on: ${modelName} ===`);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const pcmBase64 = generateBeepPCM();

  return new Promise<void>((resolve) => {
    let closed = false;
    const timer = setTimeout(() => {
      if (!closed) {
        console.log(`[${modelName}] Timed out after 10s`);
        resolve();
      }
    }, 10000);

    ai.live.connect({
      model: modelName,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => console.log(`[${modelName}] onopen`),
        onmessage: (m: any) => {
          console.log(`[${modelName}] onmessage keys:`, Object.keys(m));
          if (m.serverContent) {
            console.log(`[${modelName}] serverContent:`, JSON.stringify(m.serverContent).substring(0, 200));
            if (m.serverContent.modelTurn) {
              console.log(`[${modelName}] SUCCESS: Model turn audio received!`);
              clearTimeout(timer);
              closed = true;
              resolve();
            }
          }
        },
        onerror: (e: any) => console.error(`[${modelName}] onerror:`, e),
        onclose: (c: any) => {
          console.log(`[${modelName}] onclose: code=${c.code} reason="${c.reason}"`);
          clearTimeout(timer);
          closed = true;
          resolve();
        },
      }
    }).then((session) => {
      console.log(`[${modelName}] connected!`);
      setTimeout(() => {
        console.log(`[${modelName}] Sending audio chunk via sendRealtimeInput (media)...`);
        try {
          session.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: pcmBase64,
            },
          });
          console.log(`[${modelName}] Audio chunk sent! Now signaling audioStreamEnd...`);
          setTimeout(() => {
            session.sendRealtimeInput({ audioStreamEnd: true });
          }, 1000);
        } catch (err: any) {
          console.error(`[${modelName}] Error sending audio:`, err);
        }
      }, 1000);
    }).catch((err) => {
      console.error(`[${modelName}] connect error:`, err);
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  await testAudioOnModel('gemini-3.8-live');
  await testAudioOnModel('gemini-2.5-flash-native-audio-latest');
}

main().catch(console.error);
