'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { demoScenarios } from '@/mock/scenarios';
import { CustomerInfo, ConversationMessage, LeadStatus, AgentAction } from '@/types';
import {
  mergeCustomerInfo,
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
import { ContractorBusinessConfig } from '@/lib/ai/contractorConfig';

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
  "Hi, you've reached Summit HVAC. I'm AERIS, your receptionist. How can I help you today?";

export const ReceptionistDemo: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(demoScenarios[0].id);
  const activeScenario = demoScenarios.find((s) => s.id === activeScenarioId) || demoScenarios[0];

  // Server-verified contractor context (loaded from /api/receptionist/context)
  const [activeContractorConfig, setActiveContractorConfig] = useState<
    ContractorBusinessConfig | undefined
  >(undefined);
  const [isDemoContext, setIsDemoContext] = useState<boolean>(true);
  const [openingGreeting, setOpeningGreeting] = useState<string>(INITIAL_AI_GREETING);

  useEffect(() => {
    let mounted = true;
    async function loadVerifiedContext() {
      try {
        const res = await fetch('/api/receptionist/context');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        if (data?.config) {
          setActiveContractorConfig(data.config as ContractorBusinessConfig);
          setIsDemoContext(Boolean(data.isDemo));
        }
        if (typeof data?.openingGreeting === 'string' && data.openingGreeting.trim()) {
          setOpeningGreeting(data.openingGreeting.trim());
        }
      } catch {
        // Keep default Summit HVAC demo context on network error
      }
    }
    loadVerifiedContext();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Manual action loading states
  const [isCreatingLead, setIsCreatingLead] = useState<boolean>(false);
  const [isRequestingAppt, setIsRequestingAppt] = useState<boolean>(false);

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
        urgency: (inp?.urgency as CustomerInfo['urgency']) || prev.urgency,
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

  // Manual contextual action: Create Lead
  const handleManualCreateLead = async () => {
    if (isCreatingLead || leadId) return;
    setIsCreatingLead(true);
    try {
      const res = await fetch('/api/receptionist/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          toolName: 'create_lead',
          args: {
            customerName: customerInfo.name || 'Caller',
            phone: customerInfo.phone || 'Phone pending',
            serviceAddress: customerInfo.serviceAddress || customerInfo.cityOrArea || 'Address pending',
            serviceType: customerInfo.serviceType || 'HVAC Service',
            reportedIssue: customerInfo.problemDescription || 'General HVAC Service Request',
            urgency: customerInfo.urgency || 'normal',
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data?.action) {
        handleActionExecuted(data.action);
      }
    } catch (err) {
      console.error('Failed to manually create lead:', err);
    } finally {
      setIsCreatingLead(false);
    }
  };

  // Manual contextual action: Request Appointment
  const handleManualRequestAppointment = async () => {
    if (isRequestingAppt || appointmentId) return;
    setIsRequestingAppt(true);
    try {
      const res = await fetch('/api/receptionist/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          toolName: 'request_appointment',
          args: {
            leadId: leadId || undefined,
            preferredSlot: customerInfo.preferredAppointmentTime || 'Next Available Slot',
            serviceType: customerInfo.serviceType || 'HVAC Service',
            notes: customerInfo.problemDescription || 'Requested via Receptionist Panel',
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data?.action) {
        handleActionExecuted(data.action);
      }
    } catch (err) {
      console.error('Failed to manually request appointment:', err);
    } finally {
      setIsRequestingAppt(false);
    }
  };

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
        const { customerInfo: extractedInfo, leadStatus: newLeadStatus, intent } =
          extractStructuredCustomerData(
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
          const { customerInfo: interimInfo, leadStatus: interimLeadStatus, intent } =
            extractStructuredCustomerData(
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
    if (openingGreeting) {
      manager.setOpeningGreeting(openingGreeting);
    }

    return () => {
      manager.stop();
    };
  }, [handleActionExecuted, openingGreeting]);

  // Keep manager updated if verified contractor openingGreeting loads asynchronously
  useEffect(() => {
    if (voiceManagerRef.current && openingGreeting) {
      voiceManagerRef.current.setOpeningGreeting(openingGreeting);
    }
  }, [openingGreeting]);

  // Voice Call Handlers
  const handleStartVoice = async () => {
    hasEndedVoiceNoticeRef.current = false;
    setVoiceErrorMessage(null);
    if (!voiceManagerRef.current) return;

    voiceManagerRef.current.setOpeningGreeting(openingGreeting);
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
        text: openingGreeting,
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

  const isCallActive =
    voiceState === 'CONNECTING' ||
    voiceState === 'LISTENING' ||
    voiceState === 'AI_SPEAKING' ||
    voiceState === 'PROCESSING' ||
    voiceState === 'MUTED';

  const handleUserTextMessage = (customerText: string) => {
    if (isCallActive && voiceManagerRef.current && voiceState !== 'CONNECTING') {
      const handled = voiceManagerRef.current.sendUserText(customerText);
      if (handled) return;
    }
    sendToGemini(customerText);
  };

  const handleSelectScenario = (id: string) => {
    setActiveScenarioId(id);
    const target = demoScenarios.find((s) => s.id === id);
    if (!target) return;
    const customerOpener = target.messages.find((m) => m.sender === 'customer')?.text;
    if (customerOpener) {
      handleUserTextMessage(customerOpener);
    }
  };

  return (
    <section id="interactive-demo" className="py-8 bg-transparent">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-2.5 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Interactive Multimodal Dispatcher</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
              AERIS Receptionist Live Voice &amp; Chat Simulator
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
              Speak naturally through your microphone with{' '}
              <strong className="text-[var(--foreground)] font-semibold">
                {activeContractorConfig?.name || 'Summit HVAC'}
              </strong>
              &apos;s real-time receptionist powered by AERIS Voice, or type customer inquiries to test.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--muted)] font-mono">
              Voice Engine: <strong className="text-emerald-500 font-semibold">AERIS Voice</strong>
            </span>
            <span className="text-[var(--surface-border)]">|</span>
            <span className="text-xs text-[var(--muted)] font-mono">
              Model: <strong className="text-cyan-500 font-semibold">AERIS Core</strong>
            </span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-[var(--surface-border)] gap-3 px-1">
          <button
            onClick={() => setActiveMode('browser')}
            className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeMode === 'browser'
                ? 'border-blue-500 text-blue-600 dark:text-cyan-400'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>🎙️</span>
            <span>Browser Voice &amp; Chat</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-500/20">
              Active
            </span>
          </button>

          <button
            onClick={() => setActiveMode('telephony')}
            className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeMode === 'telephony'
                ? 'border-blue-500 text-blue-600 dark:text-cyan-400'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>📞</span>
            <span>Inbound Phone Bridge</span>
            <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-blue-500/20">
              PSTN Gateway
            </span>
          </button>
        </div>

        {/* Lead Status Stepper Banner */}
        <div>
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
                engineName={voiceState !== 'IDLE' ? 'AERIS Voice' : 'AERIS Intelligence'}
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
                onSendTextMessage={handleUserTextMessage}
                isThinking={isThinking}
                onReset={handleReset}
              />
            </div>

            {/* Right Column: Customer Info Panel, Agent Actions, Business Info Panel (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <CustomerInfoPanel
                info={customerInfo}
                leadId={leadId}
                appointmentId={appointmentId}
                leadStatus={leadStatus}
                onCreateLead={handleManualCreateLead}
                onRequestAppointment={handleManualRequestAppointment}
                isCreatingLead={isCreatingLead}
                isRequestingAppt={isRequestingAppt}
              />
              <AgentActionsPanel actions={executedActions} leadId={leadId} appointmentId={appointmentId} />
              <BusinessInfoPanel config={activeContractorConfig} isDemo={isDemoContext} />
            </div>
          </div>
        ) : (
          /* 2-Column Main Demo Grid - Telephony Bridge Mode */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Telephony Bridge Controller (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <TelephonyPanel />
            </div>

            {/* Right Column: Real-time extracted info & actions (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <CustomerInfoPanel
                info={customerInfo}
                leadId={leadId}
                appointmentId={appointmentId}
                leadStatus={leadStatus}
                onCreateLead={handleManualCreateLead}
                onRequestAppointment={handleManualRequestAppointment}
                isCreatingLead={isCreatingLead}
                isRequestingAppt={isRequestingAppt}
              />
              <AgentActionsPanel actions={executedActions} leadId={leadId} appointmentId={appointmentId} />
              <BusinessInfoPanel config={activeContractorConfig} isDemo={isDemoContext} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
