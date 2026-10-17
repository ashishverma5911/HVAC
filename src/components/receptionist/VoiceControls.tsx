'use client';

import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  AlertCircle,
  Loader2,
  Volume2,
  Sparkles,
  Send,
  RotateCcw,
  MessageSquare,
  Radio,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { VoiceState, LiveVoiceDiagnostics } from '@/lib/ai/liveVoiceManager';
import { DemoScenario } from '@/types';

interface VoiceControlsProps {
  // Voice props
  voiceState: VoiceState;
  isMuted: boolean;
  audioLevel: number;
  voiceErrorMessage: string | null;
  diagnostics?: LiveVoiceDiagnostics | null;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onToggleMute: () => void;

  // Text / scenario props
  scenarios: DemoScenario[];
  activeScenarioId: string;
  onSelectScenario: (id: string) => void;
  onSendTextMessage: (text: string) => void;
  isThinking: boolean;
  onReset: () => void;
}

export function VoiceControls({
  voiceState,
  isMuted,
  audioLevel,
  voiceErrorMessage,
  diagnostics,
  onStartVoice,
  onStopVoice,
  onToggleMute,
  scenarios,
  activeScenarioId,
  onSelectScenario,
  onSendTextMessage,
  isThinking,
  onReset,
}: VoiceControlsProps) {
  const [customInput, setCustomInput] = useState('');
  const [activeTab, setActiveTab] = useState<'voice' | 'text'>('voice');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isVoiceCallActive =
    voiceState === 'CONNECTING' ||
    voiceState === 'LISTENING' ||
    voiceState === 'AI_SPEAKING' ||
    voiceState === 'PROCESSING' ||
    voiceState === 'MUTED';

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isThinking) return;
    onSendTextMessage(customInput.trim());
    setCustomInput('');
  };

  const getVoiceBadge = () => {
    switch (voiceState) {
      case 'CONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Connecting to AERIS Voice...
          </span>
        );
      case 'LISTENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs shadow-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Actively Listening to You...
          </span>
        );
      case 'AI_SPEAKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20 shadow-xs shadow-blue-500/20">
            <Volume2 className="w-3.5 h-3.5 animate-bounce" />
            AERIS Speaking...
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            Processing Audio Intake...
          </span>
        );
      case 'MUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
            <MicOff className="w-3.5 h-3.5" />
            Microphone Muted
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Connection Error
          </span>
        );
      case 'IDLE':
      case 'ENDED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-[var(--muted)] bg-[var(--surface-raised)] border border-[var(--surface-border)]">
            <Radio className="w-3.5 h-3.5 text-blue-500" />
            Voice Agent Ready
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border p-4 sm:p-5 transition-colors duration-200
      bg-[var(--surface)] border-[var(--surface-border)] shadow-xs
    ">
      {/* Top Controls Header: Mode Switcher & Session State */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--surface-border)]">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-raised)] border border-[var(--surface-border)]">
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'voice'
                ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Mode</span>
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'text'
                ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Text Chat</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {getVoiceBadge()}
          <button
            onClick={onReset}
            className="p-1.5 rounded-xl border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
            title="Reset Conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {voiceErrorMessage && (
        <div className="my-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{voiceErrorMessage}</span>
        </div>
      )}

      {/* Voice Tab Mode */}
      {activeTab === 'voice' && (
        <div className="py-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {!isVoiceCallActive ? (
                <button
                  onClick={onStartVoice}
                  className="relative group flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs shadow-md shadow-blue-500/25 hover:from-blue-500 hover:to-cyan-500 active:scale-[0.98] transition-all"
                >
                  <div className="relative">
                    <Mic className="w-4 h-4" />
                    <span className="absolute -inset-1 rounded-full bg-cyan-300 opacity-30 group-hover:opacity-60 blur-2xs" />
                  </div>
                  <span>Start Voice Session</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onStopVoice}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-600/20 hover:bg-rose-500 transition active:scale-[0.98]"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Voice Session</span>
                  </button>

                  <button
                    onClick={onToggleMute}
                    className={`p-2.5 rounded-xl border transition ${
                      isMuted
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)]'
                    }`}
                    title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              )}

              {/* Microphone Level Visualizer */}
              {isVoiceCallActive && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--surface-border)]">
                  <span className="text-[10px] text-[var(--muted)] font-mono">Audio</span>
                  <div className="w-16 h-2 rounded-full bg-slate-700/30 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-75"
                      style={{ width: `${Math.min(100, Math.max(8, audioLevel * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-[var(--muted)] text-center sm:text-right">
              Powered by <strong className="text-[var(--foreground)]">Gemini 3.8 Live Multimodal</strong>
            </p>
          </div>
        </div>
      )}

      {/* Text Chat Tab Mode */}
      {activeTab === 'text' && (
        <form onSubmit={handleCustomSubmit} className="py-3 flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            disabled={isThinking}
            placeholder="Type customer HVAC inquiry (e.g., 'My AC is blowing warm air in Plano')..."
            className="flex-1 px-4 py-2.5 rounded-xl border text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-[var(--surface-raised)] border-[var(--surface-border)]"
          />
          <button
            type="submit"
            disabled={!customInput.trim() || isThinking}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs shadow-sm hover:from-blue-500 hover:to-cyan-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isThinking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Quick Scenario Chips */}
      <div className="pt-3 border-t border-[var(--surface-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Preset Caller Scenarios</span>
          </span>
          {diagnostics && (
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-[10px] font-mono text-blue-500 hover:text-cyan-400 flex items-center gap-1"
            >
              <span>Diagnostics</span>
              {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              onClick={() => onSelectScenario(sc.id)}
              disabled={isThinking}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                activeScenarioId === sc.id
                  ? 'bg-blue-600/15 text-blue-600 dark:text-cyan-300 border-blue-500/30 font-semibold'
                  : 'bg-[var(--surface-raised)] text-[var(--muted)] border-[var(--surface-border)] hover:text-[var(--foreground)]'
              }`}
            >
              {sc.title}
            </button>
          ))}
        </div>
      </div>

      {/* Diagnostics Drawer */}
      {showDiagnostics && diagnostics && (
        <div className="mt-3 p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--surface-border)] text-[10px] font-mono space-y-1 text-[var(--muted)]">
          <div className="flex justify-between">
            <span>Session:</span>
            <span className="text-[var(--foreground)]">{diagnostics.sessionId}</span>
          </div>
          <div className="flex justify-between">
            <span>Model:</span>
            <span className="text-cyan-400">{diagnostics.liveModel}</span>
          </div>
          <div className="flex justify-between">
            <span>Audio Chunks Sent:</span>
            <span>{diagnostics.audioChunksSent}</span>
          </div>
          <div className="flex justify-between">
            <span>Assistant Turns:</span>
            <span>{diagnostics.finalAssistantTurns}</span>
          </div>
        </div>
      )}
    </div>
  );
}
