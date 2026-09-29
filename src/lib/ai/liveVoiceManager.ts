'use client';

import { GoogleGenAI } from '@google/genai';
import { AgentAction } from '@/types';
import {
  floatTo16BitPCM,
  pcm16ToFloat32,
  arrayBufferToBase64,
  base64ToInt16Array,
  downsampleBuffer,
} from './audioUtils';

export type VoiceState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'AI_SPEAKING'
  | 'PROCESSING'
  | 'MUTED'
  | 'ERROR'
  | 'ENDED';

export interface LiveTranscriptTurn {
  turnId: string;
  speaker: 'customer' | 'ai';
  text: string;
  isFinal: boolean;
}

export interface LiveVoiceDiagnostics {
  sessionId: string;
  microphone: 'connected' | 'disconnected';
  audioChunksGenerated: number;
  audioChunksSent: number;
  audioBytesSent: number;
  liveSession: 'connected' | 'connecting' | 'disconnected';
  inputTranscriptionEvents: number;
  finalUserTurns: number;
  outputTranscriptionEvents: number;
  finalAssistantTurns: number;
  modelAudioChunks: number;
  toolCalls: number;
  duplicateUserTurnsBlocked: number;
  duplicateAssistantTurnsBlocked: number;
  playback: 'idle' | 'playing';
}

export interface LiveVoiceCallbacks {
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (turn: LiveTranscriptTurn) => void;
  onFinalUserUtterance?: (utterance: string) => void;
  onActionExecuted?: (action: AgentAction) => void;
  onError?: (errorMessage: string) => void;
  onAudioLevel?: (level: number) => void; // Normalized 0.0 - 1.0
  onDiagnostics?: (diag: LiveVoiceDiagnostics) => void;
}

export class LiveVoiceManager {
  private state: VoiceState = 'IDLE';
  private callbacks: LiveVoiceCallbacks;
  private conversationId: string = '';
  private isMutedState: boolean = false;

  // Media & Web Audio
  private mediaStream: MediaStream | null = null;
  private captureAudioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private muteGainNode: GainNode | null = null;

  // Audio Playback
  private playbackAudioContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];

  // Gemini Live Session
  private liveSession: any = null;
  private aiClient: GoogleGenAI | null = null;

  // Canonical Turn Buffers & Identifiers
  private userTurnCounter: number = 0;
  private aiTurnCounter: number = 0;
  private currentUserTurnId: string = 'turn-user-1';
  private currentAiTurnId: string = 'turn-ai-1';
  private currentUserTurnText: string = '';
  private currentAiTurnText: string = '';
  private isUserTurnActive: boolean = false;
  private isAiTurnActive: boolean = false;

  // Development Diagnostics
  private diagnostics: LiveVoiceDiagnostics = {
    sessionId: 'IDLE',
    microphone: 'disconnected',
    audioChunksGenerated: 0,
    audioChunksSent: 0,
    audioBytesSent: 0,
    liveSession: 'disconnected',
    inputTranscriptionEvents: 0,
    finalUserTurns: 0,
    outputTranscriptionEvents: 0,
    finalAssistantTurns: 0,
    modelAudioChunks: 0,
    toolCalls: 0,
    duplicateUserTurnsBlocked: 0,
    duplicateAssistantTurnsBlocked: 0,
    playback: 'idle',
  };

  constructor(callbacks: LiveVoiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public getState(): VoiceState {
    return this.state;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public getDiagnostics(): LiveVoiceDiagnostics {
    return { ...this.diagnostics };
  }

  private emitDiagnostics(): void {
    this.callbacks.onDiagnostics?.({ ...this.diagnostics });
  }

  private setState(newState: VoiceState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  /**
   * Starts a real-time browser voice session.
   */
  public async start(conversationId: string): Promise<void> {
    if (this.state !== 'IDLE' && this.state !== 'ENDED' && this.state !== 'ERROR') {
      return;
    }

    this.conversationId = conversationId;
    const generatedSessionId = `LIVE-${Date.now().toString(36).toUpperCase()}`;

    // Reset turn tracking
    this.userTurnCounter = 0;
    this.aiTurnCounter = 0;
    this.currentUserTurnId = 'turn-user-1';
    this.currentAiTurnId = 'turn-ai-1';
    this.currentUserTurnText = '';
    this.currentAiTurnText = '';
    this.isUserTurnActive = false;
    this.isAiTurnActive = false;

    this.diagnostics = {
      sessionId: generatedSessionId,
      microphone: 'disconnected',
      audioChunksGenerated: 0,
      audioChunksSent: 0,
      audioBytesSent: 0,
      liveSession: 'connecting',
      inputTranscriptionEvents: 0,
      finalUserTurns: 0,
      outputTranscriptionEvents: 0,
      finalAssistantTurns: 0,
      modelAudioChunks: 0,
      toolCalls: 0,
      duplicateUserTurnsBlocked: 0,
      duplicateAssistantTurnsBlocked: 0,
      playback: 'idle',
    };
    this.emitDiagnostics();

    this.setState('CONNECTING');

    try {
      // 1. Verify Browser Web Audio API support
      if (
        typeof window === 'undefined' ||
        !navigator?.mediaDevices?.getUserMedia ||
        !(window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      ) {
        throw new Error(
          'Your browser does not support the required Web Audio or Microphone APIs. Please use Google Chrome, Edge, or Firefox.'
        );
      }

      // 2. Request microphone access explicitly
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Microphone permission was denied. Please allow microphone access to use voice.');
        }
        throw new Error(`Microphone access error: ${error.message || 'Unable to open microphone'}`);
      }
      this.mediaStream = stream;
      this.diagnostics.microphone = 'connected';
      this.emitDiagnostics();

      // 3. Request short-lived ephemeral token from server
      const tokenRes = await fetch('/api/receptionist/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: this.conversationId }),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to authenticate live voice session with the server.');
      }

      const { token, model } = await tokenRes.json();
      if (!token) {
        throw new Error('Server returned an invalid live session token.');
      }

      // 4. Initialize client-side GoogleGenAI using the ephemeral token (v1alpha)
      this.aiClient = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      // 5. Initialize Audio Contexts early with user gesture
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.playbackAudioContext = new AudioCtx();
      if (this.playbackAudioContext.state === 'suspended') {
        await this.playbackAudioContext.resume();
      }
      this.nextPlayTime = this.playbackAudioContext.currentTime;

      // 6. Connect to Gemini Live API WebSocket
      const session = await this.aiClient.live.connect({
        model: model || 'gemini-3.8-live',
        callbacks: {
          onopen: () => {
            this.diagnostics.liveSession = 'connected';
            this.emitDiagnostics();
            this.setState(this.isMutedState ? 'MUTED' : 'LISTENING');
          },
          onmessage: (msg: any) => {
            this.handleServerMessage(msg);
          },
          onerror: (err: any) => {
            console.error('[Live Voice Diagnostics] WebSocket error:', err);
            this.callbacks.onError?.('Live voice connection error occurred.');
            this.setState('ERROR');
          },
          onclose: (ev: any) => {
            console.log('[Live Voice Diagnostics] Connection closed:', ev.code, ev.reason);
            this.diagnostics.liveSession = 'disconnected';
            this.emitDiagnostics();
            if (this.state !== 'ENDED') {
              this.stop();
            }
          },
        },
      });

      this.liveSession = session;

      // 7. Initialize Microphone Capture & Streaming only AFTER session is ready
      await this.setupMicrophoneCapture(stream);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start voice conversation.';
      console.error('[Live Voice] Initialization failed:', msg);
      this.cleanup();
      this.setState('ERROR');
      this.callbacks.onError?.(msg);
    }
  }

  /**
   * Sets up microphone audio capture and sends 16kHz PCM chunks to Gemini Live.
   * Uses a zero-gain node sink to prevent mic input from echoing into user speakers.
   */
  private async setupMicrophoneCapture(stream: MediaStream): Promise<void> {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    
    // Request 16000Hz directly from Web Audio API if supported
    try {
      this.captureAudioContext = new AudioCtx({ sampleRate: 16000 });
    } catch {
      this.captureAudioContext = new AudioCtx();
    }

    if (this.captureAudioContext.state === 'suspended') {
      await this.captureAudioContext.resume();
    }
    const sourceSampleRate = this.captureAudioContext.sampleRate;

    this.micSourceNode = this.captureAudioContext.createMediaStreamSource(stream);
    // Buffer size 4096 gives ~85-93ms latency chunks at 44.1/48kHz, optimal for streaming
    this.processorNode = this.captureAudioContext.createScriptProcessor(4096, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (this.isMutedState || !this.liveSession || this.state === 'IDLE' || this.state === 'ENDED') {
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate audio energy/level for UI visualization
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const normalizedLevel = Math.min(1.0, rms * 4); // Boost visually
      this.callbacks.onAudioLevel?.(normalizedLevel);

      this.diagnostics.audioChunksGenerated += 1;

      // Downsample to 16000Hz for Gemini Live input
      const downsampled = downsampleBuffer(inputData, sourceSampleRate, 16000);
      const pcm16 = floatTo16BitPCM(downsampled);
      const base64Audio = arrayBufferToBase64(pcm16.buffer);

      try {
        // Send single audio field as required by Gemini Live API
        this.liveSession.sendRealtimeInput({
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio,
          },
        });

        this.diagnostics.audioChunksSent += 1;
        this.diagnostics.audioBytesSent += pcm16.byteLength;

        // Periodic diagnostics emit every 20 chunks (~1.8s)
        if (this.diagnostics.audioChunksSent % 20 === 0) {
          this.emitDiagnostics();
        }
      } catch (err) {
        console.error('[Live Voice] Error sending realtime input:', err);
      }
    };

    // Connect mic source to processor
    this.micSourceNode.connect(this.processorNode);

    // Route processor through zero-gain node to destination to prevent speaker feedback loop
    this.muteGainNode = this.captureAudioContext.createGain();
    this.muteGainNode.gain.value = 0;
    this.processorNode.connect(this.muteGainNode);
    this.muteGainNode.connect(this.captureAudioContext.destination);
  }

  /**
   * Finalizes the current user turn idempotently and emits the full accumulated utterance.
   */
  private finalizeUserTurn(): void {
    if (!this.isUserTurnActive || !this.currentUserTurnText.trim()) {
      if (this.currentUserTurnText.trim().length > 0) {
        this.diagnostics.duplicateUserTurnsBlocked += 1;
        this.emitDiagnostics();
      }
      return;
    }

    const text = this.currentUserTurnText.trim();
    const turnId = this.currentUserTurnId;

    this.isUserTurnActive = false;
    this.currentUserTurnText = '';
    this.userTurnCounter += 1;
    this.currentUserTurnId = `turn-user-${this.userTurnCounter + 1}`;
    this.diagnostics.finalUserTurns += 1;
    this.emitDiagnostics();

    this.callbacks.onTranscript?.({
      turnId,
      speaker: 'customer',
      text,
      isFinal: true,
    });
    this.callbacks.onFinalUserUtterance?.(text);
  }

  /**
   * Finalizes the current AI turn idempotently and emits the full accumulated response.
   */
  private finalizeAiTurn(): void {
    if (!this.isAiTurnActive || !this.currentAiTurnText.trim()) {
      if (this.currentAiTurnText.trim().length > 0) {
        this.diagnostics.duplicateAssistantTurnsBlocked += 1;
        this.emitDiagnostics();
      }
      return;
    }

    const text = this.currentAiTurnText.trim();
    const turnId = this.currentAiTurnId;

    this.isAiTurnActive = false;
    this.currentAiTurnText = '';
    this.aiTurnCounter += 1;
    this.currentAiTurnId = `turn-ai-${this.aiTurnCounter + 1}`;
    this.diagnostics.finalAssistantTurns += 1;
    this.emitDiagnostics();

    this.callbacks.onTranscript?.({
      turnId,
      speaker: 'ai',
      text,
      isFinal: true,
    });
  }

  /**
   * Handles incoming Gemini Live server messages.
   */
  private async handleServerMessage(msg: any): Promise<void> {
    // 1. Check for user interruption (Barge-in)
    if (msg.serverContent?.interrupted) {
      console.log('[Live Voice Diagnostics] User interrupted AI speech. Discarding audio queue.');
      this.finalizeAiTurn();
      this.handleInterruption();
      return;
    }

    // 2. Process input transcription (User speech to text)
    if (msg.serverContent?.inputTranscription?.text) {
      this.diagnostics.inputTranscriptionEvents += 1;
      this.currentUserTurnText += msg.serverContent.inputTranscription.text;
      this.isUserTurnActive = true;
      this.emitDiagnostics();

      this.callbacks.onTranscript?.({
        turnId: this.currentUserTurnId,
        speaker: 'customer',
        text: this.currentUserTurnText,
        isFinal: false,
      });
    }

    // 3. Play incoming audio chunks from model turn
    if (msg.serverContent?.modelTurn?.parts) {
      // When model begins speaking, finalize pending user turn if any
      this.finalizeUserTurn();

      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          this.diagnostics.modelAudioChunks += 1;
          this.playAudioChunk(part.inlineData.data);
        }
      }
      this.emitDiagnostics();
    }

    // 4. Process output transcription (AI speech to text)
    if (msg.serverContent?.outputTranscription?.text) {
      this.diagnostics.outputTranscriptionEvents += 1;
      this.finalizeUserTurn();

      this.currentAiTurnText += msg.serverContent.outputTranscription.text;
      this.isAiTurnActive = true;
      this.emitDiagnostics();

      this.callbacks.onTranscript?.({
        turnId: this.currentAiTurnId,
        speaker: 'ai',
        text: this.currentAiTurnText,
        isFinal: false,
      });
    }

    // 5. Handle Function/Tool Calls
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
      this.diagnostics.toolCalls += msg.toolCall.functionCalls.length;
      this.finalizeUserTurn();
      this.emitDiagnostics();
      await this.handleToolCalls(msg.toolCall.functionCalls);
    }

    // 6. Handle turn completion
    if (msg.serverContent?.turnComplete) {
      this.finalizeAiTurn();
      this.finalizeUserTurn();

      if (this.activeAudioSources.length === 0 && this.state !== 'MUTED') {
        this.setState('LISTENING');
      }
    }
  }

  /**
   * Plays a 24000Hz PCM audio chunk through Web Audio API.
   */
  private playAudioChunk(base64Data: string): void {
    if (!this.playbackAudioContext) return;

    try {
      const int16Array = base64ToInt16Array(base64Data);
      const float32Array = pcm16ToFloat32(int16Array);

      const audioBuffer = this.playbackAudioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const sourceNode = this.playbackAudioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.playbackAudioContext.destination);

      // Low latency scheduling: schedule immediately after the previous chunk
      const now = this.playbackAudioContext.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      sourceNode.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeAudioSources.push(sourceNode);
      this.diagnostics.playback = 'playing';
      this.emitDiagnostics();
      this.setState('AI_SPEAKING');

      sourceNode.onended = () => {
        const index = this.activeAudioSources.indexOf(sourceNode);
        if (index !== -1) {
          this.activeAudioSources.splice(index, 1);
        }
        if (this.activeAudioSources.length === 0) {
          this.diagnostics.playback = 'idle';
          this.emitDiagnostics();
          if (this.state === 'AI_SPEAKING') {
            this.setState(this.isMutedState ? 'MUTED' : 'LISTENING');
          }
        }
      };
    } catch (err) {
      console.error('[Live Voice] Error decoding/playing audio chunk:', err);
    }
  }

  /**
   * Handles user barge-in / interruption immediately.
   */
  private handleInterruption(): void {
    // Stop and discard all queued audio buffers
    for (const source of this.activeAudioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already have ended
      }
    }
    this.activeAudioSources = [];
    this.diagnostics.playback = 'idle';
    this.emitDiagnostics();
    if (this.playbackAudioContext) {
      this.nextPlayTime = this.playbackAudioContext.currentTime;
    }
    this.setState(this.isMutedState ? 'MUTED' : 'LISTENING');
  }

  /**
   * Dispatches tool calls to the server and returns structured responses to Gemini Live.
   * Format strictly requires id, name, and response: { output: ... }
   */
  private async handleToolCalls(functionCalls: any[]): Promise<void> {
    this.setState('PROCESSING');
    const responses: any[] = [];

    for (const call of functionCalls) {
      console.log(`[Live Voice] Executing tool: ${call.name}`, call.args);
      try {
        const res = await fetch('/api/receptionist/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: this.conversationId,
            toolName: call.name,
            args: call.args || {},
          }),
        });

        const data = await res.json();
        if (data.action) {
          this.callbacks.onActionExecuted?.(data.action);
        }

        responses.push({
          id: call.id,
          name: call.name,
          response: {
            output: data.output || (data.error ? { error: data.error } : { success: data.success }),
          },
        });
      } catch (err: unknown) {
        console.error(`[Live Voice] Error executing tool ${call.name}:`, err);
        responses.push({
          id: call.id,
          name: call.name,
          response: {
            output: { error: 'Failed to execute tool on server' },
          },
        });
      }
    }

    if (this.liveSession && responses.length > 0) {
      try {
        console.log('[Live Voice] Sending tool responses back to Live session:', responses);
        this.liveSession.sendToolResponse({
          functionResponses: responses,
        });
      } catch (err) {
        console.error('[Live Voice] Error sending tool response to session:', err);
      }
    }

    if (this.activeAudioSources.length === 0) {
      this.setState(this.isMutedState ? 'MUTED' : 'LISTENING');
    }
  }

  /**
   * Toggles microphone mute state.
   */
  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    if (this.state !== 'CONNECTING' && this.state !== 'IDLE' && this.state !== 'ENDED') {
      if (muted) {
        this.setState('MUTED');
      } else if (this.activeAudioSources.length > 0) {
        this.setState('AI_SPEAKING');
      } else {
        this.setState('LISTENING');
      }
    }
  }

  /**
   * Ends and completely cleans up the voice session idempotently.
   */
  public stop(): void {
    if (this.state === 'ENDED' || this.state === 'IDLE') {
      return;
    }

    // Flush any pending unfinalized transcripts before teardown
    this.finalizeAiTurn();
    this.finalizeUserTurn();

    // Mark ended before cleanup to prevent re-entrant onclose handling
    this.setState('ENDED');

    try {
      this.cleanup();
    } catch (err) {
      console.error('[Live Voice] Error during cleanup:', err);
    }
  }

  private cleanup(): void {
    this.diagnostics.microphone = 'disconnected';
    this.diagnostics.liveSession = 'disconnected';
    this.diagnostics.playback = 'idle';
    this.emitDiagnostics();

    // 1. Stop all active playback audio
    for (const source of this.activeAudioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeAudioSources = [];

    // 2. Stop microphone tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.mediaStream = null;
    }

    // 3. Disconnect capture audio nodes
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.muteGainNode) {
      this.muteGainNode.disconnect();
      this.muteGainNode = null;
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.captureAudioContext) {
      this.captureAudioContext.close().catch(() => {});
      this.captureAudioContext = null;
    }

    // 4. Close playback audio context
    if (this.playbackAudioContext) {
      this.playbackAudioContext.close().catch(() => {});
      this.playbackAudioContext = null;
    }

    // 5. Close Gemini Live session
    if (this.liveSession) {
      try {
        this.liveSession.close();
      } catch {}
      this.liveSession = null;
    }
    this.aiClient = null;
  }
}
