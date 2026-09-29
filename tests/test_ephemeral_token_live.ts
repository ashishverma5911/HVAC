import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function testEphemeral(modelName: string) {
  console.log(`\n========================================`);
  console.log(`Testing Ephemeral Token with: ${modelName}`);
  console.log(`========================================`);

  const serverAi = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: modelName,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    },
  });

  const tokenName = token?.name || '';
  console.log(`Token created for ${modelName}:`, tokenName.substring(0, 30) + '...');

  const clientAi = new GoogleGenAI({ apiKey: tokenName, httpOptions: { apiVersion: 'v1alpha' } });

  return new Promise<void>((resolve) => {
    let closed = false;
    const timer = setTimeout(() => {
      if (!closed) {
        console.log(`[${modelName}] Session timed out after 10s`);
        resolve();
      }
    }, 10000);

    clientAi.live.connect({
      model: modelName,
      callbacks: {
        onopen: () => console.log(`[${modelName}] onopen fired!`),
        onmessage: (m: any) => {
          console.log(`[${modelName}] onmessage keys:`, Object.keys(m));
          if (m.serverContent) {
            console.log(`[${modelName}] serverContent:`, JSON.stringify(m.serverContent).substring(0, 150));
            if (m.serverContent.modelTurn) {
              console.log(`[${modelName}] SUCCESS! Model audio turn received!`);
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
      console.log(`[${modelName}] session connected!`);
      setTimeout(() => {
        console.log(`[${modelName}] Sending test speech via sendRealtimeInput (media)...`);
        // 1 second of 16kHz speech-like modulated noise
        const samples = 16000;
        const buf = new Int16Array(samples);
        for (let i = 0; i < samples; i++) {
          const t = i / 16000;
          // speech formant simulation: 200Hz + 800Hz + 2400Hz modulated
          const s = (Math.sin(2 * Math.PI * 200 * t) * 0.4 +
                     Math.sin(2 * Math.PI * 800 * t) * 0.3 +
                     Math.sin(2 * Math.PI * 2400 * t) * 0.2) *
                    (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t)); // 4Hz syllabic modulation
          buf[i] = s * 16000;
        }
        const b64 = Buffer.from(buf.buffer).toString('base64');
        session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: b64,
          },
        });
        console.log(`[${modelName}] Audio sent. Waiting for response...`);
      }, 500);
    }).catch((err) => {
      console.error(`[${modelName}] connect failed:`, err);
      clearTimeout(timer);
      resolve();
    });
  });
}

async function run() {
  await testEphemeral('gemini-2.5-flash-native-audio-latest');
  await testEphemeral('gemini-3.8-live');
}

run().catch(console.error);
