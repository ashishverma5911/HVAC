import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import {
  floatTo16BitPCM,
  arrayBufferToBase64,
  downsampleBuffer,
} from '../src/lib/ai/audioUtils';

// Load .env.local
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function traceLiveSession() {
  console.log('--- STEP 1: Creating Ephemeral Token ---');
  const serverAi = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    },
  });

  console.log('Token created:', token.name);

  console.log('--- STEP 2: Connecting client to live session ---');
  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let session: any = null;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('Session timed out after 15s');
      session?.close();
      resolve();
    }, 15000);

    clientAi.live.connect({
      model: liveModel,
      callbacks: {
        onopen: () => {
          console.log('[CLIENT EVENT] onopen fired');
        },
        onmessage: (msg: any) => {
          console.log('[CLIENT EVENT] onmessage received keys:', Object.keys(msg));
          if (msg.setupComplete) {
            console.log('[CLIENT EVENT] setupComplete received');
          }
          if (msg.serverContent) {
            console.log('[CLIENT EVENT] serverContent:', JSON.stringify(msg.serverContent).substring(0, 300));
            if (msg.serverContent.inputTranscription) {
              console.log('[CLIENT EVENT] inputTranscription:', JSON.stringify(msg.serverContent.inputTranscription));
            }
            if (msg.serverContent.outputTranscription) {
              console.log('[CLIENT EVENT] outputTranscription:', JSON.stringify(msg.serverContent.outputTranscription));
            }
            if (msg.serverContent.modelTurn) {
              console.log('[CLIENT EVENT] modelTurn received! Parts:', msg.serverContent.modelTurn.parts?.length);
              for (const p of msg.serverContent.modelTurn.parts || []) {
                if (p.inlineData) {
                  console.log('[CLIENT EVENT] AUDIO CHUNK: mimeType:', p.inlineData.mimeType, 'length:', p.inlineData.data?.length);
                }
              }
            }
            if (msg.serverContent.turnComplete) {
              console.log('[CLIENT EVENT] turnComplete: true!');
              clearTimeout(timeout);
              setTimeout(() => {
                session?.close();
                resolve();
              }, 500);
            }
          }
          if (msg.toolCall) {
            console.log('[CLIENT EVENT] toolCall received:', JSON.stringify(msg.toolCall));
          }
        },
        onerror: (err: any) => {
          console.error('[CLIENT EVENT] onerror:', err);
          clearTimeout(timeout);
          reject(err);
        },
        onclose: (ev: any) => {
          console.log('[CLIENT EVENT] onclose:', ev.code, ev.reason);
          clearTimeout(timeout);
          resolve();
        },
      },
    }).then((s) => {
      session = s;
      console.log('Connected session obtained successfully!');
      testInteraction(s);
    }).catch(reject);

    function testInteraction(activeSession: any) {
      console.log('--- STEP 3: Testing Interaction with Active Session ---');
      console.log('Testing sendClientContent with "Hello, my AC is not cooling in Plano."...');
      try {
        activeSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: "Hello, my AC is not cooling in Plano." }],
            },
          ],
          turnComplete: true,
        });
        console.log('sendClientContent executed successfully!');
      } catch (err: any) {
        console.error('Error in sendClientContent:', err);
      }
    }
  });
}

traceLiveSession().catch(console.error);
