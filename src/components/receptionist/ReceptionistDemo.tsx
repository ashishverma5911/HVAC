'use client';

import React, { useState } from 'react';
import { demoScenarios } from '@/mock/scenarios';
import { CustomerInfo, ConversationMessage, LeadStatus, AllowedIntent } from '@/types';
import { mergeCustomerInfo } from '@/lib/ai/extractConversationData';
import { TranscriptArea } from './TranscriptArea';
import { CustomerInfoPanel } from './CustomerInfoPanel';
import { LeadStatusBadge } from './LeadStatusBadge';
import { BusinessInfoPanel } from './BusinessInfoPanel';
import { VoiceControls } from './VoiceControls';

const initialEmptyCustomerInfo: CustomerInfo = {
  name: '',
  phone: '',
  address: '',
  serviceAddress: '',
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

  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(initialEmptyCustomerInfo);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [detectedIntent, setDetectedIntent] = useState<string>(activeScenario.detectedIntent);

  const handleStartCall = () => {
    setIsCallActive(true);
    setErrorMessage(null);
    if (messages.length === 0) {
      const greetingMsg: ConversationMessage = {
        id: `greeting-${Date.now()}`,
        sender: 'ai',
        text: INITIAL_AI_GREETING,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([greetingMsg]);
    }
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    const endNotice: ConversationMessage = {
      id: `sys-${Date.now()}`,
      sender: 'system',
      text: 'Call ended by contractor console. Conversation state retained in memory.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, endNotice]);
  };

  const handleReset = () => {
    setIsCallActive(false);
    setIsThinking(false);
    setErrorMessage(null);
    setMessages([]);
    setCustomerInfo(initialEmptyCustomerInfo);
    setLeadStatus('new');
    setDetectedIntent(activeScenario.detectedIntent);
  };

  const sendToGemini = async (customerText: string) => {
    setIsCallActive(true);
    setIsThinking(true);
    setErrorMessage(null);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      sender: 'customer',
      text: customerText,
      timestamp: timeStr,
    };

    // If no prior greeting, prepend the initial AI greeting to preserve context
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

    // Format chat history for API payload
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

      if (data.extractedData) {
        setCustomerInfo((prev) => mergeCustomerInfo(prev, data.extractedData));
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error connecting to AI receptionist.';
      setErrorMessage(errMsg);
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

    // Find the opening customer inquiry in the preset scenario
    const customerOpener = target.messages.find((m) => m.sender === 'customer')?.text;
    if (customerOpener) {
      sendToGemini(customerOpener);
    }
  };

  return (
    <section id="interactive-demo" className="py-12 bg-slate-100/70 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold mb-2">
              <span>Phase 3: Live Gemini Conversation</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              AI Receptionist Live Simulator
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Type any HVAC inquiry or click a preset to converse with Summit HVAC&apos;s virtual receptionist powered live by Gemini 3.8 Flash.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">
              Model: <strong className="text-slate-800">gemini-3.8-flash</strong>
            </span>
          </div>
        </div>

        {/* Lead Status Stepper Banner */}
        <div className="mb-6">
          <LeadStatusBadge
            status={leadStatus}
            detectedIntent={detectedIntent}
            hasAppointmentTime={Boolean(customerInfo.preferredAppointmentTime)}
          />
        </div>

        {/* 2-Column Main Demo Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Transcript Area & Voice Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <TranscriptArea
              messages={messages}
              isCallActive={isCallActive}
              detectedIntent={detectedIntent}
              isThinking={isThinking}
            />

            <VoiceControls
              scenarios={demoScenarios}
              activeScenarioId={activeScenarioId}
              onSelectScenario={handleSelectScenario}
              isCallActive={isCallActive}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onReset={handleReset}
              onSendCustomerMessage={sendToGemini}
              isThinking={isThinking}
              errorMessage={errorMessage}
              onClearError={() => setErrorMessage(null)}
            />
          </div>

          {/* Right Column: Customer Info Panel & Business Info Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <CustomerInfoPanel info={customerInfo} />
            <BusinessInfoPanel />
          </div>
        </div>
      </div>
    </section>
  );
};
