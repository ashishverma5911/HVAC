'use client';

import React from 'react';
import { AgentAction } from '@/types';
import {
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  Calendar,
  PhoneForwarded,
  ShieldCheck,
  ChevronRight,
  Inbox,
} from 'lucide-react';

interface AgentActionsPanelProps {
  actions: AgentAction[];
  leadId?: string | null;
  appointmentId?: string | null;
}

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'check_service_area':
      return <ShieldCheck className="h-4 w-4 text-sky-500" />;
    case 'create_lead':
      return <Wrench className="h-4 w-4 text-emerald-500" />;
    case 'get_available_slots':
    case 'request_appointment':
      return <Calendar className="h-4 w-4 text-blue-500" />;
    case 'transfer_to_human':
      return <PhoneForwarded className="h-4 w-4 text-rose-500" />;
    default:
      return <Zap className="h-4 w-4 text-indigo-500" />;
  }
};

export const AgentActionsPanel: React.FC<AgentActionsPanelProps> = ({
  actions,
  leadId,
  appointmentId,
}) => {
  return (
    <div className="rounded-2xl border p-5 flex flex-col transition-colors duration-200
      bg-[var(--surface)] text-[var(--foreground)] border-[var(--surface-border)] shadow-xs
    ">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[var(--surface-border)] mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
            <Zap className="h-4 w-4 fill-amber-500/20" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              Verified Server Actions
            </h3>
            <p className="text-[10px] text-[var(--muted)]">Tool Execution Log</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[var(--muted)] bg-[var(--surface-raised)] border border-[var(--surface-border)] px-2 py-0.5 rounded-md">
            {actions.length} {actions.length === 1 ? 'Action' : 'Actions'}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            Active Guard
          </span>
        </div>
      </div>

      {/* Content */}
      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-raised)]/50">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-2">
            <Zap className="h-4 w-4" />
          </div>
          <p className="text-xs font-bold text-[var(--foreground)]">
            No Actions Triggered Yet
          </p>
          <p className="text-[11px] text-[var(--muted)] mt-1 max-w-[260px]">
            When the AI receptionist checks territory eligibility, qualifies a customer, or requests an appointment, verified server actions record here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {actions.map((act) => {
            const isSuccess = act.status === 'success';
            const isPending = act.status === 'pending';

            return (
              <div
                key={act.id}
                className="p-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] text-xs transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 font-mono font-bold text-[11px] text-[var(--foreground)]">
                    {getToolIcon(act.toolName)}
                    <span>{act.toolName}</span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                      isSuccess
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : isPending
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    ) : isPending ? (
                      <Clock className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <XCircle className="h-2.5 w-2.5" />
                    )}
                    <span>{act.status}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[var(--muted)] font-mono">
                  <span>ID: {act.id.slice(0, 12)}...</span>
                  <span>{act.timestamp || 'Logged'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
