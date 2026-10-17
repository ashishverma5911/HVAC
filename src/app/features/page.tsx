'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Mic,
  Users,
  CalendarCheck,
  ShieldAlert,
  Phone,
  LayoutDashboard,
  CheckCircle2,
  Clock,
  Layers,
  Zap,
  ArrowRight,
  Flame,
  Radio,
  FileText,
  Lock,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

interface FeatureItem {
  id: string;
  category: string;
  title: string;
  description: string;
  status: 'available' | 'pilot' | 'coming_soon';
  icon: React.ComponentType<{ className?: string }>;
  bullets: string[];
}

const FEATURES: FeatureItem[] = [
  {
    id: 'voice-agent',
    category: 'VOICE INTELLIGENCE',
    title: 'Real-Time Multimodal Voice Agent',
    description:
      'Ultra low-latency conversational audio that allows HVAC customers to speak naturally with natural interruption (barge-in) and accurate acoustic processing.',
    status: 'available',
    icon: Mic,
    bullets: [
      'Natural interruption handling (barge-in) within 150ms',
      'HVAC acoustic context recognition (compressor noise, furnace hum)',
      'Human-like turn-taking without awkward pauses',
    ],
  },
  {
    id: 'lead-capture',
    category: 'LEAD GENERATION',
    title: 'Smart Structured Customer Intake',
    description:
      'Automatically extracts customer name, verified call-back phone, physical service address, and diagnostic problem details into structured CRM fields.',
    status: 'available',
    icon: Users,
    bullets: [
      'Real-time PII validation and extraction',
      'Address parsing with city/territory verification',
      'HVAC problem categorization (Cooling, Heating, Maintenance)',
    ],
  },
  {
    id: 'intelligent-dispatch',
    category: 'DISPATCH AUTOMATION',
    title: 'Appointment Request Scheduling',
    description:
      'Coordinates inspection windows with customers based on contractor operating hours, service territory, and emergency capacity rules.',
    status: 'available',
    icon: CalendarCheck,
    bullets: [
      'Operating hours validation and weekend scheduling',
      'Truthful pending-confirmation dispatch workflow',
      'Technician routing windows based on service territory',
    ],
  },
  {
    id: 'emergency-escalation',
    category: 'SAFETY & TRIAGE',
    title: 'Hazard & Emergency Escalation',
    description:
      'Instantly identifies high-risk safety hazards like gas leaks, carbon monoxide alerts, and extreme weather freeze threats.',
    status: 'available',
    icon: ShieldAlert,
    bullets: [
      'Immediate caller evacuation guidance for gas odors',
      'Instant dispatcher priority alerts',
      'Frozen pipe & extreme freeze mitigation triage',
    ],
  },
  {
    id: 'telephony-bridge',
    category: 'TELEPHONY',
    title: 'PSTN Carrier Audio Bridge',
    description:
      'Seamlessly connects traditional phone numbers to real-time AI audio streams over high-performance WebSockets.',
    status: 'pilot',
    icon: Phone,
    bullets: [
      'Twilio Media Streams bi-directional audio bridge',
      'Automatic call SID tracking and duration metrics',
      'Audio recording privacy compliance and one-click PII redaction',
    ],
  },
  {
    id: 'contractor-portal',
    category: 'MANAGEMENT',
    title: 'Multi-Tenant Contractor Dashboard',
    description:
      'Unified command center for US HVAC contractors to manage incoming calls, review transcripts, customize company hours, and inspect team dispatch queues.',
    status: 'available',
    icon: LayoutDashboard,
    bullets: [
      'Complete tenant isolation backed by Supabase RLS',
      'Full call lifecycle audit trails and transcript inspection',
      'Custom company greeting and territory configuration',
    ],
  },
  {
    id: 'crm-sync',
    category: 'INTEGRATIONS',
    title: 'Field Service CRM Two-Way Sync',
    description:
      'Automated sync with industry-standard HVAC platforms like ServiceTitan, Housecall Pro, and Jobber.',
    status: 'coming_soon',
    icon: Layers,
    bullets: [
      'Two-way sync with ServiceTitan & Housecall Pro',
      'Automatic job ticket creation & dispatch assignment',
      'Customer history lookup during live calls',
    ],
  },
  {
    id: 'multilingual',
    category: 'VOICE INTELLIGENCE',
    title: 'Multilingual Receptionist (Spanish & French)',
    description:
      'Automatic language detection that switches seamlessly to Spanish or French when a caller begins speaking their native language.',
    status: 'coming_soon',
    icon: Radio,
    bullets: [
      'Zero-delay automatic language detection',
      'Localized HVAC terminology in Spanish & French',
      'Multilingual CRM transcript translations',
    ],
  },
];

export default function FeaturesPage() {
  const [filter, setFilter] = useState<string>('all');

  const filteredFeatures = FEATURES.filter((f) => {
    if (filter === 'all') return true;
    return f.status === filter;
  });

  const getStatusBadge = (status: FeatureItem['status']) => {
    switch (status) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Available Now
          </span>
        );
      case 'pilot':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            In Pilot Testing
          </span>
        );
      case 'coming_soon':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Clock className="w-2.5 h-2.5" />
            Coming Soon
          </span>
        );
    }
  };

  return (
    <AppShell pageTitle="Features & Capabilities" badge="SYSTEM OVERVIEW">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Hero Banner */}
        <div className="p-6 sm:p-10 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-cyan-400 text-xs font-semibold mb-3">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>Full Platform Capabilities</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--foreground)] tracking-tight">
              Built Specifically for US HVAC Contractors
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              Every feature in AERIS Receptionist has been tailored to solve real contractor problems &mdash;
              eliminating missed calls during busy seasons, triaging hazardous gas leaks, and ensuring
              urgent furnace failures receive priority dispatch.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 mt-6 pt-6 border-t border-[var(--surface-border)] overflow-x-auto">
            {[
              { id: 'all', label: 'All Features' },
              { id: 'available', label: 'Available Now' },
              { id: 'pilot', label: 'In Pilot Testing' },
              { id: 'coming_soon', label: 'Coming Soon' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  filter === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[var(--surface-raised)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFeatures.map((feat) => {
            const Icon = feat.icon;

            return (
              <div
                key={feat.id}
                className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] hover:border-blue-500/40 p-6 shadow-sm transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="h-11 w-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center border border-blue-500/20 group-hover:scale-105 transition-transform">
                      <Icon className="h-5 w-5" />
                    </div>
                    {getStatusBadge(feat.status)}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--muted)] tracking-wider uppercase">
                      {feat.category}
                    </span>
                    <h3 className="text-base font-bold text-[var(--foreground)] mt-1">
                      {feat.title}
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                      {feat.description}
                    </p>
                  </div>

                  <ul className="space-y-2 pt-2 border-t border-[var(--surface-border)]">
                    {feat.bullets.map((b, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-[var(--foreground)] font-medium"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-[var(--surface-border)] flex items-center justify-between">
                  <Link
                    href="/#interactive-demo"
                    className="text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>Test In Demo</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
