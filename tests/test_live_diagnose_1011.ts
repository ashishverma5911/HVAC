import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function runDirectTest() {
  console.log('Testing direct apiKey connect to gemini-3.8-live...');
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  await new Promise<void>((resolve, reject) => {
    ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
      },
      callbacks: {
        onopen: () => console.log('Direct onopen'),
        onmessage: (m: any) => {
          console.log('Direct onmessage keys:', Object.keys(m));
          if (m.serverContent) {
            console.log('Direct serverContent:', JSON.stringify(m.serverContent).substring(0, 200));
            if (m.serverContent.turnComplete) {
              console.log('Direct turnComplete received successfully!');
              resolve();
            }
          }
        },
        onerror: (e: any) => {
          console.error('Direct onerror:', e);
          reject(e);
        },
        onclose: (c: any) => {
          console.log('Direct onclose:', c.code, c.reason);
          resolve();
        },
      }
    }).then((session) => {
      console.log('Direct session connected!');
      setTimeout(() => {
        console.log('Sending text message...');
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: 'Hello! Can you hear me?' }] }],
          turnComplete: true,
        });
      }, 500);
    }).catch(reject);
  });
}

runDirectTest().catch(console.error);
