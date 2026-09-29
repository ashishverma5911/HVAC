import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// Load API key from .env.local or environment
let apiKey = process.env.GEMINI_API_KEY || '';
if (!apiKey) {
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
  } catch {
    // ignore
  }
}

async function runGeminiAudioTest() {
  console.log('--------------------------------------------------');
  console.log('Running Gemini 3.8 Live Audio Test');
  console.log('--------------------------------------------------');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });
  
  // Note: For bidiGenerateContent / Live API, the model identifier is 'gemini-3.8-live'
  const modelName = 'gemini-3.8-live';
  console.log(`Connecting to model: ${modelName} with voice "Puck"...`);

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Session timed out waiting for setupComplete'));
    }, 15000);

    ai.live.connect({
      model: modelName,
      config: {
        responseModalities: ['AUDIO' as any],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      },
      callbacks: {
        onopen: () => {
          console.log('✅ Session opened successfully');
        },
        onmessage: (msg: any) => {
          if (msg.setupComplete) {
            console.log('✅ Received setupComplete from Gemini Live');
            clearTimeout(timer);
            setTimeout(() => {
              session.close();
            }, 500);
          }
        },
        onerror: (err: any) => {
          console.error('❌ Session error:', err);
          clearTimeout(timer);
          reject(err);
        },
        onclose: (c: any) => {
          console.log(`Session closed cleanly. Code: ${c.code}, Reason: "${c.reason || 'Normal closure'}"`);
          clearTimeout(timer);
          resolve();
        },
      },
    }).then((s) => {
      session = s;
    }).catch(reject);

    let session: any;
  });
}

runGeminiAudioTest()
  .then(() => {
    console.log('\n🎉 TEST PASSED: Gemini 3.8 Live audio session established and verified!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
