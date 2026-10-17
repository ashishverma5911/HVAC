'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  ShieldAlert,
  Flame,
  Wrench,
  Clock,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  DollarSign,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  actionGuidance: string;
  isEmergency?: boolean;
}

const FAQS: FAQItem[] = [
  {
    id: 'kb-gas-leak',
    category: 'EMERGENCY PROTOCOLS',
    question: 'What should AERIS do if a caller smells natural gas or rotten eggs?',
    answer:
      'Natural gas odor (mercaptan) is a critical life-safety hazard. AERIS immediately instructs all occupants to evacuate the property immediately without operating light switches or appliances, dial 911 or their gas utility (e.g. Atmos Energy) from a safe distance, and notifies the contractor priority hotline.',
    actionGuidance:
      'Zero diagnostic questions allowed. Execute emergency evacuation protocol and transfer/alert dispatcher.',
    isEmergency: true,
  },
  {
    id: 'kb-co-alarm',
    category: 'EMERGENCY PROTOCOLS',
    question: 'How are Carbon Monoxide (CO) alarm activations handled?',
    answer:
      'A sounding carbon monoxide detector must always be treated as an active poison risk. AERIS instructs the caller to leave the home immediately, get into fresh air, call 911, and check for symptoms like dizziness, nausea, or headaches.',
    actionGuidance:
      'Evacuation guidance mandatory. Mark lead as emergency triage and alert on-call manager.',
    isEmergency: true,
  },
  {
    id: 'kb-cooling-outage',
    category: 'HVAC TRIAGE RULES',
    question: 'How does AERIS triage complete cooling loss during summer heat waves?',
    answer:
      'If indoor temperatures exceed 85°F, or if vulnerable individuals (infants, elderly, medical conditions) reside on the premises, the call is prioritized as urgent priority triage. AERIS collects unit type (central AC, heat pump, mini-split) and schedules the earliest same-day or next-morning dispatch window.',
    actionGuidance:
      'Flag urgency as Urgent or Emergency based on ambient heat and vulnerable residents.',
  },
  {
    id: 'kb-furnace-no-heat',
    category: 'HVAC TRIAGE RULES',
    question: 'How are freezing temperatures and furnace outages triaged?',
    answer:
      'When outdoor temperatures are below 32°F, heating outages carry immediate risk of hypothermia and burst pipes. AERIS advises setting faucets to a slow drip to prevent freezing pipes, confirms if auxiliary heat is operational, and dispatches urgent inspection.',
    actionGuidance:
      'Advise pipe freeze mitigation and prioritize next available heating specialist.',
  },
  {
    id: 'kb-service-areas',
    category: 'TERRITORY & DISPATCH',
    question: 'What is the contractor service territory boundary?',
    answer:
      'Summit HVAC services the Dallas-Fort Worth metroplex within a 35-mile radius, including Dallas, Plano, Frisco, Richardson, McKinney, Carrollton, and Garland. Inquiries outside territory receive polite notice and optional out-of-area travel referral.',
    actionGuidance:
      'Use check_service_area tool with caller city or postal code before confirming appointments.',
  },
  {
    id: 'kb-diagnostic-pricing',
    category: 'PRICING & POLICIES',
    question: 'What is the standard diagnostic inspection fee?',
    answer:
      'Summit HVAC charges a standard $89 diagnostic fee for residential systems during normal business hours (8:00 AM – 6:00 PM). This fee covers comprehensive technician diagnosis, multimeter testing, and a written repair estimate. The diagnostic fee is waived when the repair is approved.',
    actionGuidance:
      'State the diagnostic policy truthfully. Never quote repair part prices over the phone.',
  },
  {
    id: 'kb-after-hours',
    category: 'PRICING & POLICIES',
    question: 'How do after-hours and weekend emergency call-out fees work?',
    answer:
      'Calls between 6:00 PM and 8:00 AM or on Sundays require an on-call technician dispatch fee of $149. Callers are clearly informed of this surcharge before dispatch confirmation.',
    actionGuidance:
      'Always disclose after-hours dispatch fee before committing a technician to night calls.',
  },
  {
    id: 'kb-maintenance-tuneup',
    category: 'ROUTINE INQUIRIES',
    question: 'What is included in the annual AC or furnace tune-up?',
    answer:
      'A 21-point comprehensive inspection including coil cleaning, refrigerant pressure check, electrical contact inspection, blower motor amperage test, thermostat calibration, and condensate drain flushing.',
    actionGuidance:
      'Categorize as Routine Maintenance and offer flexible weekday appointment slots.',
  },
];

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(FAQS[0].id);

  const categories = ['all', ...Array.from(new Set(FAQS.map((f) => f.category)))];

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.actionGuidance.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <AppShell pageTitle="Knowledge Base & Rules" badge="HVAC RULES">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Hero Banner */}
        <div className="p-6 sm:p-10 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm relative overflow-hidden">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-cyan-400 text-xs font-semibold mb-3">
              <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
              <span>Contractor Domain Intelligence</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--foreground)] tracking-tight">
              HVAC Triage &amp; Knowledge Base
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              Standard operating procedures, emergency life-safety protocols, service territory boundaries,
              and pricing policies configured for AERIS Receptionist intake.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative mt-6 max-w-xl">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search triage rules, emergency policies, pricing..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2.5 border border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--foreground)] rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-[var(--muted)]"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 mt-6 pt-6 border-t border-[var(--surface-border)] overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[var(--surface-raised)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {cat === 'all' ? 'All Rules' : cat.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* FAQs Accordion List */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] p-12 text-center text-xs text-[var(--muted)]">
              No knowledge base entries found matching your query.
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = expandedId === faq.id;

              return (
                <div
                  key={faq.id}
                  className={`bg-[var(--surface)] rounded-2xl border transition-all duration-200 overflow-hidden ${
                    faq.isEmergency
                      ? 'border-rose-500/30'
                      : isExpanded
                      ? 'border-blue-500/40 shadow-sm'
                      : 'border-[var(--surface-border)] hover:border-[var(--surface-border)]'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 transition"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 ${
                          faq.isEmergency
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : 'bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20'
                        }`}
                      >
                        {faq.isEmergency ? (
                          <Flame className="h-4 w-4" />
                        ) : (
                          <HelpCircle className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                            {faq.category}
                          </span>
                          {faq.isEmergency && (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20">
                              Life Safety Protocol
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-[var(--foreground)] truncate">
                          {faq.question}
                        </h3>
                      </div>
                    </div>

                    <div className="text-[var(--muted)] shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-0 border-t border-[var(--surface-border)]/50 mt-1 space-y-3 text-xs">
                      <div className="pt-4 text-[var(--foreground)] leading-relaxed">
                        <p>{faq.answer}</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--surface-border)] flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-[var(--foreground)] block text-[11px] mb-0.5">
                            AERIS Receptionist Action Guidance:
                          </span>
                          <p className="text-[var(--muted)] leading-relaxed">
                            {faq.actionGuidance}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
