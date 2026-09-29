import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

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
  console.log('1. Creating token with input/output audio transcription and tools...');
  const token = await serverAi.authTokens.create({
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
          tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      }
    }
  });

  console.log('Token created:', token.name);

  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' }
  });

  let audioChunkCount = 0;
  let audioBytesTotal = 0;
  let inputTranscriptionReceived = false;
  let outputTranscriptionReceived = false;

  console.log('2. Connecting to Live API session...');
  const session = await clientAi.live.connect({
    model: 'gemini-3.8-live',
    callbacks: {
      onopen: () => console.log('✅ Live session connected (onopen)'),
      onmessage: (msg: any) => {
        if (msg.serverContent) {
          if (msg.serverContent.inputTranscription?.text) {
            inputTranscriptionReceived = true;
            console.log('🎤 [InputTranscription]:', msg.serverContent.inputTranscription.text);
          }
          if (msg.serverContent.outputTranscription?.text) {
            outputTranscriptionReceived = true;
            console.log('🔊 [OutputTranscription]:', msg.serverContent.outputTranscription.text);
          }
          if (msg.serverContent.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                audioChunkCount++;
                audioBytesTotal += part.inlineData.data.length;
                console.log(`🎵 [ModelAudio] Chunk #${audioChunkCount} (${part.inlineData.data.length} b64 chars)`);
              }
            }
          }
          if (msg.serverContent.turnComplete) {
            console.log('🏁 [TurnComplete]');
          }
        }
        if (msg.toolCall?.functionCalls) {
          console.log('🔧 [ToolCall]:', msg.toolCall.functionCalls);
          const call = msg.toolCall.functionCalls[0];
          console.log('Replying with toolResponse for', call.name);
          session.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                response: {
                  output: {
                    city: call.args.city || 'Plano',
                    supported: true,
                    message: 'Plano is within Summit HVAC primary service area.'
                  }
                }
              }
            ]
          });
        }
      },
      onerror: (err) => console.error('❌ Error:', err),
      onclose: (ev) => console.log('🔌 Closed:', ev.code, ev.reason)
    }
  });

  console.log('3. Sending customer text turn to trigger voice response & transcript...');
  session.sendClientContent({
    turns: [
      {
        role: 'user',
        parts: [{ text: "Hi, my name is Alex. I'm at 456 Oak Street in Plano and my AC is not cooling." }]
      }
    ],
    turnComplete: true
  });

  await new Promise(r => setTimeout(r, 8000));
  session.close();

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log('Audio chunks received:', audioChunkCount);
  console.log('Audio bytes total:', audioBytesTotal);
  console.log('Output transcription received:', outputTranscriptionReceived);
  console.log('Input transcription received:', inputTranscriptionReceived);

  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
