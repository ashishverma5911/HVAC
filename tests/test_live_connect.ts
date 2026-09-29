import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

const serverAi = new GoogleGenAI({
  apiKey,
  httpOptions: { apiVersion: 'v1alpha' }
});

async function main() {
  console.log('1. Creating ephemeral token...');
  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO]
        }
      }
    }
  });

  console.log('Token created:', token.name);

  console.log('2. Connecting to Live API using ephemeral token as apiKey in v1alpha...');
  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' }
  });

  try {
    const session = await clientAi.live.connect({
      model: 'gemini-3.8-live',
      callbacks: {
        onopen: () => {
          console.log('✅ WebSocket onopen called!');
        },
        onmessage: (msg) => {
          console.log('Received message:', Object.keys(msg));
        },
        onerror: (err) => {
          console.error('Socket error:', err);
        },
        onclose: (ev) => {
          console.log('Socket closed:', ev.code, ev.reason);
        }
      }
    });

    console.log('✅ Session connected successfully!');
    // Send a small text turn or wait 2 seconds then close
    setTimeout(() => {
      console.log('Closing session...');
      session.close();
      process.exit(0);
    }, 2000);
  } catch (err: any) {
    console.error('❌ Failed to connect:', err);
    process.exit(1);
  }
}

main();
