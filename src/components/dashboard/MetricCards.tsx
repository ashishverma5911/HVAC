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
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Calls Today
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {metrics.callsToday}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            100% answered by AI
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <PhoneCall className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 2: Leads */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Leads
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {metrics.leads}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Contact &amp; address captured
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <UserCheck className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 3: Appointments */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Appointments
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {metrics.appointments}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Time windows requested
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <CalendarCheck className="h-6 w-6" />
        </div>
      </div>

      {/* Metric 4: Urgent Requests */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Urgent Requests
          </p>
          <p className="text-3xl font-extrabold text-rose-600 mt-1">
            {metrics.urgentRequests}
          </p>
          <p className="text-[11px] text-rose-600 font-medium mt-1">
            Escalated to dispatch
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
