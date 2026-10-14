import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocket } from 'ws';
import { buildReceptionistTools } from '../ai/tools';
import { buildReceptionistSystemInstruction } from '../ai/receptionistPrompt';
import { validateContractorConfiguration } from '../ai/contractorConfig';
import { executeAgentToolAsync } from '../ai/toolExecutor';
import { TelephonyCallSession, CallSessionManager } from './callSessionManager';
import { ContractorPersistenceService } from '../services/contractorPersistence';
import { logDiagnosticEvent } from '../diagnostics/logger';
import {
  pcm16ToBase64,
  base64ToPcm16,
  encodeTwilioOutboundPayload,
} from './audioCodec';

export class GeminiTelephonyBridge {
  private session: TelephonyCallSession;
  private twilioWs: WebSocket;
  private aiClient: GoogleGenAI;
  private liveSession: any = null;
  private isConnecting: boolean = false;
  private hasSentInitialGreeting: boolean = false;
  private pendingUserText: string = '';
  private pendingAiText: string = '';

  constructor(session: TelephonyCallSession, twilioWs: WebSocket) {
    this.session = session;
    this.twilioWs = twilioWs;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiTelephonyBridge] GEMINI_API_KEY environment variable is missing.');
    }

    this.aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });
  }

  /**
   * Flushes any buffered partial user or AI transcripts when a call is interrupted,
   * fails, or disconnects mid-turn so incomplete sessions are honestly preserved.
   */
  public flushPendingTranscripts(reason: string = 'session_interrupted_or_closed'): void {
    if (this.pendingUserText.trim().length > 0) {
      const userText = this.pendingUserText.trim();
      this.pendingUserText = '';
      CallSessionManager.getInstance().recordCustomerUtterance(this.session.streamSid, userText);
      ContractorPersistenceService.persistMessage(
        this.session.businessId,
        this.session.callSid,
        'customer',
        userText,
        { incomplete: true, reason }
      ).catch(() => {});
    }

    if (this.pendingAiText.trim().length > 0) {
      const aiText = this.pendingAiText.trim();
      this.pendingAiText = '';
      ContractorPersistenceService.persistMessage(
        this.session.businessId,
        this.session.callSid,
        'ai',
        aiText,
        { incomplete: true, reason }
      ).catch(() => {});
    }
  }

  /**
   * Connects to Gemini Live session for this call.
   */
  public async connect(): Promise<void> {
    if (this.liveSession || this.isConnecting || this.session.ended) return;

    const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

    // Validate contractor configuration before initializing AI session
    const configValidation = validateContractorConfiguration(this.session.businessConfig);
    if (!configValidation.valid || !configValidation.config) {
      const errMsg = configValidation.reason || 'Invalid contractor configuration';
      CallSessionManager.getInstance().markSessionFailure(this.session.streamSid, errMsg);
      await ContractorPersistenceService.persistCallStatusUpdate(
        this.session.businessId,
        this.session.callSid,
        {
          callStatus: 'failed',
          errorCode: 'INVALID_CONTRACTOR_CONFIGURATION',
          errorMessage: errMsg,
          callerPhone: this.session.callerPhone,
          calledPhone: this.session.calledPhone,
        }
      ).catch(() => {});
      if (this.twilioWs.readyState === WebSocket.OPEN) {
        try {
          this.twilioWs.close(1011, 'Invalid contractor configuration');
        } catch {}
      }
      throw new Error(errMsg);
    }

    if (
      process.env.SKIP_GEMINI_LIVE_IN_TESTS === 'true' &&
      process.env.FORCE_GEMINI_INIT_FAILURE !== 'true'
    ) {
      await ContractorPersistenceService.recordCallLifecycleEvent(
        this.session.businessId,
        this.session.callSid,
        'ai_session_initialized',
        {
          streamSid: this.session.streamSid,
          model: liveModel,
          testMode: true,
        }
      ).catch(() => {});
      return;
    }

    this.isConnecting = true;

    const callerIdNote = this.session.callerPhone
      ? `\n[System Note: The incoming caller's phone number from caller ID is ${this.session.callerPhone}. You may politely confirm if this is the best callback number if needed.]`
      : `\n[System Note: Caller ID was not provided or is anonymous. Politely ask the caller for their best callback phone number during the conversation.]`;

    const dynamicInstruction =
      buildReceptionistSystemInstruction(configValidation.config) + callerIdNote;
    const dynamicTools = buildReceptionistTools(configValidation.config);

    try {
      if (process.env.FORCE_GEMINI_INIT_FAILURE === 'true') {
        throw new Error('Gemini Live session initialization failed');
      }

      console.log(
        `[GeminiTelephonyBridge] Connecting call ${this.session.sessionId} (tenant: ${this.session.businessConfig.name}) to ${liveModel}...`
      );

      const session = await this.aiClient.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede', // Professional natural receptionist voice
              },
            },
          },
          systemInstruction: {
            parts: [{ text: dynamicInstruction }],
          },
          tools: [{ functionDeclarations: dynamicTools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log(`[GeminiTelephonyBridge] Gemini session onopen for ${this.session.sessionId}`);
            logDiagnosticEvent({
              event: 'GEMINI_CONNECTED',
              businessId: this.session.businessId,
              conversationId: this.session.callSid,
              correlationId: this.session.sessionId,
              details: { streamSid: this.session.streamSid },
            });
            ContractorPersistenceService.recordCallLifecycleEvent(
              this.session.businessId,
              this.session.callSid,
              'ai_session_initialized',
              {
                streamSid: this.session.streamSid,
                model: liveModel,
              }
            ).catch(() => {});
          },
          onmessage: (msg: any) => {
            this.handleGeminiServerMessage(msg);
          },
          onerror: (err: any) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[GeminiTelephonyBridge] Live error for ${this.session.sessionId}:`, err);
            this.flushPendingTranscripts('gemini_live_error');
            logDiagnosticEvent({
              event: 'CALL_ERROR',
              businessId: this.session.businessId,
              conversationId: this.session.callSid,
              correlationId: this.session.sessionId,
              error: errMsg,
            });
            CallSessionManager.getInstance().markSessionFailure(this.session.streamSid, errMsg);
            ContractorPersistenceService.persistCallStatusUpdate(
              this.session.businessId,
              this.session.callSid,
              {
                callStatus: 'failed',
                errorCode: 'GEMINI_LIVE_ERROR',
                errorMessage: errMsg,
                callerPhone: this.session.callerPhone,
                calledPhone: this.session.calledPhone,
              }
            ).catch(() => {});
          },
          onclose: (c: any) => {
            console.log(
              `[GeminiTelephonyBridge] Live closed for ${this.session.sessionId} (code: ${c.code}, reason: "${c.reason}")`
            );
            this.flushPendingTranscripts('gemini_live_closed');
            if (!this.session.ended) {
              CallSessionManager.getInstance().terminateSession(this.session.streamSid, 'Gemini Live closed');
            }
          },
        },
      });

      if (this.session.ended || this.twilioWs.readyState !== WebSocket.OPEN) {
        this.isConnecting = false;
        try {
          session.close();
        } catch {
          // Ignore close error on already-terminated call
        }
        return;
      }

      this.liveSession = session;
      this.session.geminiSession = session;
      this.isConnecting = false;
      console.log(`[GeminiTelephonyBridge] Successfully connected Gemini Live for call ${this.session.sessionId}`);
    } catch (err) {
      this.isConnecting = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GeminiTelephonyBridge] Connection failure for ${this.session.sessionId}:`, err);
      this.flushPendingTranscripts('gemini_init_failure');
      logDiagnosticEvent({
        event: 'CALL_ERROR',
        businessId: this.session.businessId,
        conversationId: this.session.callSid,
        correlationId: this.session.sessionId,
        error: errMsg,
      });
      CallSessionManager.getInstance().markSessionFailure(this.session.streamSid, errMsg);
      await ContractorPersistenceService.persistCallStatusUpdate(
        this.session.businessId,
        this.session.callSid,
        {
          callStatus: 'failed',
          errorCode: 'GEMINI_INIT_FAILURE',
          errorMessage: errMsg,
          callerPhone: this.session.callerPhone,
          calledPhone: this.session.calledPhone,
        }
      ).catch(() => {});

      // Close Twilio Media Stream WebSocket so Twilio immediately executes the post-<Connect> fallback TwiML
      if (this.twilioWs.readyState === WebSocket.OPEN) {
        try {
          this.twilioWs.close(1011, 'AI receptionist session failed to start');
        } catch {
          // Ignore close errors
        }
      }
      throw err;
    }
  }

  /**
   * Forwards a 16kHz PCM audio chunk received from the caller to Gemini Live.
   */
  public sendCallerAudioChunk(pcm16: Int16Array): void {
    if (!this.liveSession || this.session.ended) return;

    try {
      const base64Audio = pcm16ToBase64(pcm16);
      this.liveSession.sendRealtimeInput({
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio,
        },
      });

      this.session.metrics.geminiChunksSent += 1;
      this.session.lastActivityAt = Date.now();
    } catch (err) {
      console.error(`[GeminiTelephonyBridge] Error streaming caller audio to Gemini:`, err);
    }
  }

  /**
   * Handles incoming server messages from Gemini Live.
   */
  public async handleGeminiServerMessage(msg: any): Promise<void> {
    if (this.session.ended) return;

    // A. Handshake complete -> Trigger initial greeting once
    if (msg.setupComplete && !this.hasSentInitialGreeting) {
      this.hasSentInitialGreeting = true;
      this.triggerInitialGreeting();
      return;
    }

    // B. Caller Interruption / Barge-in
    if (msg.serverContent?.interrupted) {
      console.log(`[GeminiTelephonyBridge] Interruption detected on ${this.session.sessionId}. Clearing Twilio audio buffer.`);
      this.session.metrics.interruptionEvents += 1;
      this.flushPendingTranscripts('caller_interrupted');
      this.clearTwilioPlaybackBuffer();
      return;
    }

    // C. User transcription
    if (msg.serverContent?.inputTranscription?.text) {
      this.session.metrics.userTranscriptEvents += 1;
      this.pendingUserText += msg.serverContent.inputTranscription.text;
    }

    // D. Model Audio Chunks -> Transcode to 8kHz μ-law and send to Twilio
    if (msg.serverContent?.modelTurn?.parts) {
      // Finalize pending user text if any
      if (this.pendingUserText.trim().length > 0) {
        const userText = this.pendingUserText.trim();
        CallSessionManager.getInstance().recordCustomerUtterance(this.session.streamSid, userText);

        logDiagnosticEvent({
          event: 'USER_TRANSCRIPT',
          businessId: this.session.businessId,
          conversationId: this.session.callSid,
          correlationId: this.session.sessionId,
          details: { textLength: userText.length },
        });

        // Persist message to database
        ContractorPersistenceService.persistMessage(
          this.session.businessId,
          this.session.callSid,
          'customer',
          userText
        ).catch(() => {});

        this.pendingUserText = '';
      }

      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          this.session.metrics.geminiAudioChunksReceived += 1;
          this.sendAudioChunkToTwilio(part.inlineData.data);
        }
      }
    }

    // E. Model Text Transcription
    if (msg.serverContent?.outputTranscription?.text) {
      this.session.metrics.modelTranscriptEvents += 1;
      this.pendingAiText += msg.serverContent.outputTranscription.text;
      this.session.accumulatedAiTranscript += msg.serverContent.outputTranscription.text;
    }

    // F. Function / Tool Calls
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
      await this.handleToolCalls(msg.toolCall.functionCalls);
    }

    // G. Turn Complete
    if (msg.serverContent?.turnComplete) {
      if (this.pendingUserText.trim().length > 0) {
        const userText = this.pendingUserText.trim();
        CallSessionManager.getInstance().recordCustomerUtterance(this.session.streamSid, userText);

        ContractorPersistenceService.persistMessage(
          this.session.businessId,
          this.session.callSid,
          'customer',
          userText
        ).catch(() => {});

        this.pendingUserText = '';
      }

      if (this.pendingAiText.trim().length > 0) {
        const aiText = this.pendingAiText.trim();
        ContractorPersistenceService.persistMessage(
          this.session.businessId,
          this.session.callSid,
          'ai',
          aiText
        ).catch(() => {});

        this.pendingAiText = '';
      }
    }
  }

  /**
   * Prompts Gemini to speak the initial HVAC receptionist greeting upon call connection.
   */
  private triggerInitialGreeting(): void {
    if (!this.liveSession) return;
    try {
      console.log(`[GeminiTelephonyBridge] Triggering initial receptionist greeting for ${this.session.sessionId}`);
      this.liveSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `The phone call has just connected. Please greet the caller now as AERIS with the standard ${this.session.businessConfig.name} receptionist greeting.`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      console.error(`[GeminiTelephonyBridge] Error triggering initial greeting:`, err);
    }
  }

  /**
   * Transcodes Gemini PCM (24kHz) to 8kHz μ-law and sends a Twilio Media Stream message.
   */
  private sendAudioChunkToTwilio(base64Pcm: string): void {
    if (this.twilioWs.readyState !== WebSocket.OPEN) return;

    try {
      const pcm24k = base64ToPcm16(base64Pcm);
      const mulawBase64 = encodeTwilioOutboundPayload(pcm24k, 24000);

      const twilioMsg = JSON.stringify({
        event: 'media',
        streamSid: this.session.streamSid,
        media: {
          payload: mulawBase64,
        },
      });

      this.twilioWs.send(twilioMsg);
      this.session.metrics.twilioChunksSent += 1;
      this.session.metrics.twilioBytesSent += Math.floor(pcm24k.length / 3);
    } catch (err) {
      console.error(`[GeminiTelephonyBridge] Error encoding/sending audio to Twilio:`, err);
    }
  }

  /**
   * Sends a Twilio 'clear' event to immediately purge buffered audio on the caller's phone (barge-in).
   */
  private clearTwilioPlaybackBuffer(): void {
    if (this.twilioWs.readyState !== WebSocket.OPEN) return;

    try {
      const clearMsg = JSON.stringify({
        event: 'clear',
        streamSid: this.session.streamSid,
      });
      this.twilioWs.send(clearMsg);
    } catch (err) {
      console.error(`[GeminiTelephonyBridge] Error sending clear event to Twilio:`, err);
    }
  }

  /**
   * Executes Phase 4 receptionist tools asynchronously and returns function responses to Gemini Live.
   */
  private async handleToolCalls(functionCalls: any[]): Promise<void> {
    const responses: any[] = [];

    for (const call of functionCalls) {
      console.log(
        `[GeminiTelephonyBridge] Telephony call ${this.session.sessionId} executing tool: ${call.name}`
      );

      const rawArgs = call.args && typeof call.args === 'object' ? { ...call.args } : {};
      const candidateTenant =
        (typeof rawArgs.businessId === 'string' && rawArgs.businessId) ||
        (typeof rawArgs.business_id === 'string' && rawArgs.business_id) ||
        (typeof rawArgs.contractorId === 'string' && rawArgs.contractorId) ||
        '';
      if (candidateTenant) {
        CallSessionManager.getInstance().attemptMidCallContractorSwitch(
          this.session.streamSid,
          candidateTenant
        );
      }

      const result = await executeAgentToolAsync(call.name, rawArgs, {
        conversationId: this.session.callSid,
        businessConfig: this.session.businessConfig,
        businessId: this.session.businessId,
        isDemo: false,
        channel: 'telephony',
      });

      CallSessionManager.getInstance().recordToolAction(this.session.streamSid, result.action);

      logDiagnosticEvent({
        event: 'TOOL_EXECUTED',
        businessId: this.session.businessId,
        conversationId: this.session.callSid,
        correlationId: this.session.sessionId,
        details: {
          toolName: call.name,
          success: result.success,
        },
      });

      responses.push({
        id: call.id,
        name: call.name,
        response: {
          output: result.output || (result.error ? { error: result.error } : { success: result.success }),
        },
      });
    }

    if (this.liveSession && responses.length > 0) {
      try {
        this.liveSession.sendToolResponse({
          functionResponses: responses,
        });
      } catch (err) {
        console.error(`[GeminiTelephonyBridge] Error sending tool response back to Gemini:`, err);
      }
    }
  }

  /**
   * Closes the bridge and tears down the live session, flushing any pending partial transcripts.
   */
  public close(): void {
    this.flushPendingTranscripts('bridge_closed');
    if (this.liveSession) {
      try {
        this.liveSession.close();
      } catch {}
      this.liveSession = null;
    }
  }
}

