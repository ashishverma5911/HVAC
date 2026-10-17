'use client';

import React from 'react';
import { HelpCircle, UserCheck, Moon, AlertTriangle, Info, ShieldCheck, Zap } from 'lucide-react';

export const TrustSection: React.FC = () => {
  return (
    <section id="features" className="py-12 bg-transparent border-t border-[var(--surface-border)]">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-cyan-400 mb-2">
            Contractor Capabilities
          </h2>
          <p className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
            How AERIS Receptionist Powers Daily Field Operations
          </p>
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
            Engineered to handle inbound HVAC calls with low latency, capture complete caller details, triage urgency, and route appointments directly to your dispatchers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col justify-between hover:border-blue-500/40 transition shadow-sm">
            <div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center mb-4 border border-blue-500/20">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)] mb-2">
                Answers Customer Questions
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                Accurately answers standard business FAQs including service territories, inspection policies, hours of operation, and accepted payments based on your contractor settings.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-[var(--surface-border)] text-[11px] font-medium text-[var(--muted)]">
              Clear &amp; factual business information
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col justify-between hover:border-emerald-500/40 transition shadow-sm">
            <div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
                <UserCheck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)] mb-2">
                Captures Complete Leads
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                Conversational intake collects customer full name, verified call-back number, physical service address, reported HVAC issues, and preferred inspection time windows.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-[var(--surface-border)] text-[11px] font-medium text-[var(--muted)]">
              Structured dispatch-ready data
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col justify-between hover:border-indigo-500/40 transition shadow-sm">
            <div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 border border-indigo-500/20">
                <Moon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)] mb-2">
                24/7 After-Hours Coverage
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                When your office closes at 6 PM or on weekends, callers are greeted immediately instead of hitting voicemail. Next-morning priority slots or on-call emergency options are offered.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-[var(--surface-border)] text-[11px] font-medium text-[var(--muted)]">
              Always on call, 24/7/365
            </div>
          </div>

          {/* Card 4 */}
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col justify-between hover:border-rose-500/40 transition shadow-sm">
            <div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 border border-rose-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)] mb-2">
                Priority Safety Escalation
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                Detects urgent hazards like gas odors, carbon monoxide alerts, or electrical burning, instructs callers to evacuate / call emergency services, and flags human dispatchers immediately.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-[var(--surface-border)] text-[11px] font-medium text-[var(--muted)]">
              Priority escalation protocol
            </div>
          </div>
        </div>

        {/* Clear Scope Disclaimer Notice */}
        <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] flex items-start gap-3 text-xs text-[var(--muted)] max-w-3xl mx-auto shadow-sm">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-[var(--foreground)]">Operational Boundary:</strong> AERIS Receptionist understands reported HVAC issues, collects relevant intake information, and routes requests to your human team. It does not perform professional HVAC diagnosis, repair decisions, safety determinations, or technical repair instructions.
          </p>
        </div>

        {/* How It Works Subsection */}
        <div id="how-it-works" className="pt-8 border-t border-[var(--surface-border)]">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Workflow Pipeline
            </h3>
            <p className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] mt-1 tracking-tight">
              From First Ring to Field Dispatch
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--surface-border)] shadow-sm relative">
              <span className="text-3xl font-black text-blue-500/20 dark:text-cyan-500/20 mb-2 block font-mono">
                01
              </span>
              <h4 className="text-sm font-bold text-[var(--foreground)] mb-1.5">Customer Inbound Call</h4>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Customer calls your business line. AERIS Receptionist answers within 1–2 rings with your custom company greeting.
              </p>
            </div>

            <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--surface-border)] shadow-sm relative">
              <span className="text-3xl font-black text-blue-500/20 dark:text-cyan-500/20 mb-2 block font-mono">
                02
              </span>
              <h4 className="text-sm font-bold text-[var(--foreground)] mb-1.5">Issue Intake &amp; Triage</h4>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                AERIS listens to the reported issue, collects service address and callback details, and categorizes urgency for your team.
              </p>
            </div>

            <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--surface-border)] shadow-sm relative">
              <span className="text-3xl font-black text-blue-500/20 dark:text-cyan-500/20 mb-2 block font-mono">
                03
              </span>
              <h4 className="text-sm font-bold text-[var(--foreground)] mb-1.5">Action &amp; Dispatch Logging</h4>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                A structured lead and appointment request is logged to your dashboard. Confirmation details are presented, and urgent calls alert your team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
