import { CustomerInfo, LeadStatus, AllowedIntent, AgentAction } from '@/types';
import { extractStructuredCustomerData } from '../ai/extractConversationData';
import { ContractorBusinessConfig } from '../ai/contractorConfig';
import { resolveTelephonyTenant } from './tenantPhoneMapping';

export interface TelephonyMetrics {
  twilioChunksReceived: number;
  twilioBytesReceived: number;
  pcmFramesGenerated: number;
  geminiChunksSent: number;
  geminiAudioChunksReceived: number;
  twilioChunksSent: number;
  twilioBytesSent: number;
  userTranscriptEvents: number;
  modelTranscriptEvents: number;
  toolCalls: number;
  interruptionEvents: number;
  startTime: number;
  endTime?: number;
  durationSeconds: number;
}

export interface TelephonyCallSession {
  callSid: string;
  streamSid: string;
  sessionId: string;
  callerPhone: string | null;
  calledPhone: string | null;
  businessId: string;
  businessConfig: ContractorBusinessConfig;
  geminiSession: any | null;
  createdAt: number;
  lastActivityAt: number;
  ended: boolean;
  endReason?: string;
  
  // Audio state
  isAiSpeaking: boolean;
  queuedOutboundChunks: string[];

  // Conversation & extraction state
  userUtterances: string[];
  accumulatedUserTranscript: string;
  accumulatedAiTranscript: string;
  customerInfo: CustomerInfo;
  leadStatus: LeadStatus;
  detectedIntent: AllowedIntent;
  executedActions: AgentAction[];

  // Watchdog timer
  durationTimer?: NodeJS.Timeout;

  // Real-time call metrics
  metrics: TelephonyMetrics;
}

export class CallSessionManager {
  private static instance: CallSessionManager | null = null;
  private sessionsByStream: Map<string, TelephonyCallSession> = new Map();
  private streamByCallSid: Map<string, string> = new Map();
  private maxDurationSeconds: number;

  private constructor() {
    this.maxDurationSeconds = parseInt(process.env.MAX_CALL_DURATION_SECONDS || '300', 10);
    if (isNaN(this.maxDurationSeconds) || this.maxDurationSeconds <= 0) {
      this.maxDurationSeconds = 300;
    }
  }

  public static getInstance(): CallSessionManager {
    if (!CallSessionManager.instance) {
      CallSessionManager.instance = new CallSessionManager();
    }
    return CallSessionManager.instance;
  }

  /**
   * Initializes a brand-new call session for an incoming Twilio Media Stream.
   * Ensures strict isolation between simultaneous calls.
   */
  public createSession(params: {
    callSid: string;
    streamSid: string;
    callerPhone?: string | null;
    calledPhone?: string | null;
    businessId?: string;
    businessConfig?: ContractorBusinessConfig;
    onDurationLimitReached?: (session: TelephonyCallSession) => void;
  }): TelephonyCallSession {
    // If existing session with this streamSid exists, cleanly clean it up first
    if (this.sessionsByStream.has(params.streamSid)) {
      this.terminateSession(params.streamSid, 'Replaced by new stream');
    }

    const sessionId = `LIVE-CALL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = Date.now();

    const resolvedTenant = params.businessId && params.businessConfig
      ? { businessId: params.businessId, businessConfig: params.businessConfig }
      : resolveTelephonyTenant(params.calledPhone);

    const emptyCustomerInfo: CustomerInfo = {
      name: '',
      phone: params.callerPhone || '',
      address: '',
      serviceAddress: '',
      city: '',
      cityOrArea: '',
      serviceType: '',
      problemDescription: '',
      urgency: 'normal',
      preferredAppointmentTime: '',
    };

    const session: TelephonyCallSession = {
      callSid: params.callSid,
      streamSid: params.streamSid,
      sessionId,
      callerPhone: params.callerPhone || null,
      calledPhone: params.calledPhone || null,
      businessId: resolvedTenant.businessId,
      businessConfig: resolvedTenant.businessConfig,
      geminiSession: null,
      createdAt: now,
      lastActivityAt: now,
      ended: false,
      isAiSpeaking: false,
      queuedOutboundChunks: [],
      userUtterances: [],
      accumulatedUserTranscript: '',
      accumulatedAiTranscript: '',
      customerInfo: emptyCustomerInfo,
      leadStatus: 'new',
      detectedIntent: 'UNKNOWN',
      executedActions: [],
      metrics: {
        twilioChunksReceived: 0,
        twilioBytesReceived: 0,
        pcmFramesGenerated: 0,
        geminiChunksSent: 0,
        geminiAudioChunksReceived: 0,
        twilioChunksSent: 0,
        twilioBytesSent: 0,
        userTranscriptEvents: 0,
        modelTranscriptEvents: 0,
        toolCalls: 0,
        interruptionEvents: 0,
        startTime: now,
        durationSeconds: 0,
      },
    };

    // Watchdog timer for max call duration cost protection
    session.durationTimer = setTimeout(() => {
      console.log(`[CallSessionManager] Max duration (${this.maxDurationSeconds}s) reached for call ${params.callSid}`);
      params.onDurationLimitReached?.(session);
      this.terminateSession(params.streamSid, 'Max duration limit reached');
    }, this.maxDurationSeconds * 1000);

    this.sessionsByStream.set(params.streamSid, session);
    this.streamByCallSid.set(params.callSid, params.streamSid);

    console.log(`[CallSessionManager] Created call session: ${sessionId} (CallSid: ${params.callSid}, StreamSid: ${params.streamSid})`);
    return session;
  }

  public getSessionByStream(streamSid: string): TelephonyCallSession | undefined {
    return this.sessionsByStream.get(streamSid);
  }

  public getSessionByCallSid(callSid: string): TelephonyCallSession | undefined {
    const streamSid = this.streamByCallSid.get(callSid);
    return streamSid ? this.sessionsByStream.get(streamSid) : undefined;
  }

  public getAllActiveSessions(): TelephonyCallSession[] {
    return Array.from(this.sessionsByStream.values()).filter((s) => !s.ended);
  }

  public getRecentSessionsSummary(): Array<{
    sessionId: string;
    callSid: string;
    callerPhone: string;
    durationSeconds: number;
    ended: boolean;
    leadStatus: LeadStatus;
    detectedIntent: AllowedIntent;
    toolCalls: number;
  }> {
    return Array.from(this.sessionsByStream.values()).map((s) => {
      const duration = s.ended && s.metrics.endTime
        ? Math.round((s.metrics.endTime - s.metrics.startTime) / 1000)
        : Math.round((Date.now() - s.metrics.startTime) / 1000);

      // Mask caller phone for security (e.g. +1...0199)
      const rawPhone = s.callerPhone || '';
      const maskedPhone = rawPhone.length > 4
        ? `${rawPhone.substring(0, 2)}***${rawPhone.substring(rawPhone.length - 4)}`
        : 'Unknown';

      return {
        sessionId: s.sessionId,
        callSid: s.callSid.substring(0, 8) + '...',
        callerPhone: maskedPhone,
        durationSeconds: duration,
        ended: s.ended,
        leadStatus: s.leadStatus,
        detectedIntent: s.detectedIntent,
        toolCalls: s.metrics.toolCalls,
      };
    });
  }

  /**
   * Updates customer extraction data upon confirmed customer utterance.
   */
  public recordCustomerUtterance(streamSid: string, text: string): void {
    const session = this.sessionsByStream.get(streamSid);
    if (!session || session.ended) return;

    session.lastActivityAt = Date.now();
    session.userUtterances.push(text);
    session.accumulatedUserTranscript = session.userUtterances.join(' ');

    const { customerInfo, leadStatus, intent } = extractStructuredCustomerData(
      session.accumulatedUserTranscript,
      session.customerInfo,
      session.leadStatus
    );

    session.customerInfo = customerInfo;
    session.leadStatus = leadStatus;
    if (intent && intent !== 'UNKNOWN') {
      session.detectedIntent = intent;
    }
  }

  /**
   * Records tool action execution under this call session.
   */
  public recordToolAction(streamSid: string, action: AgentAction): void {
    const session = this.sessionsByStream.get(streamSid);
    if (!session || session.ended) return;

    session.executedActions.push(action);
    session.metrics.toolCalls += 1;
    session.lastActivityAt = Date.now();
  }

  /**
   * Terminates and cleans up a call session idempotently.
   */
  public terminateSession(streamSid: string, reason: string = 'Normal call completion'): TelephonyCallSession | undefined {
    const session = this.sessionsByStream.get(streamSid);
    if (!session) return undefined;

    if (session.ended) {
      return session;
    }

    session.ended = true;
    session.endReason = reason;
    session.metrics.endTime = Date.now();
    session.metrics.durationSeconds = Math.round((session.metrics.endTime - session.metrics.startTime) / 1000);

    if (session.durationTimer) {
      clearTimeout(session.durationTimer);
      session.durationTimer = undefined;
    }

    // Close Gemini Live session if still active
    if (session.geminiSession) {
      try {
        session.geminiSession.close();
      } catch (err) {
        console.error(`[CallSessionManager] Error closing Gemini session for ${session.sessionId}:`, err);
      }
      session.geminiSession = null;
    }

    this.streamByCallSid.delete(session.callSid);

    console.log(`[CallSessionManager] Terminated session ${session.sessionId} (Duration: ${session.metrics.durationSeconds}s, Reason: ${reason})`);
    return session;
  }
}
