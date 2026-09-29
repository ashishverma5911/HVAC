'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { demoScenarios } from '@/mock/scenarios';
import { CustomerInfo, ConversationMessage, LeadStatus, AllowedIntent, AgentAction } from '@/types';
import {
  mergeCustomerInfo,
  extractFallbackName,
  extractFallbackPhone,
  extractFallbackAddress,
  extractFallbackCity,
  extractFallbackServiceType,
  extractFallbackReportedIssue,
  normalizeUrgency,
  inferIntent,
  extractStructuredCustomerData,
} from '@/lib/ai/extractConversationData';
import { TranscriptArea } from './TranscriptArea';
import { CustomerInfoPanel } from './CustomerInfoPanel';
import { LeadStatusBadge } from './LeadStatusBadge';
import { BusinessInfoPanel } from './BusinessInfoPanel';
import { VoiceControls } from './VoiceControls';
import { AgentActionsPanel } from './AgentActionsPanel';
import { TelephonyPanel } from './TelephonyPanel';
import { LiveVoiceManager, VoiceState, LiveVoiceDiagnostics } from '@/lib/ai/liveVoiceManager';

const initialEmptyCustomerInfo: CustomerInfo = {
  name: '',
  phone: '',
  address: '',
  serviceAddress: '',
  city: '',
  cityOrArea: '',
  serviceType: '',
  problemDescription: '',
  urgency: 'normal',
  preferredAppointmentTime: '',
};

const INITIAL_AI_GREETING =
  "Hi, you've reached Summit HVAC. I'm the virtual AI receptionist. How can I help you today?";

export const ReceptionistDemo: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(demoScenarios[0].id);
  const activeScenario = demoScenarios.find((s) => s.id === activeScenarioId) || demoScenarios[0];

  // Conversation & Session state
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [executedActions, setExecutedActions] = useState<AgentAction[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(initialEmptyCustomerInfo);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [detectedIntent, setDetectedIntent] = useState<string>(activeScenario.detectedIntent);
  const [activeMode, setActiveMode] = useState<'browser' | 'telephony'>('browser');

  // Mutable refs to prevent stale closures in async voice callbacks
  const customerInfoRef = useRef<CustomerInfo>(initialEmptyCustomerInfo);
  const leadStatusRef = useRef<LeadStatus>('new');
  const customerUtterancesRef = useRef<string[]>([]);
  const hasEndedVoiceNoticeRef = useRef<boolean>(false);

  useEffect(() => {
    customerInfoRef.current = customerInfo;
  }, [customerInfo]);

  useEffect(() => {
    leadStatusRef.current = leadStatus;
  }, [leadStatus]);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LiveVoiceDiagnostics | null>(null);

  // Text chat state
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [chatErrorMessage, setChatErrorMessage] = useState<string | null>(null);

  // Reference to client-side LiveVoiceManager
  const voiceManagerRef = useRef<LiveVoiceManager | null>(null);

  // Helper to handle tool actions executed either by voice or text
  const handleActionExecuted = useCallback((action: AgentAction) => {
    setExecutedActions((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const existingTools = new Set(prev.map((a) => a.toolName));
      if (existingIds.has(action.id)) return prev;
      if (action.toolName === 'transfer_to_human' && existingTools.has('transfer_to_human')) {
        return prev;
      }
      return [...prev, action];
    });

    // Update customer info and IDs based on tool execution
    if (action.toolName === 'create_lead' && action.status === 'success') {
      const inp = action.input as Record<string, unknown>;
      const out = action.output as Record<string, unknown>;
      if (out?.leadId) {
        setLeadId(String(out.leadId));
      }
      setLeadStatus('qualified');
      setCustomerInfo((prev) => ({
        ...prev,
        name: String(inp?.customerName || prev.name),
        phone: String(inp?.phone || prev.phone),
        serviceAddress: String(inp?.serviceAddress || prev.serviceAddress),
        serviceType: String(inp?.serviceType || prev.serviceType),
        problemDescription: String(inp?.reportedIssue || prev.problemDescription),
        urgency: (inp?.urgency as any) || prev.urgency,
      }));
    } else if (action.toolName === 'request_appointment' && action.status === 'success') {
      const inp = action.input as Record<string, unknown>;
      const out = action.output as Record<string, unknown>;
      if (out?.appointmentId) {
        setAppointmentId(String(out.appointmentId));
      }
      setLeadStatus('appointment_requested');
      if (inp?.preferredSlot) {
        setCustomerInfo((prev) => ({
          ...prev,
          preferredAppointmentTime: String(inp.preferredSlot),
        }));
      }
    } else if (action.toolName === 'transfer_to_human' && action.status === 'success') {
      setLeadStatus('transferred');
    } else if (action.toolName === 'check_service_area') {
      const inp = action.input as Record<string, unknown>;
      if (inp?.city) {
        setCustomerInfo((prev) => ({
          ...prev,
          cityOrArea: String(inp.city),
          city: String(inp.city),
        }));
      }
    }
  }, []);

  // Initialize LiveVoiceManager on mount
  useEffect(() => {
    const manager = new LiveVoiceManager({
      onStateChange: (state) => {
        setVoiceState(state);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
      onError: (err) => {
        setVoiceErrorMessage(err);
      },
      onDiagnostics: (diag) => {
        setDiagnostics(diag);
      },
      onActionExecuted: (action) => {
        handleActionExecuted(action);
      },
      onFinalUserUtterance: (utterance) => {
        customerUtterancesRef.current.push(utterance);
        const fullCustomerText = customerUtterancesRef.current.join(' ');
        const { customerInfo: extractedInfo, leadStatus: newLeadStatus, intent } = extractStructuredCustomerData(
          fullCustomerText,
          customerInfoRef.current,
          leadStatusRef.current
        );
        if (intent && intent !== 'UNKNOWN') {
          setDetectedIntent(intent);
        }
        setCustomerInfo(extractedInfo);
        customerInfoRef.current = extractedInfo;
        if (newLeadStatus && newLeadStatus !== 'new') {
          setLeadStatus(newLeadStatus);
          leadStatusRef.current = newLeadStatus;
        }
      },
      onTranscript: (turn) => {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages((prev) => {
          // Canonical Turn Deduplication: Lookup by turnId
          const existingIndex = prev.findIndex((m) => m.id === turn.turnId);
          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              text: turn.text,
              timestamp: timeStr,
            };
            return updated;
          }
          return [
            ...prev,
            {
              id: turn.turnId,
              sender: turn.speaker,
              text: turn.text,
              timestamp: timeStr,
            },
          ];
        });

        // Run real-time structured extraction on customer speech
        if (turn.speaker === 'customer') {
          const candidateText = [...customerUtterancesRef.current, turn.text].join(' ');
          const { customerInfo: interimInfo, leadStatus: interimLeadStatus, intent } = extractStructuredCustomerData(
            candidateText,
            customerInfoRef.current,
            leadStatusRef.current
          );
          if (intent && intent !== 'UNKNOWN') {
            setDetectedIntent(intent);
          }
          setCustomerInfo(interimInfo);
          customerInfoRef.current = interimInfo;
          if (interimLeadStatus && interimLeadStatus !== 'new') {
            setLeadStatus(interimLeadStatus);
            leadStatusRef.current = interimLeadStatus;
          }
        }
      },
    });

    voiceManagerRef.current = manager;

    return () => {
      manager.stop();
    };
  }, [handleActionExecuted]);

  // Voice Call Handlers
  const handleStartVoice = async () => {
    hasEndedVoiceNoticeRef.current = false;
    setVoiceErrorMessage(null);
    if (!voiceManagerRef.current) return;

    if (messages.length === 0) {
      const greetingMsg: ConversationMessage = {
        id: `greeting-${Date.now()}`,
        sender: 'ai',
        text: INITIAL_AI_GREETING,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([greetingMsg]);
    }

    await voiceManagerRef.current.start(conversationId);
  };

  const handleStopVoice = () => {
    if (voiceManagerRef.current) {
      voiceManagerRef.current.stop();
    }
    setVoiceState('ENDED');
    if (!hasEndedVoiceNoticeRef.current) {
      hasEndedVoiceNoticeRef.current = true;
      const endNotice: ConversationMessage = {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'Voice call ended by user. Microphone released.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, endNotice]);
    }
  };

  const handleToggleMute = () => {
    if (voiceManagerRef.current) {
      const newMuted = !isMuted;
      voiceManagerRef.current.setMuted(newMuted);
      setIsMuted(newMuted);
    }
  };

  // Reset Session
  const handleReset = () => {
    if (voiceManagerRef.current) {
      voiceManagerRef.current.stop();
    }
    hasEndedVoiceNoticeRef.current = false;
    customerUtterancesRef.current = [];
    customerInfoRef.current = initialEmptyCustomerInfo;
    leadStatusRef.current = 'new';
    setVoiceState('IDLE');
    setIsMuted(false);
    setAudioLevel(0);
    setVoiceErrorMessage(null);
    setDiagnostics(null);
    setIsThinking(false);
    setChatErrorMessage(null);
    const newConvId = `conv-${Date.now()}`;
    setConversationId(newConvId);
    setLeadId(null);
    setAppointmentId(null);
    setExecutedActions([]);
    setMessages([]);
    setCustomerInfo(initialEmptyCustomerInfo);
    setLeadStatus('new');
    setDetectedIntent(activeScenario.detectedIntent);
  };

  // Text Chat Mode Handler
  const sendToGemini = async (customerText: string) => {
    setIsThinking(true);
    setChatErrorMessage(null);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      sender: 'customer',
      text: customerText,
      timestamp: timeStr,
    };

    let currentConversation = [...messages];
    if (currentConversation.length === 0) {
      const initialGreetingMsg: ConversationMessage = {
        id: `greeting-${Date.now() - 100}`,
        sender: 'ai',
        text: INITIAL_AI_GREETING,
        timestamp: timeStr,
      };
      currentConversation = [initialGreetingMsg];
    }

    const updatedMessages = [...currentConversation, userMsg];
    setMessages(updatedMessages);

    const apiHistory = updatedMessages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({
        role: (m.sender === 'ai' ? 'model' : 'user') as 'user' | 'model',
        content: m.text,
      }));

    try {
      const res = await fetch('/api/receptionist/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiHistory,
          currentData: customerInfo,
          conversationId,
          leadId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to communicate with AI receptionist.');
      }

      const aiMsg: ConversationMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (data.detectedIntent) {
        setDetectedIntent(data.detectedIntent);
      }
      if (data.leadStatus) {
        setLeadStatus(data.leadStatus);
      }
      if (data.leadId) {
        setLeadId(data.leadId);
      }
      if (data.appointmentId) {
        setAppointmentId(data.appointmentId);
      }
      if (data.executedActions && Array.isArray(data.executedActions)) {
        data.executedActions.forEach((act: AgentAction) => handleActionExecuted(act));
      }
      if (data.extractedData) {
        setCustomerInfo((prev) => mergeCustomerInfo(prev, data.extractedData));
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error connecting to AI receptionist.';
      setChatErrorMessage(errMsg);
      const systemNotice: ConversationMessage = {
        id: `err-${Date.now()}`,
        sender: 'system',
        text: `Notice: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, systemNotice]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSelectScenario = (id: string) => {
    setActiveScenarioId(id);
    const target = demoScenarios.find((s) => s.id === id);
    if (!target) return;
    const customerOpener = target.messages.find((m) => m.sender === 'customer')?.text;
    if (customerOpener) {
      sendToGemini(customerOpener);
    }
  };

  const isCallActive =
    voiceState === 'CONNECTING' ||
    voiceState === 'LISTENING' ||
    voiceState === 'AI_SPEAKING' ||
    voiceState === 'PROCESSING' ||
    voiceState === 'MUTED';

  return (
    <section id="interactive-demo" className="py-12 bg-slate-100/70 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold mb-2 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
              <span>Phase 5: Real-Time Browser Voice (Gemini 3.8 Live)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              HVAC AI Receptionist Live Voice &amp; Chat Simulator
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Speak naturally through your microphone with Summit HVAC&apos;s real-time voice agent powered by Gemini 3.8 Live, or type customer inquiries to test.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono">
              Live Voice: <strong className="text-emerald-700">gemini-3.8-live</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500 font-mono">
              Chat: <strong className="text-slate-700">gemini-3.8-flash</strong>
            </span>
          </div>
        </div>

        {/* Phase Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 mb-6 gap-2">
          <button
            onClick={() => setActiveMode('browser')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeMode === 'browser'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🎙️</span>
            <span>Browser Voice &amp; Chat (Phase 5)</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Live API
            </span>
          </button>

          <button
            onClick={() => setActiveMode('telephony')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeMode === 'telephony'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📞</span>
            <span>Real US Telephony Bridge (Phase 6)</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Twilio PSTN
            </span>
          </button>
        </div>

        {/* Lead Status Stepper Banner */}
        <div className="mb-6">
          <LeadStatusBadge
            status={leadStatus}
            detectedIntent={detectedIntent}
            hasAppointmentTime={Boolean(customerInfo.preferredAppointmentTime)}
          />
        </div>

        {activeMode === 'browser' ? (
          /* 2-Column Main Demo Grid - Browser Voice Mode */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Transcript Area & Voice Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <TranscriptArea
                messages={messages}
                isCallActive={isCallActive}
                detectedIntent={detectedIntent}
                isThinking={isThinking || voiceState === 'PROCESSING'}
                engineName={voiceState !== 'IDLE' ? 'Gemini 3.8 Live' : 'Gemini 3.8 Flash'}
                voiceState={voiceState}
              />

              <VoiceControls
                voiceState={voiceState}
                isMuted={isMuted}
                audioLevel={audioLevel}
                voiceErrorMessage={voiceErrorMessage}
                diagnostics={diagnostics}
                onStartVoice={handleStartVoice}
                onStopVoice={handleStopVoice}
                onToggleMute={handleToggleMute}
                scenarios={demoScenarios}
                activeScenarioId={activeScenarioId}
                onSelectScenario={handleSelectScenario}
                onSendTextMessage={sendToGemini}
                isThinking={isThinking}
                onReset={handleReset}
              />
            </div>

            {/* Right Column: Customer Info Panel, Agent Actions, Business Info Panel (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <CustomerInfoPanel info={customerInfo} leadId={leadId} appointmentId={appointmentId} />
              <AgentActionsPanel actions={executedActions} leadId={leadId} appointmentId={appointmentId} />
              <BusinessInfoPanel />
            </div>
          </div>
        ) : (
          /* 2-Column Main Demo Grid - Telephony Bridge Mode */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Twilio Telephony Bridge Controller (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <TelephonyPanel />
            </div>

            {/* Right Column: Real-time extracted info & actions (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <CustomerInfoPanel info={customerInfo} leadId={leadId} appointmentId={appointmentId} />
              <AgentActionsPanel actions={executedActions} leadId={leadId} appointmentId={appointmentId} />
              <BusinessInfoPanel />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
