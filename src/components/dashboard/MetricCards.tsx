'use client';

import React from 'react';
import { DashboardMetrics } from '@/types';
import { PhoneCall, UserCheck, CalendarCheck, AlertTriangle } from 'lucide-react';

interface MetricCardsProps {
  metrics: DashboardMetrics;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Metric 1: Calls Today */}
      <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--surface-border)] hover:border-blue-500/40 shadow-sm transition-all duration-200 flex items-center justify-between group">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Calls Today
          </p>
          <p className="text-3xl font-extrabold text-[var(--foreground)] mt-1.5 tracking-tight">
            {metrics.callsToday}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            100% answered by AERIS
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center border border-blue-500/20 group-hover:scale-105 transition-transform">
          <PhoneCall className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 2: Leads */}
      <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--surface-border)] hover:border-emerald-500/40 shadow-sm transition-all duration-200 flex items-center justify-between group">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Leads Captured
          </p>
          <p className="text-3xl font-extrabold text-[var(--foreground)] mt-1.5 tracking-tight">
            {metrics.leads}
          </p>
          <p className="text-[11px] text-[var(--muted)] font-medium mt-1.5">
            Contact &amp; address captured
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-105 transition-transform">
          <UserCheck className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 3: Appointments */}
      <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--surface-border)] hover:border-indigo-500/40 shadow-sm transition-all duration-200 flex items-center justify-between group">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Appointments
          </p>
          <p className="text-3xl font-extrabold text-[var(--foreground)] mt-1.5 tracking-tight">
            {metrics.appointments}
          </p>
          <p className="text-[11px] text-[var(--muted)] font-medium mt-1.5">
            Requested time windows
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 group-hover:scale-105 transition-transform">
          <CalendarCheck className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 4: Urgent Requests */}
      <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--surface-border)] hover:border-rose-500/40 shadow-sm transition-all duration-200 flex items-center justify-between group">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Urgent Requests
          </p>
          <p className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-1.5 tracking-tight">
            {metrics.urgentRequests}
          </p>
          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Priority triage escalated
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20 group-hover:scale-105 transition-transform">
          <AlertTriangle className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
