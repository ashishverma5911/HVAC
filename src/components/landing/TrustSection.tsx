'use client';

import React from 'react';
import { HelpCircle, UserCheck, Moon, AlertTriangle, Info } from 'lucide-react';

export const TrustSection: React.FC = () => {
  return (
    <section id="features" className="py-16 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
            Contractor Capabilities
          </h2>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">
            How the AI Receptionist Supports Your Daily Field Operations
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Purpose-built to handle inbound HVAC calls clearly, understand reported issues, collect caller details, and route requests to your team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between hover:border-blue-200 transition">
            <div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                Answers Customer Questions
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Accurately answers standard business FAQs including service territory, contractor-configured inspection policies, business hours, and accepted payment types based on your company settings.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/80 text-xs font-medium text-slate-500">
              Clear &amp; factual business information
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between hover:border-blue-200 transition">
            <div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <UserCheck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                Captures Complete Leads
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Conversational intake collects customer full name, verified call-back phone number, physical service address, reported equipment issues, and preferred inspection time windows.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/80 text-xs font-medium text-slate-500">
              Structured dispatch-ready data
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between hover:border-blue-200 transition">
            <div>
              <div className="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <Moon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                Handles After-Hours Inquiries
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                When your office closes at 6 PM or on weekends, callers are greeted immediately instead of going to voicemail. Next-morning priority slots or on-call emergency options are provided.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/80 text-xs font-medium text-slate-500">
              Always on call, 24/7/365
            </div>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between hover:border-blue-200 transition">
            <div>
              <div className="h-10 w-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center mb-4">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                Escalates When Human Help Is Needed
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Recognizes reported urgent hazards such as gas odors or burning smells, advises contacting local emergency services (911 or utility), and immediately flags the call for human contractor follow-up.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/80 text-xs font-medium text-slate-500">
              Priority escalation protocol
            </div>
          </div>
        </div>

        {/* Clear Scope Disclaimer Notice */}
        <div className="mt-8 p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600 max-w-3xl mx-auto">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p>
            <strong className="text-slate-800">Operational Boundary:</strong> The AI receptionist understands reported HVAC issues, collects relevant information, and routes or escalates requests appropriately. It does not perform professional HVAC diagnosis, repair decisions, safety determinations, or technical instructions.
          </p>
        </div>

        {/* How It Works Subsection */}
        <div id="how-it-works" className="mt-16 pt-12 border-t border-slate-200">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Workflow
            </h3>
            <p className="text-xl font-bold text-slate-900 mt-1">
              How A Call Moves From Ring to Dispatch
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs relative">
              <span className="text-3xl font-black text-slate-200 mb-2 block">01</span>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Customer Inbound Call</h4>
              <p className="text-xs text-slate-600">
                Customer calls your business number. The AI receptionist answers within 1–2 rings with your custom company greeting.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs relative">
              <span className="text-3xl font-black text-slate-200 mb-2 block">02</span>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Issue Intake &amp; Routing</h4>
              <p className="text-xs text-slate-600">
                The AI listens to the reported issue, collects service address and callback details, and notes urgency for your dispatchers.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs relative">
              <span className="text-3xl font-black text-slate-200 mb-2 block">03</span>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Action &amp; Dispatch Notification</h4>
              <p className="text-xs text-slate-600">
                A structured lead and appointment request is logged. Confirmation details are sent to the customer, and urgent matters alert your team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
