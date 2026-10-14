'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Trash2,
  EyeOff,
  ExternalLink,
  Loader2,
  Info,
} from 'lucide-react';
import type { ContractorCallHistoryItem } from '@/lib/services/contractorPersistence';

interface CallDetailPayload {
  call: ContractorCallHistoryItem;
  transcripts: Array<{
    id: string;
    sender: 'customer' | 'ai' | 'system';
    text: string;
    incomplete: boolean;
    createdAt: string;
  }>;
  lifecycleEvents: ContractorCallHistoryItem['lifecycleEvents'];
}

interface CallHistoryTableProps {
  calls: ContractorCallHistoryItem[];
  isRealContractor: boolean;
  onRefresh?: () => void;
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds === null || durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
    return 'Not reported';
  }
  const mins = Math.floor(durationSeconds / 60);
  const secs = Math.floor(durationSeconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function getOutcomeBadgeClasses(outcome: ContractorCallHistoryItem['outcome']): string {
  switch (outcome) {
    case 'lead_captured':
    case 'appointment_requested':
    case 'transferred':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'human_escalation_requested':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'failed':
    case 'missed':
    case 'abandoned':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'completed_no_lead':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function CallHistoryTable({ calls, isRealContractor, onRefresh }: CallHistoryTableProps) {
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [callDetails, setCallDetails] = useState<Record<string, CallDetailPayload>>({});
  const [loadingCallId, setLoadingCallId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleCallDetail = async (callId: string) => {
    setActionError(null);
    if (expandedCallId === callId) {
      setExpandedCallId(null);
      return;
    }
    setExpandedCallId(callId);
    if (!isRealContractor || callDetails[callId]) {
      return;
    }

    setLoadingCallId(callId);
    try {
      const res = await fetch(`/api/contractor/calls/${encodeURIComponent(callId)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load call detail.');
      }
      setCallDetails((prev) => ({
        ...prev,
        [callId]: {
          call: data.call,
          transcripts: Array.isArray(data.transcripts) ? data.transcripts : [],
          lifecycleEvents: Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : [],
        },
      }));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to load call transcript and events.');
    } finally {
      setLoadingCallId(null);
    }
  };

  const handleRedactPii = async (callId: string) => {
    if (!isRealContractor) return;
    setActionBusyId(callId);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/calls/${encodeURIComponent(callId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redact_pii', redactPii: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to redact caller PII.');
      }
      setCallDetails((prev) => {
        const next = { ...prev };
        delete next[callId];
        return next;
      });
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to redact caller PII.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteCall = async (callId: string) => {
    if (!isRealContractor) return;
    setActionBusyId(callId);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/calls/${encodeURIComponent(callId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to delete call record.');
      }
      setExpandedCallId(null);
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete call record.');
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Call Recording & Consent Compliance Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                Call Recording &amp; Privacy Safeguards
              </h3>
              <span className="text-[11px] font-semibold bg-white text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                Audio Recording: Disabled by Default
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              AERIS does not automatically record call audio (<code className="font-mono text-[11px]">recordingEnabled: false</code>).
              Before enabling audio recording for any US contractor pilot, federal law (<code className="font-mono text-[11px]">18 U.S.C. § 2511</code>)
              and state all-party consent statutes (including CA, PA, FL, IL, MD, MA, MT, NH, WA, CT, MI, NV, OR, DE) require explicit
              pre-recording caller disclosure and consent.
            </p>
            <p className="text-[11px] text-amber-800 flex items-center gap-1.5 pt-0.5">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Transcripts:</strong> Persisted for inbound telephony bridge calls and browser text chat. Browser live-voice demo sessions stream directly to Gemini Live and do not persist turn-by-turn transcripts unless a tool action occurs.
              </span>
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">
          {actionError}
        </div>
      )}

      {/* Call History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-blue-600" />
              <span>Inbound Call History &amp; Lifecycle Records</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified call records, lifecycle events, outcomes, and persisted transcripts scoped to your contractor organization.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {calls.length} {calls.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {calls.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-800">No Persisted Call Records Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Inbound telephone calls and receptionist chat sessions will appear here with real timestamps, outcomes, and lifecycle audit trails.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Caller</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Requested Service</th>
                  <th className="py-3 px-4">Related Lead</th>
                  <th className="py-3 px-4">Transcript</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {calls.map((call) => {
                  const isExpanded = expandedCallId === call.id;
                  const detail = callDetails[call.id];
                  const startedDate = new Date(call.startedAt);
                  const formattedDate = Number.isNaN(startedDate.getTime())
                    ? call.startedAt
                    : `${startedDate.toLocaleDateString()} ${startedDate.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`;

                  return (
                    <React.Fragment key={call.id}>
                      <tr className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-900">
                          <div>{formattedDate}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {call.channel === 'telephony' ? 'Telephony / Voice' : 'Web Chat'}
                            {call.callSid ? ` · ${call.callSid.slice(0, 12)}` : ''}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {call.callerName || call.callerPhone ? (
                            <div>
                              {call.callerName && (
                                <div className="font-semibold text-slate-900">{call.callerName}</div>
                              )}
                              <div className="text-slate-600 font-mono text-[11px]">
                                {call.callerPhone || 'Phone not provided'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Caller ID unavailable</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatDuration(call.durationSeconds)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getOutcomeBadgeClasses(
                              call.outcome
                            )}`}
                          >
                            {call.outcome === 'failed' || call.outcome === 'missed' ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            <span>{call.outcomeLabel}</span>
                          </span>
                          {call.failureReason && (
                            <div className="text-[11px] text-red-600 mt-1 max-w-xs">
                              Reason: {call.failureReason}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-700">
                          {call.requestedService ? (
                            <span className="font-medium text-slate-800">{call.requestedService}</span>
                          ) : (
                            <span className="text-slate-400 italic">Not captured</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {call.relatedLead ? (
                            <div className="space-y-0.5">
                              <Link
                                href="/leads"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold"
                              >
                                <span>{call.relatedLead.customerName || 'Lead Record'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                              <div className="text-[11px] text-slate-500">
                                {call.relatedLead.urgency} · {call.relatedLead.status}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {call.transcriptStatus === 'complete' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              <span>Saved ({call.transcriptCount} turns)</span>
                            </span>
                          )}
                          {call.transcriptStatus === 'partial' && (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              <span>Partial ({call.transcriptCount} turns)</span>
                            </span>
                          )}
                          {call.transcriptStatus === 'unavailable' && (
                            <span className="text-slate-400 italic">Not recorded</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleCallDetail(call.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition"
                          >
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={8} className="p-4 sm:p-6 border-t border-slate-200">
                            {loadingCallId === call.id ? (
                              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                <span>Loading call transcript and lifecycle events...</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Persisted Transcript Section */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                      Persisted Call Transcript ({detail?.call.transcriptStatus ?? call.transcriptStatus})
                                    </h4>
                                    {isRealContractor && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={actionBusyId === call.id}
                                          onClick={() => handleRedactPii(call.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md transition disabled:opacity-50"
                                        >
                                          <EyeOff className="h-3 w-3" />
                                          <span>Redact PII</span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionBusyId === call.id}
                                          onClick={() => handleDeleteCall(call.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-md transition disabled:opacity-50"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          <span>Delete Record</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {detail && detail.transcripts.length > 0 ? (
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2 max-h-64 overflow-y-auto">
                                      {detail.transcripts.map((msg) => (
                                        <div
                                          key={msg.id}
                                          className={`p-2 rounded-lg text-xs ${
                                            msg.sender === 'ai'
                                              ? 'bg-blue-50/70 text-slate-800 border border-blue-100'
                                              : 'bg-slate-100 text-slate-900'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                            <span>{msg.sender === 'ai' ? 'AERIS Receptionist' : 'Caller'}</span>
                                            {msg.incomplete && (
                                              <span className="text-amber-700">Partial / Interrupted</span>
                                            )}
                                          </div>
                                          <p className="whitespace-pre-wrap">{msg.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-xs text-slate-500">
                                      No turn-by-turn transcript messages were persisted for this session.
                                    </div>
                                  )}
                                </div>

                                {/* Lifecycle Audit Trail */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                    Call Lifecycle Events ({detail?.lifecycleEvents?.length ?? call.lifecycleEvents.length})
                                  </h4>
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2 max-h-64 overflow-y-auto">
                                    {(detail?.lifecycleEvents ?? call.lifecycleEvents).length > 0 ? (
                                      (detail?.lifecycleEvents ?? call.lifecycleEvents).map((ev) => (
                                        <div
                                          key={ev.id}
                                          className="flex items-start justify-between gap-2 border-b border-slate-100 last:border-0 pb-2 last:pb-0 text-xs"
                                        >
                                          <div>
                                            <span className="font-semibold text-slate-800">{ev.label}</span>
                                            <span className="ml-2 text-[11px] font-mono text-slate-400">
                                              ({ev.lifecycleEvent || ev.eventType})
                                            </span>
                                          </div>
                                          <span className="text-[11px] text-slate-400 font-mono shrink-0">
                                            {new Date(ev.createdAt).toLocaleTimeString([], {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              second: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs text-slate-400 italic">No lifecycle events recorded.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
