import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import {
  floatTo16BitPCM,
  arrayBufferToBase64,
} from '../src/lib/ai/audioUtils';
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
  console.log('1. Creating ephemeral token...');
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
          tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      }
    }
  });

  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' }
  });

  console.log('2. Connecting to Live API...');
  let audioEventsCount = 0;
  let inputTranscriptionCount = 0;
  let outputTranscriptionCount = 0;

  const session = await clientAi.live.connect({
    model: 'gemini-3.8-live',
    callbacks: {
      onopen: () => console.log('Socket onopen'),
      onmessage: (msg: any) => {
        if (msg.serverContent) {
          if (msg.serverContent.inputTranscription) {
            inputTranscriptionCount++;
            console.log('INPUT TRANSCRIPTION EVENT:', msg.serverContent.inputTranscription);
          }
          if (msg.serverContent.outputTranscription) {
            outputTranscriptionCount++;
            console.log('OUTPUT TRANSCRIPTION EVENT:', msg.serverContent.outputTranscription);
          }
          if (msg.serverContent.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                audioEventsCount++;
                console.log(`MODEL AUDIO CHUNK #${audioEventsCount} (${part.inlineData.data.length} chars base64)`);
              }
            }
          }
          if (msg.serverContent.turnComplete) {
            console.log('TURN COMPLETE!');
          }
        }
        if (msg.toolCall) {
          console.log('TOOL CALL EVENT:', JSON.stringify(msg.toolCall));
        }
      },
      onerror: (err) => console.error('Socket error:', err),
      onclose: (ev) => console.log('Socket closed:', ev.code, ev.reason)
    }
  });

  // Generate 2 seconds of 16kHz audio: simulated speech / audible noise
  console.log('3. Streaming 2 seconds of 16kHz PCM audio chunks...');
  const sampleRate = 16000;
  const chunkSize = 1600; // 100ms chunks (1600 samples)
  const totalChunks = 20;

  for (let c = 0; c < totalChunks; c++) {
    const float32 = new Float32Array(chunkSize);
    for (let i = 0; i < chunkSize; i++) {
      // Harmonic audio simulating voice frequencies ~200Hz - 800Hz
      const t = (c * chunkSize + i) / sampleRate;
      float32[i] = 0.3 * Math.sin(2 * Math.PI * 250 * t) + 0.2 * Math.sin(2 * Math.PI * 500 * t);
    }
    const pcm16 = floatTo16BitPCM(float32);
    const base64 = arrayBufferToBase64(pcm16.buffer);

    // Test sending both audio and media or audio specifically:
    session.sendRealtimeInput({
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64,
      }
    });

    await new Promise(r => setTimeout(r, 100)); // 100ms delay between chunks
  }

  console.log('Done streaming audio. Waiting 8s for Gemini response...');
  await new Promise(r => setTimeout(r, 8000));
  session.close();
  console.log(`Results: audioChunksReceived=${audioEventsCount}, inputTranscriptions=${inputTranscriptionCount}, outputTranscriptions=${outputTranscriptionCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
