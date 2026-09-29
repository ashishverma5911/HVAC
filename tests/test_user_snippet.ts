import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function testUserSnippet() {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  console.log('Checking ai.models.connect:', (ai as any).models?.connect ? 'Exists' : 'Undefined');
  console.log('Checking ai.live.connect:', (ai as any).live?.connect ? 'Exists' : 'Undefined');

  if ((ai as any).models?.connect) {
    console.log('Attempting ai.models.connect...');
    try {
      const session = await (ai as any).models.connect({
        model: 'gemini-3.8',
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck',
              },
            },
          },
        },
      });
      console.log('ai.models.connect returned session:', typeof session);
    } catch (err: any) {
      console.log('ai.models.connect error:', err.message);
    }
  }

  console.log('\nTesting equivalent ai.live.connect with voiceName: Puck...');
  try {
    const session = await ai.live.connect({
      model: 'gemini-3.8-live',
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
        onopen: () => console.log('Live session onopen: Session opened successfully'),
        onmessage: (msg: any) => console.log('Live session message keys:', Object.keys(msg)),
        onerror: (err: any) => console.error('Live session onerror:', err),
        onclose: (c: any) => console.log(`Live session onclose. Code: ${c.code}, Reason: "${c.reason}"`),
      },
    });
    console.log('Session connected successfully! Closing after 1s...');
    setTimeout(() => {
      session.close();
      console.log('Session closed cleanly.');
    }, 1000);
  } catch (err: any) {
    console.error('ai.live.connect error:', err);
  }
}

testUserSnippet().catch(console.error);
