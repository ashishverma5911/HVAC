import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

const modelsToTest = [
  'gemini-2.5-flash-native-audio-latest',
  'gemini-3.1-flash-live-preview',
  'gemini-3.8-live',
];

async function testModel(modelName: string) {
  console.log(`\n=== Testing model: ${modelName} ===`);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
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
      },
      callbacks: {
        onopen: () => console.log(`[${modelName}] onopen`),
        onmessage: (m: any) => {
          console.log(`[${modelName}] onmessage keys:`, Object.keys(m));
          if (m.serverContent) {
            console.log(`[${modelName}] serverContent received!`);
            if (m.serverContent.modelTurn) {
              console.log(`[${modelName}] modelTurn received! Audio received successfully!`);
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
      // Wait for setupComplete, then send test input
      setTimeout(() => {
        console.log(`[${modelName}] Sending sendClientContent text...`);
        try {
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: 'Hello, this is a test. Please say hello back.' }] }],
            turnComplete: true,
          });
        } catch (err: any) {
          console.error(`[${modelName}] Error sending:`, err);
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
  for (const m of modelsToTest) {
    await testModel(m);
  }
}

main().catch(console.error);
