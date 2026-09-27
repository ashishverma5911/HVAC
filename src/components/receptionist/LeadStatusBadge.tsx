'use client';

import React from 'react';
import { LeadStatus } from '@/types';
import { formatLeadStatus } from '@/lib/utils';
import { Check, ArrowRight, Activity, CalendarCheck, ShieldAlert } from 'lucide-react';

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
    { key: 'new', label: 'New' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'appointment_requested', label: 'Appointment Requested' },
    { key: 'transferred', label: 'Transferred' },
    { key: 'completed', label: 'Completed' },
  ];

  const currentStatusConfig = formatLeadStatus(status);

  // Determine active step index
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Lead &amp; Dispatch Status</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time classification based on conversation progression
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${currentStatusConfig.bg} ${currentStatusConfig.text} ${currentStatusConfig.border}`}
          >
            {currentStatusConfig.label}
          </span>

          {hasAppointmentTime ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span>Slot Booked</span>
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs text-slate-500 bg-slate-100">
              Slot Pending
            </span>
          )}
        </div>
      </div>

      {/* Stepper Pipeline */}
      <div className="mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          {steps.map((step) => {
            const state = getStepState(step.key);

            let boxStyle = 'border-slate-200 bg-slate-50 text-slate-400';
            let circleStyle = 'bg-slate-200 text-slate-500';

            if (state === 'completed') {
              boxStyle = 'border-emerald-200 bg-emerald-50/70 text-emerald-800 font-medium';
              circleStyle = 'bg-emerald-600 text-white';
            } else if (state === 'current') {
              if (step.key === 'transferred') {
                boxStyle = 'border-purple-300 bg-purple-50 text-purple-900 font-bold ring-1 ring-purple-300';
                circleStyle = 'bg-purple-600 text-white';
              } else {
                boxStyle = 'border-blue-300 bg-blue-50 text-blue-900 font-bold ring-1 ring-blue-300';
                circleStyle = 'bg-blue-600 text-white';
              }
            }

            return (
              <div
                key={step.key}
                className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition ${boxStyle}`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${circleStyle}`}
                >
                  {state === 'completed' ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                  {state === 'current' && step.key === 'transferred' ? <ShieldAlert className="h-3 w-3" /> : null}
                  {state !== 'completed' && !(state === 'current' && step.key === 'transferred') ? (
                    <span>•</span>
                  ) : null}
                </div>
                <span className="text-[11px] leading-tight">{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
