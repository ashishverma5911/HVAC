import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { RECEPTIONIST_TOOLS } from '../src/lib/ai/tools';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '../src/lib/ai/receptionistPrompt';
import {
  floatTo16BitPCM,
  arrayBufferToBase64,
} from '../src/lib/ai/audioUtils';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function testAudioStream() {
  console.log('=== TEST 1: Ephemeral Token with Full Receptionist Config ===');
  const serverAi = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const liveModel = 'gemini-3.8-live';

  const token = await serverAi.authTokens.create({
    config: {
      uses: 1,
      liveConnectConstraints: {
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede',
              },
            },
          },
          systemInstruction: {
            parts: [{ text: SUMMIT_HVAC_SYSTEM_INSTRUCTION }],
          },
          tools: [{ functionDeclarations: RECEPTIONIST_TOOLS }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    },
  });

  console.log('Token created successfully:', token.name);

  console.log('=== TEST 2: Connecting Client Session ===');
  const clientAi = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let session: any = null;
  let receivedAudioChunks = 0;
  let receivedInputTranscription = 0;
  let receivedOutputTranscription = 0;
  let receivedModelTurn = 0;
  let receivedToolCall = 0;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.log('Test timer expired after 20s. Closing session.');
      session?.close();
      resolve();
    }, 20000);

    clientAi.live.connect({
      model: liveModel,
      callbacks: {
        onopen: () => {
          console.log('[WEBSOCKET] onopen fired');
        },
        onmessage: (msg: any) => {
          const keys = Object.keys(msg);
          console.log('[WEBSOCKET MESSAGE] keys:', keys);

          if (msg.setupComplete) {
            console.log('[WEBSOCKET MESSAGE] setupComplete received!');
          }

          if (msg.serverContent) {
            if (msg.serverContent.inputTranscription) {
              receivedInputTranscription++;
              console.log('[INPUT TRANSCRIPTION]', JSON.stringify(msg.serverContent.inputTranscription));
            }
            if (msg.serverContent.outputTranscription) {
              receivedOutputTranscription++;
              console.log('[OUTPUT TRANSCRIPTION]', JSON.stringify(msg.serverContent.outputTranscription));
            }
            if (msg.serverContent.modelTurn) {
              receivedModelTurn++;
              for (const part of msg.serverContent.modelTurn.parts || []) {
                if (part.inlineData) {
                  receivedAudioChunks++;
                  console.log(`[MODEL AUDIO CHUNK #${receivedAudioChunks}] mimeType: ${part.inlineData.mimeType}, bytes: ${part.inlineData.data?.length}`);
                }
                if (part.text) {
                  console.log('[MODEL TEXT]', part.text);
                }
              }
            }
            if (msg.serverContent.turnComplete) {
              console.log('[TURN COMPLETE]');
              clearTimeout(timer);
              setTimeout(() => {
                session?.close();
                resolve();
              }, 1000);
            }
          }

          if (msg.toolCall) {
            receivedToolCall++;
            console.log('[TOOL CALL]', JSON.stringify(msg.toolCall));
          }
        },
        onerror: (err: any) => {
          console.error('[WEBSOCKET ERROR]', err);
          clearTimeout(timer);
          reject(err);
        },
        onclose: (ev: any) => {
          console.log('[WEBSOCKET CLOSE] code:', ev.code, 'reason:', ev.reason);
          clearTimeout(timer);
          resolve();
        },
      },
    }).then((s) => {
      session = s;
      console.log('Session ready. Starting audio transmission...');
      streamAudio(s);
    }).catch(reject);

    function streamAudio(s: any) {
      // Send 3 seconds of 16kHz audio:
      // Let's generate a vocal frequency pattern (formants around 500Hz, 1500Hz, 2500Hz modulated at 4Hz to simulate speech prosody)
      const sampleRate = 16000;
      const duration = 3.0; // 3 seconds
      const chunkSize = 2048; // ~128ms
      const totalChunks = Math.floor((sampleRate * duration) / chunkSize);

      let chunk = 0;
      const interval = setInterval(() => {
        if (chunk >= totalChunks) {
          clearInterval(interval);
          console.log(`Streamed all ${totalChunks} audio chunks. Waiting for model response...`);
          return;
        }

        const floatData = new Float32Array(chunkSize);
        for (let i = 0; i < chunkSize; i++) {
          const t = (chunk * chunkSize + i) / sampleRate;
          // Voice-like harmonic spectrum with syllable modulation
          const envelope = 0.5 * (1 + Math.sin(2 * Math.PI * 4 * t));
          floatData[i] = envelope * (
            0.4 * Math.sin(2 * Math.PI * 220 * t) +
            0.3 * Math.sin(2 * Math.PI * 440 * t) +
            0.2 * Math.sin(2 * Math.PI * 880 * t)
          );
        }

        const pcm16 = floatTo16BitPCM(floatData);
        const base64Audio = arrayBufferToBase64(pcm16.buffer);

        console.log(`Sending audio chunk #${chunk + 1}/${totalChunks} (base64 size: ${base64Audio.length})`);

        // Test sending with media:
        try {
          s.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Audio,
            },
          });
        } catch (e: any) {
          console.error('Error sending realtime input:', e);
        }

        chunk++;
      }, 120);
    }
  });

  console.log('\n=== SUMMARY OF RECEIVED EVENTS ===');
  console.log('Input transcriptions:', receivedInputTranscription);
  console.log('Output transcriptions:', receivedOutputTranscription);
  console.log('Model turns:', receivedModelTurn);
  console.log('Model audio chunks:', receivedAudioChunks);
  console.log('Tool calls:', receivedToolCall);
}

testAudioStream().catch(console.error);
