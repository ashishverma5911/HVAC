'use client';

import React, { useEffect, useRef } from 'react';
import { ConversationMessage } from '@/types';
import { Bot, User, AlertOctagon, Sparkles } from 'lucide-react';

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
  engineName = 'Gemini 3.8 Flash',
  voiceState,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
    <div className="flex flex-col h-[460px] bg-slate-900 rounded-xl border border-slate-800 shadow-inner overflow-hidden">
      {/* Transcript Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">Call Transcript</span>
          <span className="text-slate-400 font-mono text-[11px]">
            ({messages.length} message{messages.length === 1 ? '' : 's'})
          </span>
        </div>

        {detectedIntent && (
          <div className="flex items-center gap-1 text-[11px] bg-blue-950/80 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded-full font-mono">
            <Sparkles className="h-3 w-3 text-blue-400" />
            <span>Intent: {detectedIntent}</span>
          </div>
        )}
      </div>

      {/* Messages List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="h-12 w-12 rounded-full bg-slate-800/80 flex items-center justify-center mb-3 text-slate-400">
              <Bot className="h-6 w-6" />
            </div>
            <p className="font-medium text-slate-300">No active conversation</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Type a customer message below or pick a preset inquiry to start a real Gemini AI conversation.
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
                  className="my-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex items-center gap-2"
                >
                  <AlertOctagon className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>{msg.text}</span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
              >
                {isAI && (
                  <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-xs ${
                    isAI
                      ? 'bg-slate-800 text-slate-100 border border-slate-700/70 rounded-tl-xs'
                      : 'bg-blue-600 text-white rounded-tr-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[11px]">
                    <span
                      className={`font-semibold ${
                        isAI ? 'text-blue-300' : 'text-blue-100'
                      }`}
                    >
                      {isAI ? 'AI Receptionist (Summit HVAC)' : 'Customer'}
                    </span>
                    <span
                      className={`font-mono text-[10px] ${
                        isAI ? 'text-slate-400' : 'text-blue-200'
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                    {msg.text}
                  </p>
                </div>

                {!isAI && (
                  <div className="h-8 w-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Real-time Thinking Indicator */}
        {isThinking && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 animate-pulse">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-slate-800 text-slate-300 border border-slate-700/70 rounded-2xl rounded-tl-xs px-4 py-3 text-xs flex items-center gap-2 shadow-xs">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" />
              </div>
              <span className="text-slate-300">Gemini is processing response...</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              isThinking
                ? 'bg-amber-400 animate-ping'
                : isCallActive
                ? 'bg-emerald-400 animate-pulse'
                : voiceState === 'ENDED'
                ? 'bg-slate-600'
                : 'bg-slate-500'
            }`}
          />
          <span>
            {isThinking
              ? 'AI Receptionist thinking...'
              : isCallActive
              ? 'Conversation Active'
              : voiceState === 'ENDED'
              ? 'Call Ended'
              : 'Call Idle'}
          </span>
        </div>
        <span className="text-slate-400 font-mono text-[10px]">
          Engine: {engineName}
        </span>
      </div>
    </div>
  );
};
