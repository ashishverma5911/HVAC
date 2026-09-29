import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function testModelName() {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  console.log('Testing with model: "gemini-3.8"...');
  try {
    const session = await ai.live.connect({
      model: 'gemini-3.8',
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
        onopen: () => console.log('Session opened successfully for "gemini-3.8"'),
        onmessage: (m: any) => console.log('Message:', Object.keys(m)),
        onerror: (e: any) => console.error('Error for "gemini-3.8":', e),
        onclose: (c: any) => console.log('Close for "gemini-3.8":', c.code, c.reason),
      }
    });
    console.log('Session connected! Closing after 1s...');
    setTimeout(() => {
      session.close();
    }, 1000);
  } catch (err: any) {
    console.error('Failed to connect "gemini-3.8":', err.message);
  }
}

testModelName().catch(console.error);
