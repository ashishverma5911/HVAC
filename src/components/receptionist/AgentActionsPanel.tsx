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
} from 'lucide-react';

interface AgentActionsPanelProps {
  actions: AgentAction[];
  leadId?: string | null;
  appointmentId?: string | null;
}

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'check_service_area':
      return <ShieldCheck className="h-4 w-4 text-sky-600" />;
    case 'create_lead':
      return <Wrench className="h-4 w-4 text-emerald-600" />;
    case 'get_available_slots':
    case 'request_appointment':
      return <Calendar className="h-4 w-4 text-blue-600" />;
    case 'transfer_to_human':
      return <PhoneForwarded className="h-4 w-4 text-rose-600" />;
    default:
      return <Zap className="h-4 w-4 text-indigo-600" />;
  }
};

export const AgentActionsPanel: React.FC<AgentActionsPanelProps> = ({
  actions,
  leadId,
  appointmentId,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500 fill-amber-500/20" />
          <h3 className="text-sm font-bold text-slate-900">
            Agent Actions &amp; Tool Executions
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
            {actions.length} {actions.length === 1 ? 'Action' : 'Actions'}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            Server-Validated
          </span>
        </div>
      </div>

      {/* ID Badges if available */}
      {(leadId || appointmentId) && (
        <div className="mb-4 grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 block">CRM Lead ID</span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {leadId || '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 block">Appointment</span>
            <span className="text-xs font-mono font-bold text-blue-700">
              {appointmentId ? `${appointmentId} (Requested)` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
            <Zap className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            No Tool Executions Yet
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-[260px]">
            When the AI receptionist checks service coverage, creates a CRM lead, or schedules an appointment, verified server actions appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {actions.map((act) => {
            const isSuccess = act.status === 'success';
            const isPending = act.status === 'pending';

            return (
              <div
                key={act.id}
                className={`p-3 rounded-lg border text-xs transition-all ${
                  isSuccess
                    ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                    : isPending
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-rose-50/50 border-rose-200'
                }`}
              >
                {/* Top Row: Icon + Tool Name + Status Badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    {getToolIcon(act.toolName)}
                    <span>{act.displayName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {act.timestamp}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        isSuccess
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isPending
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}
                    >
                      {isSuccess ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Success
                        </>
                      ) : isPending ? (
                        <>
                          <Clock className="h-3 w-3 animate-spin" />
                          Pending
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Failed
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Function Name Badge */}
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 mb-2">
                  <span>function:</span>
                  <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                    {act.toolName}()
                  </span>
                </div>

                {/* Key Output or Error Highlights */}
                {act.error && (
                  <div className="mt-1 text-[11px] text-rose-700 bg-rose-100/60 p-2 rounded border border-rose-200/80">
                    <strong>Validation Error:</strong> {act.error}
                  </div>
                )}

                {act.output && (
                  <div className="mt-1.5 bg-white p-2 rounded border border-slate-200/70 space-y-1 text-[11px]">
                    {Boolean(act.output.leadId) && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-500 font-medium">Lead ID:</span>
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                          {String(act.output.leadId)}
                        </span>
                      </div>
                    )}
                    {Boolean(act.output.appointmentId) && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-500 font-medium">Appointment:</span>
                        <span className="font-mono font-bold text-blue-800 bg-blue-50 px-1 rounded">
                          {String(act.output.appointmentId)} ({String(act.output.status)})
                        </span>
                      </div>
                    )}
                    {Boolean(act.output.slot) && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-500 font-medium">Requested Slot:</span>
                        <span className="font-semibold text-slate-800">
                          {String(act.output.slot)}
                        </span>
                      </div>
                    )}
                    {Boolean(act.output.matchedArea) && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-500 font-medium">Matched Service Area:</span>
                        <span className="font-semibold text-emerald-700">
                          {String(act.output.matchedArea)}
                        </span>
                      </div>
                    )}
                    {Boolean(act.output.transferId) && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-500 font-medium">Transfer Reference:</span>
                        <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1 rounded">
                          {String(act.output.transferId)}
                        </span>
                      </div>
                    )}
                    {Array.isArray(act.output.slots) && (
                      <div className="text-slate-600">
                        <span className="text-slate-500 font-medium block mb-0.5">Available Slots Returned:</span>
                        <div className="flex flex-wrap gap-1">
                          {act.output.slots.slice(0, 4).map((s: string, idx: number) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                              {s}
                            </span>
                          ))}
                          {act.output.slots.length > 4 && (
                            <span className="text-slate-400 text-[10px] self-center">
                              +{act.output.slots.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {Boolean(act.output.message) && (
                      <p className="text-slate-600 italic text-[10px] mt-1 pt-1 border-t border-slate-100">
                        &quot;{String(act.output.message)}&quot;
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
