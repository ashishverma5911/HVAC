'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, ShieldCheck, Clock, PhoneIncoming, Wrench, Sparkles } from 'lucide-react';

export const HeroSection: React.FC = () => {
  const scrollToDemo = (e: React.MouseEvent) => {
    const demoElement = document.getElementById('interactive-demo');
    if (demoElement) {
      e.preventDefault();
      demoElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToHowItWorks = (e: React.MouseEvent) => {
    const elem = document.getElementById('how-it-works');
    if (elem) {
      e.preventDefault();
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative overflow-hidden bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] p-6 sm:p-10 mb-8 shadow-sm">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-cyan-400 text-xs font-semibold mb-6">
          <Wrench className="h-3.5 w-3.5 text-cyan-500" />
          <span>AERIS Receptionist for US HVAC Contractors</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--foreground)] leading-tight">
          Never miss an HVAC customer call.
        </h1>

        {/* Subheadline */}
        <p className="mt-5 text-base sm:text-lg text-[var(--muted)] leading-relaxed max-w-2xl mx-auto">
          AERIS Receptionist answers customer questions, captures qualified leads, and schedules
          service appointments with zero hold times &mdash; 24/7/365.
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="#interactive-demo"
            onClick={scrollToDemo}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-cyan-500 active:scale-95 transition-all"
          >
            <Bot className="h-4 w-4" />
            <span>Try AERIS Receptionist Demo</span>
            <ArrowRight className="h-4 w-4 ml-0.5" />
          </Link>

          <Link
            href="#how-it-works"
            onClick={scrollToHowItWorks}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--surface-raised)] px-6 py-3.5 text-sm font-semibold text-[var(--foreground)] border border-[var(--surface-border)] shadow-sm hover:bg-[var(--surface-border)] active:scale-95 transition-all"
          >
            <span>See How It Works</span>
          </Link>
        </div>

        {/* Core Trust Highlights */}
        <div className="mt-12 pt-8 border-t border-[var(--surface-border)] grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--surface-border)]/50">
            <PhoneIncoming className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">Zero Missed Calls</p>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">Picks up instantly while your crews are in the field</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--surface-border)]/50">
            <Clock className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">24/7 After-Hours</p>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">Captures high-value weekend &amp; evening emergencies</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--surface-border)]/50">
            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">Safety Triage</p>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">Priority protocols for gas leaks &amp; extreme temperatures</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--surface-border)]/50">
            <Wrench className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">HVAC Domain Engine</p>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">Understands heat pumps, AC compressors &amp; furnaces</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
