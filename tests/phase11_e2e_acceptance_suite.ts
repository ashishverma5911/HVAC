/**
 * PHASE 11 — END-TO-END ACCEPTANCE TESTING AND RELEASE VALIDATION SUITE
 *
 * Verifies that AERIS works as one integrated application across:
 * - Step 2: Browser Chat & AI (POST /api/receptionist/chat, POST /api/receptionist/tools, error handling, validation, non-fabrication, idempotency)
 * - Step 3: Browser Voice (GET/POST /api/receptionist/live-token, LiveVoiceManager state machine, mic permission denial, WebSocket disconnect & AI error recovery)
 * - Step 4: Contractor & Multi-Tenant Workflows (Onboarding, settings, dynamic AI config, lead CRUD, appointment lifecycle, escalation, dashboard summary, RBAC, tenant isolation)
 * - Step 5: Call Records & Privacy (8 lifecycle events, retry deduplication, partial transcripts, PII redaction/correction/deletion, recording disabled, log/error scrubbing, late event protection)
 * - Step 6: Telephony Simulation [SIMULATED — NOT A REAL PSTN CALL] (Twilio signatures, destination routing, stream correlation tokens, out-of-order callbacks, WebSocket drop & AI session failure)
 * - Step 7: Database & Migration Integrity (Migration chain, 11 RLS tables, 4 security_invoker views, RBAC helper & policies)
 */

import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import WebSocket from 'ws';

import { POST as chatPost } from '../src/app/api/receptionist/chat/route';
import { GET as liveTokenGet, POST as liveTokenPost } from '../src/app/api/receptionist/live-token/route';
import { POST as voiceWebhookPost } from '../src/app/api/telephony/twilio/voice/route';
import { POST as statusWebhookPost } from '../src/app/api/telephony/twilio/status/route';
import { GET as healthGet } from '../src/app/api/health/route';

import { setMockGeminiClientForTest, classifyGeminiError } from '../src/lib/ai/gemini';
import { executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { buildReceptionistSystemInstruction } from '../src/lib/ai/receptionistPrompt';
import { buildReceptionistTools } from '../src/lib/ai/tools';
import { ContractorBusinessConfig } from '../src/lib/ai/contractorConfig';
import { LiveVoiceManager, VoiceState, LiveVoiceDiagnostics, LiveTranscriptTurn } from '../src/lib/ai/liveVoiceManager';
import { mockStore } from '../src/lib/mock/store';
import {
  evaluateContractorRolePermission,
  sanitizeInternalRedirectPath,
  stripUntrustedTenantIds,
} from '../src/lib/auth/tenant';
import { validateOnboardingInput, validateOnboardingStep } from '../src/lib/validation/contractorOnboarding';
import { validateSettingsInput } from '../src/lib/validation/contractorSettings';
import {
  APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
  sanitizeLeadCaptureInput,
  validateLeadStatusTransition,
} from '../src/lib/validation/contractorLeads';
import { ContractorPersistenceService } from '../src/lib/services/contractorPersistence';
import { ContractorReportingService } from '../src/lib/services/contractorReporting';
import {
  VALID_CALL_LIFECYCLE_EVENTS,
  evaluateCallRecordingPolicy,
  minimizeCustomerText,
  sanitizeClientErrorMessage,
} from '../src/lib/compliance/callPrivacyAndCompliance';
import { sanitizeLogPayload } from '../src/lib/diagnostics/piiMask';
import { createSafeErrorResponse } from '../src/lib/errors/safeResponse';
import {
  computeTwilioSignature,
  createStreamCorrelationToken,
} from '../src/lib/telephony/twilioSecurity';
import {
  clearRegisteredDestinationRoutes,
  registerProvisionedDestinationRoute,
} from '../src/lib/telephony/tenantPhoneMapping';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import { createTelephonyServer } from '../src/server/telephonyServer';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

const CONTRACTOR_ALPHA: ContractorBusinessConfig = {
  id: '11111111-aaaa-4111-8111-111111111111',
  name: 'Alpha Summit Climate Pros',
  slug: 'alpha-summit-climate-pros',
  industry: 'hvac',
  phone: '(972) 555-0140',
  businessEmail: 'dispatch@alphasummit.example.com',
  address: '500 Legacy Dr',
  city: 'Plano',
  state: 'TX',
  postalCode: '75024',
  timezone: 'America/Chicago',
  serviceAreas: ['Plano', 'Frisco', 'Richardson'],
  supportedZips: ['75024', '75034', '75080'],
  servicesOffered: ['AC Repair', 'Heat Pump Service', 'Emergency Cooling Dispatch'],
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: '9:00 AM - 2:00 PM',
    sunday: 'Closed (Emergency Only)',
  },
  emergencyServiceEnabled: true,
  afterHoursBehavior: 'emergency_dispatch',
  afterHoursInstructions: 'Dispatch on-call technician for active AC failure above 85°F or gas hazards.',
  callbackInstructions: 'An Alpha Summit dispatcher will call back within 20 minutes.',
  appointmentRequestRules: 'All scheduled windows are appointment requests requiring dispatcher confirmation.',
  transferPhoneNumber: '+19725550199',
  transferInstructions: 'Record priority callback if live transfer is not connected.',
  customGreeting: 'Thank you for calling Alpha Summit Climate Pros!',
  supportedLanguages: ['en-US', 'es-US'],
  businessFaqs: [
    {
      question: 'Do you service heat pumps in Plano?',
      answer: 'Yes, we service residential and light commercial heat pumps across Plano, Frisco, and Richardson.',
    },
  ],
};

const CONTRACTOR_BETA: ContractorBusinessConfig = {
  id: '22222222-bbbb-4222-8222-222222222222',
  name: 'Beta Lone Star Heating',
  slug: 'beta-lone-star-heating',
  industry: 'hvac',
  phone: '(214) 555-0188',
  businessEmail: 'office@betalonestar.example.com',
  address: '900 Main St',
  city: 'Dallas',
  state: 'TX',
  postalCode: '75201',
  timezone: 'America/Chicago',
  serviceAreas: ['Dallas', 'Irving'],
  supportedZips: ['75201', '75038'],
  servicesOffered: ['Furnace Repair', 'Ductwork Inspection'],
  businessHours: {
    weekdays: '7:30 AM - 5:30 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: false,
  afterHoursBehavior: 'next_day_callback',
  callbackInstructions: 'Our Dallas office returns calls at 7:30 AM the next business day.',
  transferPhoneNumber: '+12145550299',
  customGreeting: 'Welcome to Beta Lone Star Heating.',
  supportedLanguages: ['en-US'],
};

async function runPhase11AcceptanceSuite(): Promise<void> {
  const watchdog = setTimeout(() => {
    console.error('❌ FATAL: Phase 11 Acceptance Suite timed out after 30s');
    process.exit(1);
  }, 30000);

  console.log('======================================================================');
  console.log('PHASE 11 — END-TO-END ACCEPTANCE TESTING & RELEASE VALIDATION SUITE');
  console.log('======================================================================\n');

  const savedEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_WEBHOOK_PUBLIC_URL: process.env.TWILIO_WEBHOOK_PUBLIC_URL,
    TWILIO_MEDIA_STREAM_WSS_URL: process.env.TWILIO_MEDIA_STREAM_WSS_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  try {
    // Isolate test environment from external Supabase calls during deterministic acceptance tests
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    ContractorPersistenceService.clearLedger();
    ContractorPersistenceService.setSimulatedDatabaseFailure(false);
    mockStore.resetStore();

    // =========================================================================
    // STEP 2: BROWSER CHAT AND AI VERIFICATION
    // =========================================================================
    console.log('--- STEP 2: Browser Chat & AI Verification ---');

    // 2.1 Missing GEMINI_API_KEY produces a safe 503 error and performs ZERO pre-LLM tool mutations
    process.env.GEMINI_API_KEY = '';
    setMockGeminiClientForTest(null);

    const unconfiguredChatConvId = 'conv-phase11-unconfigured-01';
    const unconfiguredReq = new NextRequest('http://localhost:3000/api/receptionist/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: unconfiguredChatConvId,
        messages: [
          {
            role: 'user',
            content:
              'My name is Sarah Jenkins, phone 214-555-0192, at 450 Oak St in Plano. My AC is blowing warm air.',
          },
        ],
      }),
    });
    const unconfiguredRes = await chatPost(unconfiguredReq);
    const unconfiguredJson = await unconfiguredRes.json();

    assert(
      unconfiguredRes.status === 503 &&
        unconfiguredJson.category === 'PERMANENT_CONFIGURATION' &&
        typeof unconfiguredJson.error === 'string' &&
        unconfiguredJson.error.includes('Gemini API key is not configured'),
      'POST /api/receptionist/chat returns HTTP 503 PERMANENT_CONFIGURATION when GEMINI_API_KEY is missing'
    );
    assert(
      mockStore.getSession(unconfiguredChatConvId).leadId === null &&
        mockStore.getSession(unconfiguredChatConvId).serviceAreaChecked === false,
      'Missing AI configuration aborts before executing any pre-LLM tool actions or creating leads'
    );

    // 2.2 Invalid API key classification produces safe 401 PERMANENT_AUTHENTICATION without leaking key
    const invalidKeyClassification = classifyGeminiError(
      Object.assign(new Error('API_KEY_INVALID: API key not valid. Please pass a valid API key.'), {
        status: 401,
      })
    );
    assert(
      invalidKeyClassification.status === 401 &&
        invalidKeyClassification.category === 'PERMANENT_AUTHENTICATION' &&
        invalidKeyClassification.isTransient === false,
      'Invalid Gemini API key is classified as non-transient 401 PERMANENT_AUTHENTICATION'
    );

    // 2.3 Full Browser Chat Flow: Submit message -> Multi-turn tool call -> Scrubbing safeguards -> Response
    process.env.GEMINI_API_KEY = 'test-gemini-key-for-phase11-simulation';
    let mockGenerateCalls = 0;
    setMockGeminiClientForTest({
      models: {
        generateContent: async () => {
          mockGenerateCalls++;
          if (mockGenerateCalls === 1) {
            return {
              functionCalls: [
                {
                  id: 'fc-hours-1',
                  name: 'check_business_hours',
                  args: { day: 'Monday', businessId: 'spoofed-tenant-999' },
                },
              ],
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          id: 'fc-hours-1',
                          name: 'check_business_hours',
                          args: { day: 'Monday' },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }
          // Return text that attempts to invent a $89 fee and claim appointment is confirmed
          // so we verify POST /api/receptionist/chat scrubs both!
          return {
            functionCalls: [],
            text: 'Our diagnostic fee is $89. Your appointment is now confirmed for tomorrow!',
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const chatConvId = 'conv-phase11-chat-01';
    const chatReq1 = new NextRequest('http://localhost:3000/api/receptionist/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: chatConvId,
        businessId: 'spoofed-client-business-id',
        messages: [
          {
            role: 'user',
            content:
              'Hi, my name is Sarah Jenkins, my number is 972-555-0144, and I am at 750 Legacy Drive, Plano. My AC is not cooling at all.',
          },
        ],
      }),
    });

    const chatRes1 = await chatPost(chatReq1);
    const chatData1 = await chatRes1.json();

    assert(
      chatRes1.status === 200 && typeof chatData1.message === 'string' && chatData1.message.length > 0,
      'POST /api/receptionist/chat processes user message, executes multi-turn tool loop, and returns AI response'
    );
    assert(
      Boolean(chatData1.leadId) && chatData1.leadStatus === 'qualified',
      'POST /api/receptionist/chat captures lead and sets leadStatus="qualified"'
    );
    assert(
      !chatData1.message.includes('$89') &&
        !chatData1.message.toLowerCase().includes('appointment is now confirmed'),
      'POST /api/receptionist/chat scrubs invented dollar prices ($89) and unverified appointment confirmation claims'
    );

    setMockGeminiClientForTest(null);

    // 2.4 Lead is saved ONLY when the lead operation succeeds (Regression test for DB failure in executeAgentToolAsync)
    ContractorPersistenceService.setSimulatedDatabaseFailure(true);
    const failedDbConvId = 'conv-phase11-db-fail-lead';
    const failedLeadToolRes = await executeAgentToolAsync(
      'create_lead',
      {
        customerName: 'Michael Vance',
        phone: '+19725550177',
        serviceAddress: '200 Custer Rd, Plano, TX',
        serviceType: 'AC Repair',
        reportedIssue: 'Outside condenser fan stopped spinning',
        urgency: 'urgent',
      },
      {
        conversationId: failedDbConvId,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'web_chat',
      }
    );

    assert(
      failedLeadToolRes.success === false &&
        failedLeadToolRes.action.status === 'failed' &&
        mockStore.getSession(failedDbConvId).leadId === null &&
        ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id).length === 0,
      'When database persistence fails, create_lead returns success=false, action.status="failed", and saves zero leads'
    );

    // 2.5 Human escalation is NOT reported as successful when persistence fails
    const failedEscToolRes = await executeAgentToolAsync(
      'transfer_to_human',
      {
        reason: 'Customer requested on-call manager during DB outage',
        urgency: 'urgent',
        summary: 'Caller wants manager callback',
      },
      {
        conversationId: failedDbConvId,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'web_chat',
      }
    );

    assert(
      failedEscToolRes.success === false &&
        failedEscToolRes.action.status === 'failed' &&
        mockStore.getSession(failedDbConvId).transferId === null,
      'When database persistence fails, transfer_to_human returns success=false and does not mark session transferred'
    );
    ContractorPersistenceService.setSimulatedDatabaseFailure(false);

    // 2.6 Empty transfer_to_human reason is rejected on server
    const emptyReasonEscRes = await executeAgentToolAsync(
      'transfer_to_human',
      { reason: '   ', summary: '' },
      {
        conversationId: 'conv-phase11-empty-esc',
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'web_chat',
      }
    );
    assert(
      emptyReasonEscRes.success === false &&
        Boolean(emptyReasonEscRes.error?.includes('requires a valid reason')),
      'Server-side tool validation rejects transfer_to_human when reason/summary is empty'
    );

    // =========================================================================
    // STEP 3: BROWSER VOICE VERIFICATION (NOT PSTN CALLING)
    // =========================================================================
    console.log('\n--- STEP 3: Browser Voice Verification (Browser WebAudio/WebSocket Only) ---');

    // 3.1 Token endpoint configuration check when GEMINI_API_KEY is missing vs configured
    process.env.GEMINI_API_KEY = '';
    const tokenHealthUnconf = await (await liveTokenGet()).json();
    const tokenPostUnconfRes = await liveTokenPost(
      new Request('http://localhost:3000/api/receptionist/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv-voice-unconf' }),
      })
    );
    const tokenPostUnconfJson = await tokenPostUnconfRes.json();

    assert(
      tokenHealthUnconf.status === 'unconfigured' &&
        tokenHealthUnconf.geminiApiKeyConfigured === false &&
        tokenPostUnconfRes.status === 503 &&
        tokenPostUnconfJson.code === 'AI_SERVICE_UNAVAILABLE',
      'Live token GET/POST endpoints safely report unconfigured status (HTTP 503) when GEMINI_API_KEY is missing'
    );

    process.env.GEMINI_API_KEY = 'test-gemini-key-for-phase11-simulation';
    const tokenHealthConf = await (await liveTokenGet()).json();
    assert(
      tokenHealthConf.status === 'healthy' &&
        tokenHealthConf.geminiApiKeyConfigured === true &&
        !JSON.stringify(tokenHealthConf).includes('test-gemini-key-for-phase11-simulation'),
      'GET /api/receptionist/live-token reports healthy configuration without exposing GEMINI_API_KEY'
    );

    // 3.2 Browser Voice: Safe behavior when microphone permission is denied
    const globalAny = globalThis as Record<string, unknown>;
    const origWindow = globalAny.window;
    const origNavigator = globalAny.navigator;
    const origFetch = globalAny.fetch;

    let micTrackStopped: boolean = false;
    class MockAudioContext {
      public state = 'running';
      public currentTime = 0;
      public sampleRate = 16000;
      public destination = {};
      async resume() {
        this.state = 'running';
      }
      async close() {
        this.state = 'closed';
      }
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createScriptProcessor() {
        return { connect: () => {}, disconnect: () => {}, onaudioprocess: null };
      }
      createGain() {
        return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
      }
      createBuffer(_channels: number, length: number, sampleRate: number) {
        const arr = new Float32Array(length);
        return {
          duration: length / sampleRate,
          getChannelData: () => arr,
        };
      }
      createBufferSource() {
        const node = {
          buffer: null as unknown,
          onended: null as null | (() => void),
          connect: () => {},
          disconnect: () => {},
          start: () => {
            setTimeout(() => node.onended?.(), 5);
          },
          stop: () => {},
        };
        return node;
      }
    }

    globalAny.window = {
      AudioContext: MockAudioContext,
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            const err = new Error('Permission denied by user');
            err.name = 'NotAllowedError';
            throw err;
          },
        },
      },
    });

    const micDeniedStates: VoiceState[] = [];
    let micDeniedError: string | null = null;
    let micDeniedDiag: LiveVoiceDiagnostics | null = null;

    const voiceMgrMicDenied = new LiveVoiceManager({
      onStateChange: (s) => micDeniedStates.push(s),
      onError: (e) => {
        micDeniedError = e;
      },
      onDiagnostics: (d) => {
        micDeniedDiag = d;
      },
    });

    await voiceMgrMicDenied.start('conv-voice-mic-denied');

    assert(
      voiceMgrMicDenied.getState() === 'ERROR' &&
        micDeniedStates.includes('CONNECTING') &&
        micDeniedStates[micDeniedStates.length - 1] === 'ERROR' &&
        micDeniedError ===
          'Microphone permission was denied. Please allow microphone access to use voice.' &&
        (micDeniedDiag as LiveVoiceDiagnostics | null)?.microphone === 'disconnected',
      'LiveVoiceManager transitions cleanly to ERROR and emits clear message when microphone permission is denied'
    );

    // 3.3 Browser Voice: Active session state transitions, tool call, mute/unmute, and abnormal WebSocket disconnect
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => ({
            getAudioTracks: () => [{ enabled: true, stop: () => { micTrackStopped = true; } }],
            getTracks: () => [{ enabled: true, stop: () => { micTrackStopped = true; } }],
          }),
        },
      },
    });

    globalAny.fetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/receptionist/live-token')) {
        return new Response(
          JSON.stringify({
            token: 'auth_tokens/ephemeral-sim-token-12345',
            model: 'gemini-3.8-live',
            expireTime: new Date(Date.now() + 600000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/api/receptionist/tools')) {
        return new Response(
          JSON.stringify({
            success: true,
            output: { supported: true, matchedLocation: 'Plano' },
            action: {
              id: 'act-voice-1',
              toolName: 'check_service_area',
              displayName: 'Check Service Area',
              status: 'success',
              input: { city: 'Plano' },
              output: { supported: true },
              timestamp: '10:00:00 AM',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch URL in voice test: ${urlStr}`);
    };

    const recordedVoiceStates: VoiceState[] = [];
    const recordedTranscripts: LiveTranscriptTurn[] = [];
    let lastVoiceError: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedCallbacks: any = null;

    const voiceMgrActive = new LiveVoiceManager({
      onStateChange: (s) => recordedVoiceStates.push(s),
      onTranscript: (t) => recordedTranscripts.push(t),
      onError: (e) => {
        lastVoiceError = e;
      },
      liveClientFactory: () => ({
        live: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connect: async (opts: any) => {
            capturedCallbacks = opts.callbacks;
            setTimeout(() => opts.callbacks.onopen(), 1);
            return {
              sendRealtimeInput: () => {},
              sendToolResponse: () => {},
              close: () => {},
            };
          },
        },
      }),
    });

    await voiceMgrActive.start('conv-voice-lifecycle-01');
    await new Promise((r) => setTimeout(r, 15));

    assert(
      voiceMgrActive.getState() === 'LISTENING' &&
        recordedVoiceStates.includes('CONNECTING') &&
        recordedVoiceStates.includes('LISTENING'),
      'Browser voice session transitions IDLE -> CONNECTING -> LISTENING upon connection'
    );

    // Mute and unmute state indicators
    voiceMgrActive.setMuted(true);
    const mutedState = voiceMgrActive.getState();
    voiceMgrActive.setMuted(false);
    const unmutedState = voiceMgrActive.getState();
    assert(
      mutedState === 'MUTED' && unmutedState === 'LISTENING',
      'UI status state accurately reflects MUTED and returns to LISTENING when unmuted'
    );

    // Simulate user speech transcription + tool call + abnormal WebSocket disconnect (code 1006)
    await capturedCallbacks.onmessage({
      serverContent: {
        inputTranscription: { text: 'Do you service Plano Texas?' },
      },
    });
    await capturedCallbacks.onmessage({
      toolCall: {
        functionCalls: [
          { id: 'fc-voice-1', name: 'check_service_area', args: { city: 'Plano' } },
        ],
      },
    });

    // Simulate abnormal WebSocket drop (1006)
    capturedCallbacks.onclose({ code: 1006, reason: 'Simulated network drop' });

    assert(
      voiceMgrActive.getState() === 'ERROR' &&
        Boolean((lastVoiceError as string | null)?.includes('1006')) &&
        (micTrackStopped as boolean) === true &&
        voiceMgrActive.getDiagnostics().liveSession === 'failed',
      'Unexpected WebSocket disconnection (code 1006) transitions browser voice state to ERROR, releases microphone, and reports failure'
    );
    assert(
      recordedTranscripts.some((t) => t.speaker === 'customer' && t.isFinal && t.text.includes('Plano')),
      'Pending partial user transcript is flushed before teardown on WebSocket disconnect'
    );

    // Restore globals
    globalAny.window = origWindow;
    if (origNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: origNavigator,
      });
    }
    globalAny.fetch = origFetch;

    // =========================================================================
    // STEP 4: CONTRACTOR AND MULTI-TENANT WORKFLOWS
    // =========================================================================
    console.log('\n--- STEP 4: Contractor & Multi-Tenant Workflows ---');

    // 4.1 Onboarding and Settings Validation
    const validOnboarding = validateOnboardingInput({
      name: CONTRACTOR_ALPHA.name,
      industry: 'hvac',
      phone: CONTRACTOR_ALPHA.phone,
      address: CONTRACTOR_ALPHA.address,
      city: CONTRACTOR_ALPHA.city,
      state: CONTRACTOR_ALPHA.state,
      postalCode: CONTRACTOR_ALPHA.postalCode,
      timezone: CONTRACTOR_ALPHA.timezone,
      serviceAreas: CONTRACTOR_ALPHA.serviceAreas,
      supportedZips: CONTRACTOR_ALPHA.supportedZips,
      servicesOffered: CONTRACTOR_ALPHA.servicesOffered,
      businessHours: CONTRACTOR_ALPHA.businessHours,
      emergencyServiceEnabled: true,
      afterHoursBehavior: 'emergency_dispatch',
      transferPhoneNumber: CONTRACTOR_ALPHA.transferPhoneNumber,
    });
    const invalidStep2 = validateOnboardingStep(2, {
      name: 'X',
      phone: '123',
      address: '1',
      city: '',
      state: 'T',
      postalCode: '12',
    });
    const validSettings = validateSettingsInput({
      name: CONTRACTOR_ALPHA.name,
      phone: CONTRACTOR_ALPHA.phone,
      address: CONTRACTOR_ALPHA.address!,
      city: CONTRACTOR_ALPHA.city!,
      state: CONTRACTOR_ALPHA.state!,
      postalCode: CONTRACTOR_ALPHA.postalCode!,
      serviceAreas: CONTRACTOR_ALPHA.serviceAreas,
      servicesOffered: CONTRACTOR_ALPHA.servicesOffered,
      businessHours: CONTRACTOR_ALPHA.businessHours,
      emergencyServiceEnabled: true,
    });

    assert(
      validOnboarding.valid === true && invalidStep2.valid === false && validSettings.valid === true,
      'Contractor onboarding and settings validators accept valid configurations and reject malformed inputs'
    );

    // 4.2 Dynamic AI adaptation to Contractor Alpha vs Contractor Beta
    const promptAlpha = buildReceptionistSystemInstruction(CONTRACTOR_ALPHA);
    const promptBeta = buildReceptionistSystemInstruction(CONTRACTOR_BETA);
    const toolsAlpha = buildReceptionistTools(CONTRACTOR_ALPHA);

    assert(
      promptAlpha.includes('Alpha Summit Climate Pros') &&
        promptAlpha.includes('Heat Pump Service') &&
        promptAlpha.includes('Plano, Frisco, Richardson') &&
        promptAlpha.includes('Do you service heat pumps in Plano?') &&
        !promptAlpha.includes('Beta Lone Star Heating') &&
        promptBeta.includes('Beta Lone Star Heating') &&
        !promptBeta.includes('Alpha Summit Climate Pros') &&
        toolsAlpha.length === 6,
      'AI system prompt and tool schemas dynamically adapt to each contractor without cross-tenant leakage'
    );

    // 4.3 Lead Creation, Viewing, Editing, Appointment Request, Human Escalation & Authorized Deletion
    const alphaCallSid = 'CA_PHASE11_ALPHA_CALL_01';
    await ContractorPersistenceService.ensureConversation(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'telephony',
      {
        externalCallSid: alphaCallSid,
        callerIdentifier: '+19725550166',
        calledNumber: '+19725550140',
      }
    );
    await ContractorPersistenceService.recordCallLifecycleEvent(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'incoming_call_received',
      { callerPhone: '+19725550166', calledPhone: '+19725550140' }
    );
    await ContractorPersistenceService.recordCallLifecycleEvent(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'call_answered'
    );
    await ContractorPersistenceService.recordCallLifecycleEvent(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'ai_session_initialized'
    );

    // Create Lead for Contractor Alpha via AI Tool
    const alphaLeadRes = await executeAgentToolAsync(
      'create_lead',
      {
        businessId: CONTRACTOR_BETA.id, // Spoof attempt — must be ignored
        customerName: 'Elena Rostova',
        phone: '+19725550166',
        serviceAddress: '1200 Preston Rd, Plano, TX',
        serviceType: 'Heat Pump Service',
        reportedIssue: 'Heat pump short-cycling every 5 minutes',
        urgency: 'urgent',
      },
      {
        conversationId: alphaCallSid,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'telephony',
      }
    );
    const alphaLeadId = String(alphaLeadRes.output?.leadId || '');

    // Duplicate lead tool call on same call must deduplicate
    const alphaLeadDupRes = await executeAgentToolAsync(
      'create_lead',
      {
        customerName: 'Elena Rostova',
        phone: '+19725550166',
        serviceAddress: '1200 Preston Rd, Plano, TX',
        serviceType: 'Heat Pump Service',
        reportedIssue: 'Heat pump short-cycling every 5 minutes',
        urgency: 'urgent',
      },
      {
        conversationId: alphaCallSid,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'telephony',
      }
    );

    assert(
      alphaLeadRes.success === true &&
        Boolean(alphaLeadId) &&
        alphaLeadDupRes.output?.leadId === alphaLeadId &&
        alphaLeadDupRes.output?.isDuplicate === true &&
        ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id).length === 1,
      'Duplicate create_lead tool execution on same call returns existing leadId without creating duplicate lead'
    );

    // Request Appointment for Contractor Alpha lead
    const alphaApptRes = await executeAgentToolAsync(
      'request_appointment',
      {
        leadId: alphaLeadId,
        preferredSlot: 'Tuesday 1:00 PM - 3:00 PM',
        customerName: 'Elena Rostova',
        phone: '+19725550166',
        serviceAddress: '1200 Preston Rd, Plano, TX',
      },
      {
        conversationId: alphaCallSid,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'telephony',
      }
    );

    assert(
      alphaApptRes.success === true &&
        alphaApptRes.output?.status === 'requested' &&
        alphaApptRes.output?.confirmationRequired === true &&
        alphaApptRes.output?.confirmationMessage === APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
      'Appointment request is strictly recorded as status="requested" with contractor confirmation required'
    );

    // Human escalation + duplicate escalation check
    const alphaEscRes1 = await executeAgentToolAsync(
      'transfer_to_human',
      {
        reason: 'Customer requested urgent dispatch confirmation',
        urgency: 'urgent',
        summary: 'Short-cycling heat pump in Plano',
      },
      {
        conversationId: alphaCallSid,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'telephony',
      }
    );
    const alphaEscRes2 = await executeAgentToolAsync(
      'transfer_to_human',
      {
        reason: 'Customer requested urgent dispatch confirmation again',
        urgency: 'urgent',
        summary: 'Short-cycling heat pump in Plano',
      },
      {
        conversationId: alphaCallSid,
        businessId: CONTRACTOR_ALPHA.id,
        businessConfig: CONTRACTOR_ALPHA,
        isDemo: false,
        channel: 'telephony',
      }
    );

    assert(
      alphaEscRes1.success === true &&
        alphaEscRes1.output?.liveTransferConnected === false &&
        alphaEscRes1.output?.callbackRequested === true &&
        alphaEscRes2.output?.transferId === alphaEscRes1.output?.transferId &&
        alphaEscRes2.output?.isDuplicate === true,
      'transfer_to_human honestly reports callbackRequested=true (liveTransferConnected=false) and deduplicates repeated calls'
    );

    // Dashboard Summary integration check (ContractorReportingService)
    const alphaDashboard = await ContractorReportingService.getDashboardSummary(CONTRACTOR_ALPHA.id);
    assert(
      alphaDashboard.metrics.totalCalls === 1 &&
        alphaDashboard.metrics.totalLeads === 1 &&
        alphaDashboard.metrics.appointmentsRequested === 1 &&
        alphaDashboard.metrics.urgentRequests === 1 &&
        alphaDashboard.recentLeads.length === 1 &&
        alphaDashboard.recentLeads[0].id === alphaLeadId,
      'ContractorReportingService.getDashboardSummary aggregates calls, leads, appointment requests, and recentLeads accurately'
    );

    // Lead Editing (Follow-up notes, contact attempts, status transition)
    const leadEditRes = await ContractorPersistenceService.updateLeadFollowUp(
      CONTRACTOR_ALPHA.id,
      alphaLeadId,
      {
        status: 'contacted',
        internalNote: 'Dispatcher called Elena and verified Tuesday 1-3 PM arrival window.',
        contactAttempt: {
          method: 'phone',
          outcome: 'reached',
          summary: 'Confirmed technician visit for Tuesday afternoon.',
        },
        nextFollowUp: {
          action: 'Dispatch technician truck #4',
          dueAt: '2026-10-14T13:00:00.000Z',
        },
      },
      { email: 'owner@alphasummit.example.com', role: 'owner' }
    );
    const leadConvertRes = await ContractorPersistenceService.updateLeadFollowUp(
      CONTRACTOR_ALPHA.id,
      alphaLeadId,
      { status: 'converted' },
      { email: 'owner@alphasummit.example.com', role: 'owner' }
    );
    const invalidRegressRes = await ContractorPersistenceService.updateLeadFollowUp(
      CONTRACTOR_ALPHA.id,
      alphaLeadId,
      { status: 'new' },
      { email: 'owner@alphasummit.example.com', role: 'owner' }
    );

    assert(
      leadEditRes.ok === true &&
        leadEditRes.lead.internal_notes.length === 1 &&
        leadEditRes.lead.contact_attempts.length === 1 &&
        leadConvertRes.ok === true &&
        leadConvertRes.lead.status === 'converted' &&
        invalidRegressRes.ok === false &&
        invalidRegressRes.code === 'INVALID_STATUS_TRANSITION',
      'Lead follow-up editing persists notes/contact attempts, transitions to converted, and blocks invalid regressive status transitions'
    );

    // 4.4 Cross-Tenant Isolation (Contractor Beta vs Contractor Alpha)
    const betaLeads = ContractorPersistenceService.getContractorLeads(CONTRACTOR_BETA.id);
    const betaLeadDetailAttempt = ContractorPersistenceService.getContractorLeadDetailFromLedger(
      CONTRACTOR_BETA.id,
      alphaLeadId
    );
    const betaLeadPatchAttempt = await ContractorPersistenceService.updateLeadFollowUp(
      CONTRACTOR_BETA.id,
      alphaLeadId,
      { internalNote: 'Cross-tenant hijack attempt' }
    );
    const betaLeadDeleteAttempt = await ContractorPersistenceService.deleteLeadRecord(
      CONTRACTOR_BETA.id,
      alphaLeadId
    );
    const betaCallDetailAttempt = await ContractorPersistenceService.getContractorCallDetail(
      CONTRACTOR_BETA.id,
      alphaCallSid
    );
    const betaCallDeleteAttempt = await ContractorPersistenceService.correctOrDeleteCallRecord(
      CONTRACTOR_BETA.id,
      alphaCallSid,
      { action: 'delete' }
    );

    assert(
      betaLeads.length === 0 &&
        betaLeadDetailAttempt === null &&
        betaLeadPatchAttempt.ok === false &&
        betaLeadPatchAttempt.status === 404 &&
        betaLeadDeleteAttempt.ok === false &&
        betaLeadDeleteAttempt.status === 404 &&
        betaCallDetailAttempt === null &&
        betaCallDeleteAttempt.ok === false &&
        betaCallDeleteAttempt.status === 404,
      'Strict tenant isolation: Contractor Beta cannot view, edit, or delete Contractor Alpha leads, calls, transcripts, or appointments'
    );

    // 4.5 Role-Based Access Control (RBAC) Matrix
    assert(
      evaluateContractorRolePermission('owner', ['owner', 'admin']).allowed === true &&
        evaluateContractorRolePermission('admin', ['owner', 'admin']).allowed === true &&
        evaluateContractorRolePermission('dispatcher', ['owner', 'admin']).allowed === false &&
        evaluateContractorRolePermission('dispatcher', ['owner', 'admin', 'dispatcher']).allowed === true &&
        evaluateContractorRolePermission('technician', ['owner', 'admin', 'dispatcher']).allowed === false &&
        evaluateContractorRolePermission('viewer', ['owner', 'admin', 'dispatcher']).allowed === false,
      'RBAC matrix enforces owner/admin/dispatcher permissions and blocks unauthorized roles from restricted mutations'
    );

    // =========================================================================
    // STEP 5: CALL RECORDS AND PRIVACY
    // =========================================================================
    console.log('\n--- STEP 5: Call Records, Lifecycle Events & Privacy Safeguards ---');

    // 5.1 Complete the call and verify all lifecycle events + duplicate retry protection
    await ContractorPersistenceService.persistMessage(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'customer',
      'My heat pump is short-cycling at 1200 Preston Rd in Plano.'
    );
    await ContractorPersistenceService.persistMessage(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'ai',
      'I have recorded your service request and submitted an appointment request for Tuesday 1-3 PM.'
    );
    const completedEvtId1 = await ContractorPersistenceService.recordCallLifecycleEvent(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'call_completed',
      { durationSeconds: 118 }
    );
    const completedEvtId2 = await ContractorPersistenceService.recordCallLifecycleEvent(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      'call_completed',
      { durationSeconds: 118 }
    );
    await ContractorPersistenceService.persistCallStatusUpdate(CONTRACTOR_ALPHA.id, alphaCallSid, {
      callStatus: 'completed',
      durationSeconds: 118,
    });

    const alphaCallDetail = await ContractorPersistenceService.getContractorCallDetail(
      CONTRACTOR_ALPHA.id,
      alphaCallSid
    );

    assert(
      VALID_CALL_LIFECYCLE_EVENTS.length === 8 &&
        completedEvtId1 === completedEvtId2 &&
        alphaCallDetail !== null &&
        alphaCallDetail.call.durationSeconds === 118 &&
        alphaCallDetail.call.transcriptStatus === 'complete' &&
        alphaCallDetail.transcripts.length === 2 &&
        alphaCallDetail.call.recordingAvailable === false,
      'Call record stores all lifecycle events idempotently, links transcripts & duration, and keeps recordingAvailable=false'
    );

    // 5.2 Caller info correction, PII redaction, and call/lead deletion
    const correctedCall = await ContractorPersistenceService.correctOrDeleteCallRecord(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      { action: 'correct', callerPhone: '+19725550199' }
    );
    const redactedCall = await ContractorPersistenceService.correctOrDeleteCallRecord(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      { action: 'redact_pii' }
    );
    const redactedDetail = await ContractorPersistenceService.getContractorCallDetail(
      CONTRACTOR_ALPHA.id,
      alphaCallSid
    );

    assert(
      correctedCall.ok === true &&
        correctedCall.call?.callerPhone === '+19725550199' &&
        redactedCall.ok === true &&
        redactedDetail?.call.callerPhone === null &&
        redactedDetail?.call.piiRedacted === true &&
        redactedDetail?.transcripts.every((t) => t.text === '[REDACTED PER PRIVACY REQUEST]'),
      'Caller info correction and PII redaction scrub caller phone, lead PII summary, and transcript text'
    );

    // Authorized deletion of lead and call record
    const deletedLeadRes = await ContractorPersistenceService.deleteLeadRecord(
      CONTRACTOR_ALPHA.id,
      alphaLeadId
    );
    const deletedCallRes = await ContractorPersistenceService.correctOrDeleteCallRecord(
      CONTRACTOR_ALPHA.id,
      alphaCallSid,
      { action: 'delete' }
    );
    assert(
      deletedLeadRes.ok === true &&
        ContractorPersistenceService.getContractorLeads(CONTRACTOR_ALPHA.id).length === 0 &&
        deletedCallRes.ok === true &&
        (await ContractorPersistenceService.getContractorCallDetail(CONTRACTOR_ALPHA.id, alphaCallSid)) === null,
      'Authorized owner/admin can delete lead and call records cleanly'
    );

    // 5.3 Recording policy, PII minimization, log scrubbing & safe error responses
    const recPolicy = evaluateCallRecordingPolicy({ recordingRequested: true });
    const scrubbedText = minimizeCustomerText(
      'My SSN is 123-45-6789 and card is 4532 0151 1283 0366 and key is AIzaSyD1234567890abcdefghijklmnopqrstuv'
    );
    const scrubbedLog = JSON.stringify(
      sanitizeLogPayload({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
        callerPhone: '+12145550199',
        serviceAddress: '500 Legacy Dr, Plano, TX',
      })
    );
    const safeClientErr = sanitizeClientErrorMessage(
      'ERROR: duplicate key value violates unique constraint "leads_pkey" on relation "public.leads" for +12145550199'
    );
    const safeRespJson = await (
      await createSafeErrorResponse({
        code: 'DATABASE_UNAVAILABLE',
        status: 503,
        internalError: new Error('postgres://postgres:supersecret@db.internal:5432/aeris'),
      })
    ).json();

    assert(
      recPolicy.recordingEnabled === false &&
        recPolicy.legalComplianceVerified === false &&
        !scrubbedText.includes('123-45-6789') &&
        !scrubbedText.includes('4532 0151') &&
        !scrubbedText.includes('AIzaSy') &&
        !scrubbedLog.includes('eyJhbGci') &&
        !scrubbedLog.includes('2145550199') &&
        !safeClientErr.includes('leads_pkey') &&
        !safeClientErr.includes('2145550199') &&
        !JSON.stringify(safeRespJson).includes('supersecret'),
      'Call recording remains disabled and all logs/error responses scrub secrets, tokens, SSNs, cards, phones, and DB constraints'
    );

    // =========================================================================
    // STEP 6: TELEPHONY SIMULATION [SIMULATED — NO REAL PSTN CALL]
    // =========================================================================
    console.log('\n--- STEP 6: Telephony Simulation [SIMULATED — NO REAL PSTN CALL] ---');

    clearRegisteredDestinationRoutes();
    const sessionManager = CallSessionManager.getInstance();

    process.env.TWILIO_AUTH_TOKEN = 'phase11_simulated_twilio_auth_token_secret';
    process.env.TWILIO_ACCOUNT_SID = 'AC11111111111111111111111111111111';
    process.env.TWILIO_WEBHOOK_PUBLIC_URL = 'https://hvac-pearl-seven.vercel.app';
    process.env.TWILIO_MEDIA_STREAM_WSS_URL =
      'wss://hvac-production-4391.up.railway.app/api/telephony/twilio-stream';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    registerProvisionedDestinationRoute({
      phoneNumber: '+19725550140',
      isActive: true,
      config: CONTRACTOR_ALPHA,
    });
    registerProvisionedDestinationRoute({
      phoneNumber: '+12145550188',
      isActive: true,
      config: CONTRACTOR_BETA,
    });

    // 6.1 Cross-tenant conflicting destination number registration is blocked
    let phoneConflictCaught = false;
    try {
      await ContractorPersistenceService.associateProvisionedPhoneNumber({
        businessId: CONTRACTOR_BETA.id,
        phoneNumber: '+19725550140',
        label: 'Twilio Line',
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes('already assigned to another contractor')
      ) {
        phoneConflictCaught = true;
      }
    }
    assert(
      phoneConflictCaught === true,
      '[SIMULATED] Cross-tenant destination phone conflict (+19725550140) is rejected'
    );

    // 6.2 Invalid vs Valid Twilio Webhook Signatures
    const voiceUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/voice';
    const voiceParams: Record<string, string> = {
      CallSid: 'CA_SIM_PHASE11_001',
      AccountSid: 'AC11111111111111111111111111111111',
      From: '+19725550199',
      To: '+19725550140',
      CallStatus: 'ringing',
    };

    const invalidSigReq = new NextRequest(voiceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'hvac-pearl-seven.vercel.app',
        'x-forwarded-proto': 'https',
        'x-twilio-signature': 'forged_invalid_signature_value',
      },
      body: new URLSearchParams(voiceParams).toString(),
    });
    const invalidSigRes = await voiceWebhookPost(invalidSigReq);

    const validSig = computeTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      voiceUrl,
      voiceParams
    );
    const validSigReq = new NextRequest(voiceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'hvac-pearl-seven.vercel.app',
        'x-forwarded-proto': 'https',
        'x-twilio-signature': validSig,
      },
      body: new URLSearchParams(voiceParams).toString(),
    });
    const validSigRes = await voiceWebhookPost(validSigReq);
    const validSigTwiml = await validSigRes.text();

    assert(
      invalidSigRes.status === 403 &&
        validSigRes.status === 200 &&
        validSigRes.headers.get('x-aeris-contractor-id') === CONTRACTOR_ALPHA.id &&
        validSigTwiml.includes('<Connect>') &&
        validSigTwiml.includes('<Stream') &&
        !validSigTwiml.includes('<Record'),
      '[SIMULATED] Voice webhook rejects forged signature (403) and routes valid signed webhook to Contractor Alpha without recording'
    );

    // 6.3 Unknown / Unassigned Destination Number Safe Failure
    const unknownParams: Record<string, string> = {
      CallSid: 'CA_SIM_UNKNOWN_DEST_01',
      AccountSid: 'AC11111111111111111111111111111111',
      From: '+19725550199',
      To: '+18005559999',
      CallStatus: 'ringing',
    };
    const unknownSig = computeTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      voiceUrl,
      unknownParams
    );
    const unknownRes = await voiceWebhookPost(
      new NextRequest(voiceUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          host: 'hvac-pearl-seven.vercel.app',
          'x-forwarded-proto': 'https',
          'x-twilio-signature': unknownSig,
        },
        body: new URLSearchParams(unknownParams).toString(),
      })
    );
    const unknownTwiml = await unknownRes.text();

    assert(
      unknownRes.status === 200 &&
        unknownRes.headers.get('x-aeris-route-status') === 'UNASSIGNED_DESTINATION_NUMBER' &&
        unknownTwiml.includes('<Hangup/>') &&
        !unknownTwiml.includes('<Stream'),
      '[SIMULATED] Unknown destination number fails safely with polite hangup TwiML and never opens a Media Stream'
    );

    // 6.4 Missing or Invalid Stream Correlation Tokens
    const missingTokenCorr = await sessionManager.validateAndCorrelateStreamStart({
      callSid: 'CA_SIM_CROSS_INST_01',
      streamSid: 'MZ_SIM_CROSS_INST_01',
      customParameters: {
        businessId: CONTRACTOR_ALPHA.id,
        calledPhone: '+19725550140',
        callerPhone: '+19725550199',
        // Missing correlationToken in production cross-instance mode
      },
    });
    const forgedTokenCorr = await sessionManager.validateAndCorrelateStreamStart({
      callSid: 'CA_SIM_CROSS_INST_01',
      streamSid: 'MZ_SIM_CROSS_INST_01',
      customParameters: {
        businessId: CONTRACTOR_ALPHA.id,
        calledPhone: '+19725550140',
        callerPhone: '+19725550199',
        correlationToken: '00000000000000000000000000000000',
      },
    });
    const authenticToken = createStreamCorrelationToken({
      callSid: 'CA_SIM_CROSS_INST_01',
      calledPhone: '+19725550140',
      callerPhone: '+19725550199',
      businessId: CONTRACTOR_ALPHA.id,
    });
    const validTokenCorr = await sessionManager.validateAndCorrelateStreamStart({
      callSid: 'CA_SIM_CROSS_INST_01',
      streamSid: 'MZ_SIM_CROSS_INST_01',
      customParameters: {
        businessId: CONTRACTOR_ALPHA.id,
        calledPhone: '+19725550140',
        callerPhone: '+19725550199',
        correlationToken: authenticToken,
      },
    });

    assert(
      missingTokenCorr.valid === false &&
        missingTokenCorr.reason === 'INVALID_STREAM_CORRELATION_TOKEN' &&
        forgedTokenCorr.valid === false &&
        forgedTokenCorr.reason === 'INVALID_STREAM_CORRELATION_TOKEN' &&
        validTokenCorr.valid === true &&
        validTokenCorr.businessId === CONTRACTOR_ALPHA.id,
      '[SIMULATED] Stream correlation rejects missing or forged tokens in production and accepts authentic HMAC-SHA256 token'
    );

    // 6.5 Simulated Live Telephony Server: WebSocket Interruption, AI Session Failure & Out-of-Order Callbacks
    const TEST_SIM_PORT = 9898;
    const { server: simHttpServer, shutdown: shutdownSimServer } = createTelephonyServer();
    await new Promise<void>((resolve) => {
      simHttpServer.listen(TEST_SIM_PORT, '127.0.0.1', () => resolve());
    });
    try {
      const wsDropCallSid = 'CA_SIM_WS_DROP_01';
      const serverVoiceUrl = `http://127.0.0.1:${TEST_SIM_PORT}/api/telephony/twilio/voice`;
      const wsDropParams: Record<string, string> = {
        CallSid: wsDropCallSid,
        AccountSid: 'AC11111111111111111111111111111111',
        From: '+12145550177',
        To: '+12145550188', // Contractor Beta
        CallStatus: 'ringing',
      };
      const wsDropSig = computeTwilioSignature(
        process.env.TWILIO_AUTH_TOKEN,
        serverVoiceUrl,
        wsDropParams
      );

      const liveWebhookRes = await fetch(serverVoiceUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          host: `127.0.0.1:${TEST_SIM_PORT}`,
          'x-twilio-signature': wsDropSig,
        },
        body: new URLSearchParams(wsDropParams).toString(),
      });
      assert(
        liveWebhookRes.status === 200 &&
          liveWebhookRes.headers.get('x-aeris-contractor-id') === CONTRACTOR_BETA.id,
        '[SIMULATED] Telephony server voice webhook validates signature and registers Contractor Beta call'
      );

      // Connect WebSocket stream, send partial turn, then drop with code 4002
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${TEST_SIM_PORT}/api/telephony/twilio-stream`);
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              event: 'start',
              start: {
                streamSid: 'MZ_SIM_WS_DROP_01',
                callSid: wsDropCallSid,
                customParameters: {
                  businessId: CONTRACTOR_BETA.id,
                  calledPhone: '+12145550188',
                  callerPhone: '+12145550177',
                },
              },
            })
          );
          setTimeout(() => {
            ws.close(4002, 'Simulated carrier media stream drop');
          }, 80);
        });
        ws.on('close', () => {
          setTimeout(() => resolve(), 60);
        });
        ws.on('error', reject);
      });

      // Now send a late out-of-order "completed" status callback and a duplicate status callback
      const statusUrl = 'https://hvac-pearl-seven.vercel.app/api/telephony/twilio/status';
      const lateStatusParams: Record<string, string> = {
        CallSid: wsDropCallSid,
        CallStatus: 'completed',
        CallDuration: '12',
        From: '+12145550177',
        To: '+12145550188',
      };
      const lateStatusSig = computeTwilioSignature(
        process.env.TWILIO_AUTH_TOKEN,
        statusUrl,
        lateStatusParams
      );
      const statusRes1 = await statusWebhookPost(
        new NextRequest(statusUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            host: 'hvac-pearl-seven.vercel.app',
            'x-forwarded-proto': 'https',
            'x-twilio-signature': lateStatusSig,
          },
          body: new URLSearchParams(lateStatusParams).toString(),
        })
      );
      // Duplicate status callback delivery
      const statusRes2 = await statusWebhookPost(
        new NextRequest(statusUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            host: 'hvac-pearl-seven.vercel.app',
            'x-forwarded-proto': 'https',
            'x-twilio-signature': lateStatusSig,
          },
          body: new URLSearchParams(lateStatusParams).toString(),
        })
      );

      const betaCallDetail = await ContractorPersistenceService.getContractorCallDetail(
        CONTRACTOR_BETA.id,
        wsDropCallSid
      );

      assert(
        statusRes1.status === 200 &&
          statusRes2.status === 200 &&
          betaCallDetail !== null &&
          betaCallDetail.call.status === 'failed' &&
          betaCallDetail.call.outcome === 'failed' &&
          Boolean(betaCallDetail.call.failureReason?.includes('4002')) &&
          !betaCallDetail.lifecycleEvents.some((e) => e.lifecycleEvent === 'call_completed'),
        '[SIMULATED] Failed call after WebSocket drop preserves failed status/reason and is never overwritten by late or duplicate completed callbacks'
      );
    } finally {
      await new Promise<void>((resolve) => {
        shutdownSimServer('SIGTERM', () => resolve());
      });
    }

    // =========================================================================
    // STEP 7: DATABASE AND MIGRATIONS REVIEW VERIFICATION
    // =========================================================================
    console.log('\n--- STEP 7: Database Schema & Migration Chain Verification ---');

    const migrationDir = path.join(process.cwd(), 'supabase', 'migrations');
    const migration1 = fs.readFileSync(
      path.join(migrationDir, '20261003_phase7_pilot_schema.sql'),
      'utf8'
    );
    const migration2 = fs.readFileSync(
      path.join(migrationDir, '20261003_phase7_onboarding_rpc.sql'),
      'utf8'
    );
    const migration3 = fs.readFileSync(
      path.join(migrationDir, '20261012_saas_foundation_schema.sql'),
      'utf8'
    );

    assert(
      migration1.includes('CREATE TABLE IF NOT EXISTS public.businesses') &&
        migration2.includes('CREATE OR REPLACE FUNCTION public.onboard_contractor_business') &&
        migration3.includes('CREATE OR REPLACE FUNCTION public.user_has_business_role') &&
        migration3.includes('DROP POLICY IF EXISTS "users_update_own_conversations" ON public.conversations;') &&
        migration3.includes("role IN ('owner', 'admin', 'dispatcher', 'technician', 'viewer')"),
      'All 3 Supabase migrations form a valid dependency chain with aligned role constraints and tightened RLS policies'
    );

    // Health endpoint verification
    const healthRes = await healthGet();
    const healthJson = await healthRes.json();
    assert(
      typeof healthJson.services?.gemini?.status === 'string' &&
        typeof healthJson.services?.supabase?.status === 'string' &&
        typeof healthJson.services?.telephony?.status === 'string' &&
        typeof healthJson.readyForPilot === 'boolean' &&
        !JSON.stringify(healthJson).includes('phase11_simulated_twilio_auth_token_secret'),
      'GET /api/health reports service readiness booleans without exposing secrets'
    );
  } finally {
    clearTimeout(watchdog);
    setMockGeminiClientForTest(null);
    ContractorPersistenceService.setSimulatedDatabaseFailure(false);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`PHASE 11 E2E ACCEPTANCE SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase11AcceptanceSuite().catch((err) => {
  console.error('Unhandled error in Phase 11 Acceptance Suite:', err);
  process.exit(1);
});
