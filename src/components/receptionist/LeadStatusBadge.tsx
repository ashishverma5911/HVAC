'use client';

import React from 'react';
import { LeadStatus } from '@/types';
import { formatLeadStatus } from '@/lib/utils';
import { Check, ArrowRight, Activity, CalendarCheck, ShieldAlert, Sparkles } from 'lucide-react';

interface LeadStatusBadgeProps {
  status: LeadStatus;
  detectedIntent?: string;
  hasAppointmentTime?: boolean;
}

export const LeadStatusBadge: React.FC<LeadStatusBadgeProps> = ({
  status,
  detectedIntent,
  hasAppointmentTime,
}) => {
  const steps: Array<{ key: LeadStatus; label: string }> = [
    { key: 'new', label: 'New Intake' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'appointment_requested', label: 'Appt Requested' },
    { key: 'transferred', label: 'Escalated' },
    { key: 'completed', label: 'Completed' },
  ];

  const currentStatusConfig = formatLeadStatus(status);

  const getStepState = (stepKey: LeadStatus) => {
    const order: LeadStatus[] = ['new', 'qualified', 'appointment_requested', 'transferred', 'completed'];
    const currentIndex = order.indexOf(status);
    const stepIndex = order.indexOf(stepKey);

    if (status === 'transferred' && stepKey === 'transferred') return 'current';
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="rounded-2xl border p-4 sm:p-5 transition-colors duration-200
      bg-[var(--surface)] border-[var(--surface-border)] shadow-xs
    ">
      {/* Top row: Status Title & Active Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-[var(--surface-border)] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-cyan-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              Lead &amp; Dispatch Progression
            </h3>
            <p className="text-[10px] text-[var(--muted)]">
              Real-time classification based on conversation turns
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-2xs ${currentStatusConfig.bg} ${currentStatusConfig.text} ${currentStatusConfig.border}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            <span>{currentStatusConfig.label}</span>
          </span>

          {hasAppointmentTime && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20">
              <CalendarCheck className="h-3 w-3" />
              <span>Time Proposed</span>
            </span>
          )}
        </div>
      </div>

      {/* Modern Stepper Nodes */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {steps.map((step, idx) => {
          const stepState = getStepState(step.key);
          const isCompleted = stepState === 'completed';
          const isCurrent = stepState === 'current';

          return (
            <div
              key={step.key}
              className={`p-2.5 rounded-xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
                isCurrent
                  ? 'bg-blue-600/15 border-blue-500/40 text-blue-600 dark:text-cyan-300 shadow-sm shadow-blue-500/20 font-bold'
                  : isCompleted
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'bg-[var(--surface-raised)] border-[var(--surface-border)] text-[var(--muted)] opacity-60'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
              </div>
              <span className="text-[11px] truncate w-full">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
