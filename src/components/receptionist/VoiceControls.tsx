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
  const [showDiagnostics, setShowDiagnostics] = useState(true);

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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Connecting to AERIS Voice...
          </span>
        );
      case 'LISTENING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Listening to You...
          </span>
        );
      case 'AI_SPEAKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Volume2 className="w-3.5 h-3.5 animate-bounce" />
            AI Speaking...
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Executing Tool Action...
          </span>
        );
      case 'MUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <MicOff className="w-3 h-3" />
            Microphone Muted
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="w-3 h-3" />
            Voice Error
          </span>
        );
      case 'ENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Call Ended
          </span>
        );
      case 'IDLE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Microphone Ready
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      {/* Top Header Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'voice'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Real-Time Voice (AERIS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'text'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Text Chat &amp; Presets
          </button>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition"
          title="Reset conversation state"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Session</span>
        </button>
      </div>

      {/* VOICE MODE PANEL */}
      {activeTab === 'voice' && (
        <div className="space-y-4">
          {/* Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 text-white rounded-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    AERIS Voice
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded">
                    Real-Time AI
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Web Audio API • Native Audio In/Out • Telephony not connected yet
                </p>
              </div>
            </div>

            <div>{getVoiceBadge()}</div>
          </div>

          {/* Voice Error Banner */}
          {voiceErrorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Microphone or Connection Error</p>
                <p className="text-red-700 mt-0.5">{voiceErrorMessage}</p>
              </div>
            </div>
          )}

          {/* Voice Controls: Call Button, Mute Button, Audio Visualizer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5">
              {!isVoiceCallActive ? (
                <button
                  type="button"
                  onClick={onStartVoice}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-md shadow-emerald-900/20 transition-all cursor-pointer"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Start Voice Conversation</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStopVoice}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-md shadow-red-900/20 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Voice Call</span>
                </button>
              )}

              {isVoiceCallActive && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                    isMuted
                      ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-4 h-4 text-rose-600" /> : <Mic className="w-4 h-4 text-emerald-600" />}
                  <span>{isMuted ? 'Unmute' : 'Mute Mic'}</span>
                </button>
              )}
            </div>

            {/* Audio Waveform / Energy Meter */}
            {isVoiceCallActive && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 mr-1.5 font-mono">
                  {voiceState === 'AI_SPEAKING' ? 'AI Voice' : 'User Mic'}
                </span>
                {[...Array(8)].map((_, i) => {
                  const active = !isMuted && audioLevel > i * 0.12;
                  return (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        active
                          ? voiceState === 'AI_SPEAKING'
                            ? 'bg-blue-400 h-5'
                            : 'bg-emerald-400 h-5'
                          : 'bg-slate-700 h-1.5'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* REAL-TIME DEVELOPMENT DIAGNOSTICS HUD */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100/80 transition"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>Live Audio Pipeline Diagnostics</span>
                {diagnostics && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {diagnostics.sessionId}
                  </span>
                )}
              </div>
              {showDiagnostics ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showDiagnostics && (
              <div className="p-3 border-t border-slate-200 bg-slate-900 text-slate-200 text-[11px] font-mono">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Token Request</p>
                    <p
                      className={`font-semibold ${
                        diagnostics?.tokenRequest === 'success'
                          ? 'text-emerald-400'
                          : diagnostics?.tokenRequest === 'failure'
                          ? 'text-red-400'
                          : diagnostics?.tokenRequest === 'requesting'
                          ? 'text-amber-400 animate-pulse'
                          : 'text-slate-400'
                      }`}
                    >
                      {diagnostics?.tokenRequest || 'idle'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Live Model</p>
                    <p className="text-cyan-400 font-semibold truncate">
                      {diagnostics?.liveModel || 'gemini-3.8-live'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Token Received</p>
                    <p
                      className={`font-semibold ${
                        diagnostics?.tokenReceived === 'yes' ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {diagnostics?.tokenReceived || 'no'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Live Session</p>
                    <p
                      className={`font-semibold ${
                        diagnostics?.liveSession === 'connected'
                          ? 'text-emerald-400'
                          : diagnostics?.liveSession === 'connecting'
                          ? 'text-amber-400 animate-pulse'
                          : diagnostics?.liveSession === 'failed'
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {diagnostics?.liveSession || 'disconnected'}
                    </p>
                  </div>

                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Microphone</p>
                    <p
                      className={`font-semibold ${
                        diagnostics?.microphone === 'connected' ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {diagnostics?.microphone || 'disconnected'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Audio Chunks Sent</p>
                    <p className="text-white font-semibold">
                      {diagnostics?.audioChunksSent || 0}{' '}
                      <span className="text-slate-400 text-[10px]">
                        ({(((diagnostics?.audioBytesSent || 0) / 1024)).toFixed(1)} KB)
                      </span>
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Transcript Input</p>
                    <p className="text-emerald-400 font-semibold">
                      {diagnostics?.inputTranscriptionEvents || 0} events{' '}
                      <span className="text-slate-400 text-[10px]">({diagnostics?.finalUserTurns || 0} final)</span>
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Model Output</p>
                    <p className="text-blue-400 font-semibold">
                      {diagnostics?.outputTranscriptionEvents || 0} events{' '}
                      <span className="text-slate-400 text-[10px]">({diagnostics?.finalAssistantTurns || 0} final)</span>
                    </p>
                  </div>

                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Audio Out (Chunks)</p>
                    <p className="text-cyan-400 font-semibold">{diagnostics?.modelAudioChunks || 0} received</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Tool Calls</p>
                    <p className="text-purple-400 font-semibold">{diagnostics?.toolCalls || 0}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Playback</p>
                    <p
                      className={`font-semibold ${
                        diagnostics?.playback === 'playing' ? 'text-blue-400 animate-pulse' : 'text-slate-300'
                      }`}
                    >
                      {diagnostics?.playback || 'idle'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/80 border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Turns Blocked</p>
                    <p className="text-slate-300 font-semibold">
                      {diagnostics?.duplicateUserTurnsBlocked || 0} u / {diagnostics?.duplicateAssistantTurnsBlocked || 0} a
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEXT CHAT & PRESET SCENARIOS PANEL */}
      {activeTab === 'text' && (
        <div className="space-y-4">
          {/* Preset Scenario Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Preset Test Scenario:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  disabled={isThinking}
                  onClick={() => onSelectScenario(sc.id)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition ${
                    activeScenarioId === sc.id
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-medium'
                      : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100'
                  } disabled:opacity-50`}
                >
                  <p className="font-semibold truncate">{sc.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sc.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Customer Query Input */}
          <form onSubmit={handleCustomSubmit} className="pt-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Type Customer Inquiry:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customInput}
                disabled={isThinking}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="e.g. My AC isn't cooling. I'm in Plano. Can someone come tomorrow?"
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
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
      )}
    </div>
  );
}
