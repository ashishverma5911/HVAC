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
  tokenRequest: 'idle' | 'requesting' | 'success' | 'failure';
  liveModel: string;
  tokenReceived: 'yes' | 'no';
  liveSession: 'connected' | 'connecting' | 'disconnected' | 'failed';
  microphone: 'connected' | 'disconnected';
  audioChunksGenerated: number;
  audioChunksSent: number;
  audioBytesSent: number;
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

  // Media & Web Audio (Unified context for both capture and playback)
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private muteGainNode: GainNode | null = null;

  // Audio Playback
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
    tokenRequest: 'idle',
    liveModel: 'gemini-3.8-live',
    tokenReceived: 'no',
    liveSession: 'disconnected',
    microphone: 'disconnected',
    audioChunksGenerated: 0,
    audioChunksSent: 0,
    audioBytesSent: 0,
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
      tokenRequest: 'idle',
      liveModel: 'gemini-3.8-live',
      tokenReceived: 'no',
      liveSession: 'connecting',
      microphone: 'disconnected',
      audioChunksGenerated: 0,
      audioChunksSent: 0,
      audioBytesSent: 0,
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

      // Initialize unified AudioContext immediately synchronously during user gesture window
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.nextPlayTime = this.audioContext.currentTime;

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

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // 3. Immediately setup microphone capture so audio level meter responds right away
      await this.setupMicrophoneCapture(stream);

      // 4. Request short-lived ephemeral token from server
      this.diagnostics.tokenRequest = 'requesting';
      this.diagnostics.tokenReceived = 'no';
      this.diagnostics.liveModel = 'gemini-3.8-live';
      this.emitDiagnostics();

      const tokenStart = Date.now();
      console.log('[Live Voice Diagnostics] Token endpoint request started: POST /api/receptionist/live-token');

      const tokenRes = await fetch('/api/receptionist/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: this.conversationId }),
      });

      const tokenDurationMs = Date.now() - tokenStart;

      if (!tokenRes.ok) {
        this.diagnostics.tokenRequest = 'failure';
        this.diagnostics.tokenReceived = 'no';
        this.diagnostics.liveSession = 'failed';
        this.emitDiagnostics();
        const errData = await tokenRes.json().catch(() => ({}));
        console.error('[Live Voice Diagnostics] Token request failed:', {
          status: tokenRes.status,
          category: errData.category || 'UNKNOWN',
          durationMs: tokenDurationMs,
          error: errData.error,
        });
        throw new Error(
          errData.error || `Failed to authenticate live voice session with the server (HTTP ${tokenRes.status}).`
        );
      }

      const resData = await tokenRes.json();
      const { token, model } = resData;

      console.log('[Live Voice Diagnostics] Token endpoint responded successfully:', {
        status: tokenRes.status,
        durationMs: tokenDurationMs,
        model: model || 'gemini-3.8-live',
        hasTokenName: typeof token === 'string' && token.startsWith('auth_tokens/'),
        hasExpireTime: !!resData.expireTime,
      });

      if (!token) {
        this.diagnostics.tokenRequest = 'failure';
        this.diagnostics.tokenReceived = 'no';
        this.diagnostics.liveSession = 'failed';
        this.emitDiagnostics();
        throw new Error('Server returned an invalid live session token (missing token identifier).');
      }

      this.diagnostics.tokenRequest = 'success';
      this.diagnostics.tokenReceived = 'yes';
      this.diagnostics.liveModel = model || 'gemini-3.8-live';
      this.emitDiagnostics();

      // 5. Initialize client-side GoogleGenAI using the ephemeral token (v1alpha)
      this.aiClient = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

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
            this.diagnostics.liveSession = 'failed';
            this.emitDiagnostics();
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
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Ensure all audio tracks are active
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMutedState;
    });

    const sourceSampleRate = this.audioContext.sampleRate;

    // Disconnect previous nodes if any
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

    this.micSourceNode = this.audioContext.createMediaStreamSource(stream);
    // Buffer size 4096 gives ~85-93ms latency chunks at 44.1/48kHz, optimal for streaming
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (this.state === 'IDLE' || this.state === 'ENDED') {
        return;
      }

      if (this.isMutedState) {
        this.callbacks.onAudioLevel?.(0);
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate audio energy/level for UI visualization
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const normalizedLevel = Math.min(1.0, rms * 5); // Responsive visualization
      this.callbacks.onAudioLevel?.(normalizedLevel);

      this.diagnostics.audioChunksGenerated += 1;

      // Only send audio if Live session is ready
      if (!this.liveSession) {
        return;
      }

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
    // Connecting to destination is essential in Chromium to keep the ScriptProcessor running!
    this.muteGainNode = this.audioContext.createGain();
    this.muteGainNode.gain.value = 0;
    this.processorNode.connect(this.muteGainNode);
    this.muteGainNode.connect(this.audioContext.destination);
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
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    try {
      const int16Array = base64ToInt16Array(base64Data);
      const float32Array = pcm16ToFloat32(int16Array);

      // Calculate audio energy for AI speaking visualization
      let sum = 0;
      for (let i = 0; i < float32Array.length; i++) {
        sum += float32Array[i] * float32Array[i];
      }
      const rms = Math.sqrt(sum / float32Array.length);
      const normalizedLevel = Math.min(1.0, rms * 5);
      this.callbacks.onAudioLevel?.(normalizedLevel);

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.audioContext.destination);

      // Low latency scheduling: schedule immediately after the previous chunk
      const now = this.audioContext.currentTime;
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
          this.callbacks.onAudioLevel?.(0);
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
    this.callbacks.onAudioLevel?.(0);
    this.emitDiagnostics();
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
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

    if (muted) {
      this.callbacks.onAudioLevel?.(0);
    } else if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
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

    // 4. Close unified audio context
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
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
