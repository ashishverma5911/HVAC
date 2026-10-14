import { CustomerInfo, LeadStatus, AllowedIntent, AgentAction } from '@/types';
import { extractStructuredCustomerData } from '../ai/extractConversationData';
import { ContractorBusinessConfig, validateContractorConfiguration } from '../ai/contractorConfig';
import {
  InboundDestinationResolution,
  resolveInboundDestinationRouteAsync,
  resolveTelephonyTenant,
} from './tenantPhoneMapping';
import { verifyStreamCorrelationToken } from './twilioSecurity';
import { normalizeCallerPhoneInput } from '../compliance/callPrivacyAndCompliance';

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

export interface WebhookCallRegistration {
  callSid: string;
  callerPhone: string | null;
  calledPhone: string;
  forwardedFrom?: string;
  businessId: string;
  businessConfig: ContractorBusinessConfig;
  correlationToken: string;
  twiml: string;
  registeredAt: number;
  deliveryCount: number;
  streamSid?: string;
  callStatus: string;
  failureReason?: string;
}

export interface StreamStartValidationResult {
  valid: boolean;
  streamSid: string;
  callSid: string;
  callerPhone: string | null;
  calledPhone: string;
  businessId?: string;
  businessConfig?: ContractorBusinessConfig;
  reason?: string;
}

export interface TelephonyCallSession {
  readonly callSid: string;
  readonly streamSid: string;
  readonly sessionId: string;
  callerPhone: string | null;
  calledPhone: string | null;
  readonly businessId: string;
  readonly businessConfig: ContractorBusinessConfig;
  geminiSession: { close: () => void } | null;
  createdAt: number;
  lastActivityAt: number;
  ended: boolean;
  endReason?: string;
  failed?: boolean;
  failureReason?: string;
  twilioCallStatus?: string;
  securityViolations?: number;

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
  private webhookRegistrations: Map<string, WebhookCallRegistration> = new Map();
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
   * Registers an inbound Twilio voice webhook by CallSid.
   * Safely handles duplicate webhook deliveries idempotently without switching contractors
   * or re-initializing the call registration.
   */
  public registerInboundWebhook(params: {
    callSid: string;
    callerPhone?: string | null;
    calledPhone: string;
    forwardedFrom?: string;
    businessId: string;
    businessConfig: ContractorBusinessConfig;
    correlationToken: string;
    twiml: string;
  }): { isDuplicate: boolean; registration: WebhookCallRegistration } {
    const existing = this.webhookRegistrations.get(params.callSid);
    if (existing) {
      existing.deliveryCount += 1;
      console.log(
        `[CallSessionManager] Duplicate webhook delivery (#${existing.deliveryCount}) handled idempotently for CallSid=${params.callSid} (Contractor=${existing.businessId})`
      );
      return { isDuplicate: true, registration: existing };
    }

    const frozenConfig = Object.freeze({ ...params.businessConfig });
    const registration: WebhookCallRegistration = {
      callSid: params.callSid,
      callerPhone: normalizeCallerPhoneInput(params.callerPhone),
      calledPhone: params.calledPhone,
      forwardedFrom: params.forwardedFrom,
      businessId: params.businessId,
      businessConfig: frozenConfig,
      correlationToken: params.correlationToken,
      twiml: params.twiml,
      registeredAt: Date.now(),
      deliveryCount: 1,
      callStatus: 'ringing',
    };

    Object.defineProperty(registration, 'businessId', {
      value: params.businessId,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(registration, 'businessConfig', {
      value: frozenConfig,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    this.webhookRegistrations.set(params.callSid, registration);
    return { isDuplicate: false, registration };
  }

  public getWebhookRegistration(callSid: string): WebhookCallRegistration | undefined {
    return this.webhookRegistrations.get(callSid);
  }

  /**
   * Validates a Twilio Media Stream `start` event, correlates `streamSid` and `callSid`,
   * and verifies the contractor context from server-trusted webhook registration or
   * destination-number routing (never trusting an unverified client businessId).
   */
  public async validateAndCorrelateStreamStart(params: {
    streamSid?: string | null;
    callSid?: string | null;
    customParameters?: Record<string, unknown> | null;
    strictDestinationCheck?: boolean;
  }): Promise<StreamStartValidationResult> {
    const streamSid = typeof params.streamSid === 'string' ? params.streamSid.trim() : '';
    const custom = params.customParameters || {};
    const callSidFromCustom =
      typeof custom.callSid === 'string' ? custom.callSid.trim() : '';
    const callSid =
      (typeof params.callSid === 'string' ? params.callSid.trim() : '') || callSidFromCustom;

    const callerPhone = normalizeCallerPhoneInput(
      typeof custom.callerPhone === 'string' ? custom.callerPhone : null
    );
    const calledPhone =
      typeof custom.calledPhone === 'string' ? custom.calledPhone.trim() : '';
    const correlationToken =
      typeof custom.correlationToken === 'string' ? custom.correlationToken.trim() : '';
    const suppliedBusinessId =
      typeof custom.businessId === 'string' ? custom.businessId.trim() : '';

    if (!streamSid) {
      return {
        valid: false,
        streamSid: '',
        callSid,
        callerPhone,
        calledPhone,
        reason: 'MISSING_STREAM_SID',
      };
    }

    if (!callSid) {
      return {
        valid: false,
        streamSid,
        callSid: '',
        callerPhone,
        calledPhone,
        reason: 'MISSING_CALL_SID',
      };
    }

    // 1. Check if this CallSid was already registered by the voice HTTP webhook
    const existingReg = this.webhookRegistrations.get(callSid);
    if (existingReg) {
      // If customParameters supplied a different businessId than what the webhook registered,
      // reject the spoofed override and enforce the immutable webhook-registered contractor.
      if (suppliedBusinessId && suppliedBusinessId !== existingReg.businessId) {
        console.warn(
          `[CallSessionManager] Security Alert: Stream start for CallSid=${callSid} supplied conflicting businessId="${suppliedBusinessId}" vs registered="${existingReg.businessId}". Enforcing registered contractor.`
        );
      }

      // If a correlationToken was explicitly provided, verify it matches the registered call/contractor
      if (
        correlationToken &&
        correlationToken !== existingReg.correlationToken &&
        !verifyStreamCorrelationToken(correlationToken, {
          callSid,
          calledPhone: existingReg.calledPhone || calledPhone,
          callerPhone: existingReg.callerPhone || callerPhone || '',
          businessId: existingReg.businessId,
        })
      ) {
        console.warn(
          `[CallSessionManager] Rejecting stream start for CallSid=${callSid}: invalid stream correlation token.`
        );
        return {
          valid: false,
          streamSid,
          callSid,
          callerPhone: existingReg.callerPhone || callerPhone,
          calledPhone: existingReg.calledPhone || calledPhone,
          businessId: existingReg.businessId,
          reason: 'INVALID_STREAM_CORRELATION_TOKEN',
        };
      }

      const configValidation = validateContractorConfiguration(existingReg.businessConfig);
      if (!configValidation.valid || !configValidation.config) {
        return {
          valid: false,
          streamSid,
          callSid,
          callerPhone: existingReg.callerPhone || callerPhone,
          calledPhone: existingReg.calledPhone || calledPhone,
          businessId: existingReg.businessId,
          reason: 'INVALID_CONTRACTOR_CONFIGURATION',
        };
      }
      existingReg.streamSid = streamSid;
      existingReg.callStatus = 'in-progress';
      this.streamByCallSid.set(callSid, streamSid);

      return {
        valid: true,
        streamSid,
        callSid,
        callerPhone: existingReg.callerPhone || callerPhone,
        calledPhone: existingReg.calledPhone || calledPhone,
        businessId: existingReg.businessId,
        businessConfig: configValidation.config,
      };
    }

    // 2. If webhook hit a separate instance (e.g. Vercel HTTP -> Railway WS),
    // resolve contractor server-side from the destination phone number (`calledPhone`).
    if (calledPhone) {
      const routeRes: InboundDestinationResolution = await resolveInboundDestinationRouteAsync(
        calledPhone
      );
      if (!routeRes.matched) {
        console.warn(
          `[CallSessionManager] Rejecting stream start for CallSid=${callSid}: destination number "${calledPhone}" is unassigned (${routeRes.reason}).`
        );
        return {
          valid: false,
          streamSid,
          callSid,
          callerPhone,
          calledPhone,
          reason: routeRes.reason,
        };
      }

      const configValidation = validateContractorConfiguration(routeRes.businessConfig);
      if (!configValidation.valid || !configValidation.config) {
        return {
          valid: false,
          streamSid,
          callSid,
          callerPhone,
          calledPhone,
          businessId: routeRes.businessId,
          reason: 'INVALID_CONTRACTOR_CONFIGURATION',
        };
      }

      // If correlationToken is supplied (or required in production cross-instance mode), verify HMAC
      if (correlationToken || process.env.NODE_ENV === 'production') {
        const tokenValid = verifyStreamCorrelationToken(correlationToken, {
          callSid,
          calledPhone,
          callerPhone: callerPhone || '',
          businessId: routeRes.businessId,
        });
        if (!tokenValid) {
          console.warn(
            `[CallSessionManager] Rejecting stream start for CallSid=${callSid}: failed HMAC stream correlation verification for contractor "${routeRes.businessId}".`
          );
          return {
            valid: false,
            streamSid,
            callSid,
            callerPhone,
            calledPhone,
            businessId: routeRes.businessId,
            reason: 'INVALID_STREAM_CORRELATION_TOKEN',
          };
        }
      }

      if (suppliedBusinessId && suppliedBusinessId !== routeRes.businessId) {
        console.warn(
          `[CallSessionManager] Ignoring unverified customParameters.businessId="${suppliedBusinessId}" on stream start; enforcing destination route businessId="${routeRes.businessId}".`
        );
      }

      this.streamByCallSid.set(callSid, streamSid);
      return {
        valid: true,
        streamSid,
        callSid,
        callerPhone,
        calledPhone,
        businessId: routeRes.businessId,
        businessConfig: configValidation.config,
      };
    }

    // 3. If no calledPhone was provided and strictDestinationCheck is enabled, reject
    if (params.strictDestinationCheck) {
      return {
        valid: false,
        streamSid,
        callSid,
        callerPhone,
        calledPhone,
        reason: 'MISSING_DESTINATION_NUMBER',
      };
    }

    // 4. Fallback for local simulation tests that send synthetic `start` events without `calledPhone`
    const fallbackTenant = resolveTelephonyTenant(null);
    this.streamByCallSid.set(callSid, streamSid);
    return {
      valid: true,
      streamSid,
      callSid,
      callerPhone,
      calledPhone,
      businessId: fallbackTenant.businessId,
      businessConfig: fallbackTenant.businessConfig,
    };
  }

  /**
   * Initializes a brand-new call session for an incoming Twilio Media Stream.
   * Ensures strict isolation between simultaneous calls and locks `businessId`
   * and `businessConfig` so the contractor can never be switched mid-call.
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

    // If a webhook registration exists for this callSid, always honor its locked contractor
    const registered = this.webhookRegistrations.get(params.callSid);
    const resolvedTenant = registered
      ? { businessId: registered.businessId, businessConfig: registered.businessConfig }
      : params.businessId && params.businessConfig
      ? { businessId: params.businessId, businessConfig: params.businessConfig }
      : resolveTelephonyTenant(params.calledPhone);

    const frozenConfig = Object.freeze({ ...resolvedTenant.businessConfig });
    const normalizedCallerPhone = normalizeCallerPhoneInput(params.callerPhone);

    const emptyCustomerInfo: CustomerInfo = {
      name: '',
      phone: normalizedCallerPhone || '',
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
      callerPhone: normalizedCallerPhone,
      calledPhone: params.calledPhone || null,
      businessId: resolvedTenant.businessId,
      businessConfig: frozenConfig,
      geminiSession: null,
      createdAt: now,
      lastActivityAt: now,
      ended: false,
      failed: false,
      twilioCallStatus: 'in-progress',
      securityViolations: 0,
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

    // Enforce mid-call contractor immutability at the runtime property descriptor level
    Object.defineProperty(session, 'businessId', {
      value: resolvedTenant.businessId,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(session, 'businessConfig', {
      value: frozenConfig,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(session, 'callSid', {
      value: params.callSid,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(session, 'streamSid', {
      value: params.streamSid,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    // Watchdog timer for max call duration cost protection
    session.durationTimer = setTimeout(() => {
      console.log(`[CallSessionManager] Max duration (${this.maxDurationSeconds}s) reached for call ${params.callSid}`);
      params.onDurationLimitReached?.(session);
      this.terminateSession(params.streamSid, 'Max duration limit reached');
    }, this.maxDurationSeconds * 1000);
    session.durationTimer.unref?.();

    this.sessionsByStream.set(params.streamSid, session);
    this.streamByCallSid.set(params.callSid, params.streamSid);

    if (registered) {
      registered.streamSid = params.streamSid;
      registered.callStatus = 'in-progress';
    }

    console.log(
      `[CallSessionManager] Created call session: ${sessionId} (CallSid: ${params.callSid}, StreamSid: ${params.streamSid}, Contractor: ${session.businessConfig.name} [${session.businessId}])`
    );
    return session;
  }

  /**
   * Explicitly prevents a call session from switching contractors mid-call.
   * Any attempt to reassign or override `businessId` during an active call is blocked and logged.
   */
  public attemptMidCallContractorSwitch(
    streamSid: string,
    candidateBusinessId: string
  ): {
    allowed: boolean;
    businessId: string;
    reason?: string;
  } {
    const session = this.sessionsByStream.get(streamSid);
    if (!session) {
      return {
        allowed: false,
        businessId: '',
        reason: 'SESSION_NOT_FOUND',
      };
    }

    if (!candidateBusinessId || candidateBusinessId === session.businessId) {
      return {
        allowed: true,
        businessId: session.businessId,
      };
    }

    session.securityViolations = (session.securityViolations || 0) + 1;
    console.error(
      `[CallSessionManager] SECURITY BLOCKED: Attempted mid-call contractor switch on StreamSid=${streamSid} (CallSid=${session.callSid}) from "${session.businessId}" to "${candidateBusinessId}".`
    );
    return {
      allowed: false,
      businessId: session.businessId,
      reason: 'MID_CALL_CONTRACTOR_SWITCH_FORBIDDEN',
    };
  }

  /**
   * Marks a call session or webhook registration as failed and records the failure reason clearly.
   */
  public markSessionFailure(
    streamSidOrCallSid: string,
    failureReason: string
  ): TelephonyCallSession | undefined {
    const session =
      this.sessionsByStream.get(streamSidOrCallSid) ||
      this.getSessionByCallSid(streamSidOrCallSid);

    const reg =
      this.webhookRegistrations.get(streamSidOrCallSid) ||
      (session ? this.webhookRegistrations.get(session.callSid) : undefined);

    if (reg) {
      reg.callStatus = 'failed';
      reg.failureReason = failureReason;
    }

    if (session) {
      session.failed = true;
      session.failureReason = failureReason;
      session.twilioCallStatus = 'failed';
      console.error(
        `[CallSessionManager] Call failure recorded for Session=${session.sessionId} (CallSid=${session.callSid}, Contractor=${session.businessId}): ${failureReason}`
      );
      return this.terminateSession(session.streamSid, `Call failure: ${failureReason}`);
    }

    console.error(
      `[CallSessionManager] Call failure recorded for CallSid=${streamSidOrCallSid}: ${failureReason}`
    );
    return undefined;
  }

  /**
   * Records a Twilio Call Status Callback (`queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed`, `no-answer`, `canceled`).
   */
  public recordCallStatusCallback(params: {
    callSid: string;
    callStatus: string;
    callDuration?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): {
    businessId: string | null;
    normalizedStatus: 'in_progress' | 'completed' | 'failed' | 'missed' | 'transferred';
    session?: TelephonyCallSession;
    registration?: WebhookCallRegistration;
  } {
    const rawStatus = (params.callStatus || '').toLowerCase().trim();
    let normalizedStatus: 'in_progress' | 'completed' | 'failed' | 'missed' | 'transferred' =
      'in_progress';

    if (rawStatus === 'completed') {
      normalizedStatus = 'completed';
    } else if (rawStatus === 'failed' || params.errorCode) {
      normalizedStatus = 'failed';
    } else if (rawStatus === 'busy' || rawStatus === 'no-answer' || rawStatus === 'canceled') {
      normalizedStatus = 'missed';
    } else {
      normalizedStatus = 'in_progress';
    }

    const reg = this.webhookRegistrations.get(params.callSid);
    const session = this.getSessionByCallSid(params.callSid);

    // Operational safeguard: If the session or webhook registration already failed (e.g. AI init failure or abnormal drop),
    // do not allow a subsequent Twilio 'completed' callback (after fallback <Say>) to overwrite the failed status.
    if (
      normalizedStatus === 'completed' &&
      (reg?.callStatus === 'failed' || session?.failed === true)
    ) {
      normalizedStatus = 'failed';
    }

    if (reg) {
      if (reg.callStatus !== 'failed') {
        reg.callStatus = rawStatus || normalizedStatus;
      }
      if (params.errorCode || params.errorMessage) {
        reg.failureReason = `Twilio Error ${params.errorCode || ''}: ${params.errorMessage || 'Call failed'}`.trim();
      }
    }

    if (session) {
      if (!session.failed) {
        session.twilioCallStatus = rawStatus || normalizedStatus;
      }
      if (normalizedStatus === 'failed' && !session.failed) {
        session.failed = true;
        session.failureReason =
          params.errorMessage ||
          (params.errorCode ? `Twilio Error ${params.errorCode}` : 'Twilio call status failed');
      }
      if (
        (normalizedStatus === 'completed' ||
          normalizedStatus === 'failed' ||
          normalizedStatus === 'missed') &&
        !session.ended
      ) {
        this.terminateSession(
          session.streamSid,
          `Twilio status callback: ${rawStatus || normalizedStatus}`
        );
      }
    }

    const businessId = session?.businessId || reg?.businessId || null;
    return {
      businessId,
      normalizedStatus,
      session,
      registration: reg,
    };
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

    console.log(`[CallSessionManager] Terminated session ${session.sessionId} (Duration: ${session.metrics.durationSeconds}s, Reason: ${reason})`);
    return session;
  }
}

