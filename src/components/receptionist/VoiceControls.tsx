'use client';

import React, { useState } from 'react';
import { DemoScenario } from '@/types';
import {
  Mic,
  MicOff,
  Play,
  Square,
  RotateCcw,
  Send,
  Sparkles,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';

interface VoiceControlsProps {
  scenarios: DemoScenario[];
  activeScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  isCallActive: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onReset: () => void;
  onSendCustomerMessage: (text: string) => void;
  isThinking?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  scenarios,
  activeScenarioId,
  onSelectScenario,
  isCallActive,
  onStartCall,
  onEndCall,
  onReset,
  onSendCustomerMessage,
  isThinking = false,
  errorMessage = null,
  onClearError,
}) => {
  const [micActive, setMicActive] = useState(false);
  const [showMicNotice, setShowMicNotice] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const handleMicClick = () => {
    setShowMicNotice(true);
    setMicActive(!micActive);
    setTimeout(() => {
      setShowMicNotice(false);
    }, 4500);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isThinking) return;
    onSendCustomerMessage(customInput.trim());
    setCustomInput('');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
      {/* Top Status & Brand Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span
              className={`block h-3 w-3 rounded-full ${
                isThinking
                  ? 'bg-amber-500 animate-ping'
                  : isCallActive
                  ? 'bg-emerald-500 animate-ping'
                  : 'bg-emerald-500'
              }`}
            />
            <span
              className={`absolute top-0 left-0 block h-3 w-3 rounded-full ${
                isThinking
                  ? 'bg-amber-500'
                  : isCallActive
                  ? 'bg-emerald-500'
                  : 'bg-emerald-500'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">Summit HVAC</span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Gemini 3.8 Flash Active
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Interactive Caller Simulation Console
            </p>
          </div>
        </div>

        {/* Prototype Notice Badge */}
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-2.5 py-1 rounded-md">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="font-medium text-[11px]">
            Stage 3: Real Gemini AI Conversation
          </span>
        </div>
      </div>

      {/* Scenario Presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-slate-700">
            Quick-Start Inbound Call Presets:
          </label>
          <span className="text-[10px] text-slate-400">
            Sends opening inquiry directly to Gemini
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {scenarios.map((sc) => {
            const isSelected = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                disabled={isThinking}
                onClick={() => onSelectScenario(sc.id)}
                className={`p-2.5 rounded-lg text-left text-xs transition border flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    {sc.badgeText}
                  </span>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  )}
                </div>
                <span className="truncate block font-medium">{sc.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {!isCallActive ? (
            <button
              type="button"
              disabled={isThinking}
              onClick={onStartCall}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 transition disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-white" />
              <span>Start Conversation</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isThinking}
              onClick={onEndCall}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 transition disabled:opacity-50"
            >
              <Square className="h-4 w-4 fill-white" />
              <span>End Conversation</span>
            </button>
          )}

          <button
            type="button"
            disabled={isThinking}
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            title="Reset conversation state"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Reset</span>
          </button>
        </div>

        {/* Microphone Button UI with Prototype Mock Notice */}
        <div className="relative">
          <button
            type="button"
            onClick={handleMicClick}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium border transition ${
              micActive
                ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {micActive ? (
              <Mic className="h-4 w-4 text-amber-600 animate-pulse" />
            ) : (
              <MicOff className="h-4 w-4 text-slate-400" />
            )}
            <span>Mic (Voice Mock)</span>
          </button>

          {/* Toast / Tooltip explaining microphone mock */}
          {showMicNotice && (
            <div className="absolute right-0 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl border border-slate-700 z-30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300">
                    Voice UI Mockup
                  </p>
                  <p className="text-slate-300 mt-1 leading-normal">
                    Text conversations are powered live by Gemini 3.8 Flash. Live voice audio streaming will be integrated in Phase 4.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Display */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-2 text-xs text-rose-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              className="text-rose-500 hover:text-rose-700 font-bold px-1"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Manual Customer Query Input */}
      <form onSubmit={handleCustomSubmit} className="pt-2">
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Type Customer Inquiry to AI Receptionist:
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customInput}
            disabled={isThinking}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="e.g. My AC isn't cooling. Can someone come tomorrow?"
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!customInput.trim() || isThinking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs"
          >
            {isThinking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Thinking...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <Send className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
