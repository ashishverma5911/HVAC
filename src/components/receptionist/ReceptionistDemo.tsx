'use client';

import React, { useState, useEffect } from 'react';
import { demoScenarios } from '@/mock/scenarios';
import { CustomerInfo, ConversationMessage, LeadStatus } from '@/types';
import { TranscriptArea } from './TranscriptArea';
import { CustomerInfoPanel } from './CustomerInfoPanel';
import { LeadStatusBadge } from './LeadStatusBadge';
import { BusinessInfoPanel } from './BusinessInfoPanel';
import { VoiceControls } from './VoiceControls';

const initialEmptyCustomerInfo: CustomerInfo = {
  name: '',
  phone: '',
  address: '',
  serviceType: '',
  problemDescription: '',
  urgency: 'normal',
  preferredAppointmentTime: '',
};

export const ReceptionistDemo: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(demoScenarios[0].id);
  const activeScenario = demoScenarios.find((s) => s.id === activeScenarioId) || demoScenarios[0];

  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(initialEmptyCustomerInfo);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [detectedIntent, setDetectedIntent] = useState<string>(activeScenario.detectedIntent);

  // Initialize or reset scenario state
  const resetToScenario = (scenarioId: string) => {
    const target = demoScenarios.find((s) => s.id === scenarioId) || demoScenarios[0];
    setActiveScenarioId(scenarioId);
    setIsCallActive(false);
    setMessageIndex(0);
    setMessages([]);
    setCustomerInfo(initialEmptyCustomerInfo);
    setLeadStatus('new');
    setDetectedIntent(target.detectedIntent);
  };

  const handleStartCall = () => {
    setIsCallActive(true);
    // Add first AI greeting if not started
    if (messages.length === 0 && activeScenario.messages.length > 0) {
      const firstMsg = activeScenario.messages[0];
      const newMsg: ConversationMessage = {
        id: `msg-0-${Date.now()}`,
        sender: firstMsg.sender,
        text: firstMsg.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([newMsg]);
      setMessageIndex(1);
    }
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    const endNotice: ConversationMessage = {
      id: `sys-${Date.now()}`,
      sender: 'system',
      text: 'Call ended by contractor console. Final lead details recorded in memory.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, endNotice]);
  };

  const handleNextMessage = () => {
    if (!isCallActive) {
      setIsCallActive(true);
    }

    if (messageIndex < activeScenario.messages.length) {
      const next = activeScenario.messages[messageIndex];
      const newMsg: ConversationMessage = {
        id: `msg-${messageIndex}-${Date.now()}`,
        sender: next.sender,
        text: next.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, newMsg]);

      // Apply incremental extracted customer info
      if (next.extractedInfo) {
        setCustomerInfo((prev) => ({
          ...prev,
          ...next.extractedInfo,
        }));
      }

      // Update lead status
      if (next.status) {
        setLeadStatus(next.status);
      }

      setMessageIndex(messageIndex + 1);

      // If we've reached the end of the script, mark status as final
      if (messageIndex + 1 >= activeScenario.messages.length) {
        setCustomerInfo(activeScenario.finalInfo);
        setLeadStatus(activeScenario.finalStatus);
      }
    }
  };

  const handleFastForward = () => {
    setIsCallActive(true);
    const timeBase = new Date();
    const allMsgs: ConversationMessage[] = activeScenario.messages.map((m, idx) => ({
      id: `msg-ff-${idx}-${Date.now()}`,
      sender: m.sender,
      text: m.text,
      timestamp: new Date(timeBase.getTime() + idx * 30000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
    setMessages(allMsgs);
    setMessageIndex(activeScenario.messages.length);
    setCustomerInfo(activeScenario.finalInfo);
    setLeadStatus(activeScenario.finalStatus);
  };

  const handleReset = () => {
    resetToScenario(activeScenarioId);
  };

  const handleSelectScenario = (id: string) => {
    resetToScenario(id);
  };

  // Mock intelligent response to custom customer message
  const handleSendCustomCustomerMessage = (text: string) => {
    if (!isCallActive) {
      setIsCallActive(true);
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ConversationMessage = {
      id: `cust-custom-${Date.now()}`,
      sender: 'customer',
      text,
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);

    // Simple rule-based mock AI receptionist response
    setTimeout(() => {
      let aiResponse = "Thank you for reaching out to Summit HVAC. I have noted that request. May I get your name and phone number to schedule our on-call technician?";
      let updatedStatus: LeadStatus = 'qualified';
      let extracted: Partial<CustomerInfo> = {
        problemDescription: text,
      };

      const lower = text.toLowerCase();
      if (lower.includes('gas') || lower.includes('smell') || lower.includes('odor')) {
        aiResponse = "SAFETY ALERT: If you detect a natural gas odor, evacuate everyone immediately and call 911 or Atmos Energy from outside. We have marked this as high priority for emergency follow-up.";
        updatedStatus = 'transferred';
        extracted = {
          serviceType: 'Emergency Inspection',
          problemDescription: text,
          urgency: 'emergency',
        };
        setDetectedIntent('SAFETY_HAZARD_GAS_LEAK');
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('charge')) {
        aiResponse = "Under Summit HVAC's demo configuration, our standard diagnostic inspection fee is $89, which is credited toward any repairs you approve. (Note: Inspection fees and pricing policies are fully configurable by each contractor). Would you like to schedule an inspection window?";
        setDetectedIntent('PRICING_INQUIRY');
      } else if (lower.includes('hour') || lower.includes('open')) {
        aiResponse = "Summit HVAC is open Monday through Friday from 8:00 AM to 6:00 PM, with 24/7 priority on-call dispatch for urgent heating and cooling failures.";
        setDetectedIntent('BUSINESS_HOURS_INQUIRY');
      } else if (lower.includes('not cooling') || lower.includes('warm') || lower.includes('ac')) {
        aiResponse = "I'm sorry to hear that. I have noted down that your system is not cooling properly. May I have your name and service address to check technician availability for an inspection?";
        extracted = {
          serviceType: 'AC Repair',
          problemDescription: text,
          urgency: 'urgent',
        };
        setDetectedIntent('AC_COOLING_FAILURE');
      }

      const aiMsg: ConversationMessage = {
        id: `ai-custom-${Date.now()}`,
        sender: 'ai',
        text: aiResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setCustomerInfo((prev) => ({ ...prev, ...extracted }));
      setLeadStatus(updatedStatus);
    }, 600);
  };

  const hasNextMessage = messageIndex < activeScenario.messages.length;

  return (
    <section id="interactive-demo" className="py-12 bg-slate-100/70 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold mb-2">
              <span>Interactive Demonstration</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              AI Receptionist Live Simulator
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Experience how the AI receptionist greets homeowners, identifies HVAC problems, extracts customer data, and assigns dispatch status.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">
              Scenario: <strong className="text-slate-800">{activeScenario.title}</strong>
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
            />

            <VoiceControls
              scenarios={demoScenarios}
              activeScenarioId={activeScenarioId}
              onSelectScenario={handleSelectScenario}
              isCallActive={isCallActive}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onNextMessage={handleNextMessage}
              onFastForward={handleFastForward}
              onReset={handleReset}
              hasNextMessage={hasNextMessage}
              onSendCustomCustomerMessage={handleSendCustomCustomerMessage}
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
