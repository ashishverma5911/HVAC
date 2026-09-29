import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { RECEPTIONIST_TOOLS } from '../src/lib/ai/tools';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '../src/lib/ai/receptionistPrompt';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

const serverAi = new GoogleGenAI({
  apiKey,
  httpOptions: { apiVersion: 'v1alpha' }
});

async function main() {
  console.log('1. Creating ephemeral token with tools locked in...');
  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: SUMMIT_HVAC_SYSTEM_INSTRUCTION }]
          },
          tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }]
        }
      }
    }
  });

  console.log('Token created:', token.name);

  console.log('2. Connecting without config in connect...');
  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' }
  });

  const session = await clientAi.live.connect({
    model: 'gemini-3.8-live',
    callbacks: {
      onopen: () => console.log('Socket open'),
      onmessage: (msg: any) => {
        console.log('Message received:', Object.keys(msg));
        if (msg.toolCall) {
          console.log('TOOL CALL RECEIVED!', JSON.stringify(msg.toolCall));
        }
        if (msg.serverContent) {
          console.log('ServerContent keys:', Object.keys(msg.serverContent));
          if (msg.serverContent.modelTurn) {
            console.log('ModelTurn parts count:', msg.serverContent.modelTurn.parts?.length);
          }
          if (msg.serverContent.inputTranscription) {
            console.log('InputTranscription:', msg.serverContent.inputTranscription);
          }
          if (msg.serverContent.outputTranscription) {
            console.log('OutputTranscription:', msg.serverContent.outputTranscription);
          }
        }
      },
      onerror: (err) => console.error('Error:', err),
      onclose: (ev) => console.log('Closed:', ev.code, ev.reason)
    }
  });

  console.log('3. Sending text turn asking to check service area for Plano...');
  session.sendClientContent({
    turns: [
      {
        role: 'user',
        parts: [{ text: "Hi, I live in Plano. Do you service Plano?" }]
      }
    ],
    turnComplete: true
  });

  await new Promise(r => setTimeout(r, 6000));
  session.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
