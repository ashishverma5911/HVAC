'use client';

import React, { useEffect, useRef } from 'react';
import { ConversationMessage } from '@/types';
import { Bot, User, AlertOctagon, Sparkles, Radio, Volume2 } from 'lucide-react';

interface TranscriptAreaProps {
  messages: ConversationMessage[];
  isCallActive: boolean;
  detectedIntent?: string;
  isThinking?: boolean;
  engineName?: string;
  voiceState?: string;
}

export const TranscriptArea: React.FC<TranscriptAreaProps> = ({
  messages,
  isCallActive,
  detectedIntent,
  isThinking = false,
  engineName = 'AERIS Voice',
  voiceState = 'IDLE',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const getVoiceStateBadge = () => {
    switch (voiceState) {
      case 'CONNECTING':
        return {
          label: 'Connecting...',
          color: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
          dot: 'bg-amber-400 animate-spin',
        };
      case 'LISTENING':
        return {
          label: 'Listening',
          color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400 animate-pulse',
        };
      case 'AI_SPEAKING':
        return {
          label: 'Speaking',
          color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          dot: 'bg-blue-400 animate-bounce',
        };
      case 'PROCESSING':
        return {
          label: 'Processing',
          color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          dot: 'bg-indigo-400 animate-ping',
        };
      case 'MUTED':
        return {
          label: 'Muted',
          color: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
          dot: 'bg-slate-400',
        };
      default:
        return {
          label: 'Idle',
          color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          dot: 'bg-slate-400',
        };
    }
  };

  const stateBadge = getVoiceStateBadge();

  return (
    <div className="flex flex-col h-[520px] rounded-2xl border overflow-hidden transition-colors duration-200
      bg-[var(--surface)] border-[var(--surface-border)] shadow-xs
    ">
      {/* Transcript Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between text-xs
        bg-[var(--surface-raised)] border-[var(--surface-border)] text-[var(--foreground)]
      ">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${isCallActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
          <span className="font-bold tracking-tight text-[var(--foreground)]">
            Live Conversation Transcript
          </span>
          <span className="text-[var(--muted)] font-mono text-[11px]">
            ({messages.length} message{messages.length === 1 ? '' : 's'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice State Badge */}
          {voiceState !== 'IDLE' && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${stateBadge.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stateBadge.dot}`} />
              {stateBadge.label}
            </span>
          )}

          {/* Intent Tag */}
          {detectedIntent && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md
              bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20
            ">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              <span>{detectedIntent}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--muted)]">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 mb-3.5">
              <Bot className="h-7 w-7" />
              <span className="absolute -inset-1 rounded-2xl bg-cyan-400 opacity-20 blur-xs" />
            </div>
            <p className="font-bold text-sm text-[var(--foreground)]">
              No active conversation
            </p>
            <p className="text-xs text-[var(--muted)] mt-1.5 max-w-sm leading-relaxed">
              Start a voice session or type a message below to test AERIS Receptionist with real HVAC caller inquiries.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAI = msg.sender === 'ai';
            const isSystem = msg.sender === 'system';

            if (isSystem) {
              return (
                <div
                  key={msg.id}
                  className="my-2 p-2.5 rounded-xl text-xs flex items-center gap-2.5
                    bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300
                  "
                >
                  <AlertOctagon className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="flex-1">{msg.text}</span>
                  <span className="text-[10px] font-mono opacity-70">{msg.timestamp}</span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
              >
                {isAI && (
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shrink-0 shadow-sm shadow-blue-500/20 mt-0.5">
                    <Bot className="h-4 w-4" />
                    <span className="absolute -inset-0.5 rounded-xl bg-cyan-400 opacity-25 blur-2xs" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-xs transition-colors duration-150 ${
                    isAI
                      ? 'bg-[var(--surface-raised)] text-[var(--foreground)] border border-[var(--surface-border)] rounded-tl-xs'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-xs shadow-blue-600/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                      {isAI ? 'AERIS Receptionist' : 'Customer'}
                    </span>
                    <span className="text-[10px] font-mono opacity-60">
                      {msg.timestamp}
                    </span>
                  </div>

                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>

                {!isAI && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-raised)] border border-[var(--surface-border)] text-[var(--muted)] shrink-0 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live typing / thinking indicator */}
        {isThinking && (
          <div className="flex gap-3 justify-start items-center">
            <div className="h-8 w-8 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Bot className="h-4 w-4 animate-pulse" />
            </div>
            <div className="rounded-2xl px-4 py-2.5 bg-[var(--surface-raised)] border border-[var(--surface-border)] text-[var(--muted)] text-xs flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>AERIS Receptionist is generating response...</span>
            </div>
          </div>
        )}
      </div>

      {/* Transcript Footer Indicator */}
      <div className="px-4 py-2 border-t flex items-center justify-between text-[11px]
        bg-[var(--surface-raised)]/70 border-[var(--surface-border)] text-[var(--muted)] font-mono
      ">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Multimodal Engine: {engineName}</span>
        </div>
        <span>Summit HVAC Protocol</span>
      </div>
    </div>
  );
};
