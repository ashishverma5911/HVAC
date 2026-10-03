'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, ShieldCheck, Clock, PhoneIncoming, Wrench } from 'lucide-react';

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
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 pt-12 pb-16 lg:pt-16 lg:pb-20 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium mb-6">
            <Wrench className="h-3.5 w-3.5" />
            <span>AERIS AI Receptionist for US HVAC Contractors</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Your HVAC business never misses a customer call.
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed font-normal">
            AERIS AI Receptionist answers questions, captures leads, and helps
            customers request service — 24/7.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="#interactive-demo"
              onClick={scrollToDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-lg bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Bot className="h-5 w-5" />
              <span>Try AERIS AI Receptionist</span>
              <ArrowRight className="h-4 w-4 ml-0.5" />
            </Link>

            <Link
              href="#how-it-works"
              onClick={scrollToHowItWorks}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <span>See How It Works</span>
            </Link>
          </div>

          {/* Core Trust Highlights */}
          <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            <div className="flex items-start gap-2.5 p-2 rounded-md">
              <PhoneIncoming className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Zero Missed Calls</p>
                <p className="text-[11px] text-slate-500">Pick up every ring while in the field</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-md">
              <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">24/7 After-Hours</p>
                <p className="text-[11px] text-slate-500">Capture weekend & evening inquiries</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-md">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Safety Escalation</p>
                <p className="text-[11px] text-slate-500">Priority triage for gas & hazards</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-md">
              <Wrench className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">HVAC Problem Intake</p>
                <p className="text-[11px] text-slate-500">Understands AC, heat pump & furnace issues</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
