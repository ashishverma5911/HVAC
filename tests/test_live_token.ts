import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

console.log('Testing with API key present:', !!apiKey);

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: { apiVersion: 'v1alpha' }
});

console.log('Keys on ai instance:', Object.keys(ai));
console.log('Prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(ai)));

async function main() {
  const modelsToTry = [
    'gemini-3.8-live',
    'gemini-2.5-flash-live',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-realtime-exp'
  ];

    const { RECEPTIONIST_TOOLS } = await import('../src/lib/ai/tools');
    const { SUMMIT_HVAC_SYSTEM_INSTRUCTION } = await import('../src/lib/ai/receptionistPrompt');

    console.log(`\n--- Attempting ai.authTokens.create with tools and systemInstruction ---`);
    const res = await ai.authTokens.create({
      config: {
        uses: 1,
        liveConnectConstraints: {
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede',
                }
              }
            },
            systemInstruction: {
              parts: [{ text: SUMMIT_HVAC_SYSTEM_INSTRUCTION }]
            },
            tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }]
          }
        }
      }
    });
    console.log(`✅ Success with tools and systemInstruction:`, JSON.stringify(res));

  // Also test listing models or plain token creation
  try {
    console.log('\n--- Attempting token creation without liveConnectConstraints ---');
    const res = await ai.authTokens.create({
      config: {
        uses: 1
      }
    });
    console.log('✅ Success with plain token:', JSON.stringify(res));
  } catch (err: any) {
    console.error('❌ Failed with plain token:', err.status, err.message);
  }
}

main();
