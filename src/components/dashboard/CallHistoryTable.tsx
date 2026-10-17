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
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'human_escalation_requested':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'failed':
    case 'missed':
    case 'abandoned':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'completed_no_lead':
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30';
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
      <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                Call Recording &amp; Privacy Safeguards
              </h3>
              <span className="text-[11px] font-semibold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                Audio Recording: Disabled by Default
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              AERIS does not automatically record raw call audio (<code className="font-mono text-[11px] bg-amber-500/20 px-1 py-0.5 rounded text-amber-900 dark:text-amber-200">recordingEnabled: false</code>).
              Before enabling audio recording for any US contractor pilot, federal law (<code className="font-mono text-[11px]">18 U.S.C. § 2511</code>)
              and state all-party consent statutes require explicit pre-recording caller disclosure and consent.
            </p>
            <p className="text-[11px] text-[var(--muted)] flex items-center gap-1.5 pt-0.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>
                <strong>Transcripts:</strong> Persisted for inbound telephony bridge calls and browser text chat. Browser live-voice demo sessions stream directly to Gemini Live and do not persist turn-by-turn transcripts unless a tool action occurs.
              </span>
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3 text-xs text-rose-600 dark:text-rose-400 font-medium">
          {actionError}
        </div>
      )}

      {/* Call History Table */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--surface-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-blue-500" />
              <span>Inbound Call History &amp; Lifecycle Records</span>
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Verified call records, lifecycle events, outcomes, and persisted transcripts scoped to your contractor organization.
            </p>
          </div>
          <span className="text-xs font-medium text-[var(--muted)] font-mono">
            {calls.length} {calls.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {calls.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[var(--foreground)]">No Persisted Call Records Yet</p>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Inbound telephone calls and receptionist chat sessions will appear here with real timestamps, outcomes, and lifecycle audit trails.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--surface-raised)] border-b border-[var(--surface-border)] text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
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
              <tbody className="divide-y divide-[var(--surface-border)]/50 text-xs">
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
                      <tr className="hover:bg-[var(--surface-raised)]/60 transition">
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-[var(--foreground)]">
                          <div>{formattedDate}</div>
                          <div className="text-[11px] text-[var(--muted)] font-mono">
                            {call.channel === 'telephony' ? 'Telephony / Voice' : 'Web Chat'}
                            {call.callSid ? ` · ${call.callSid.slice(0, 12)}` : ''}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {call.callerName || call.callerPhone ? (
                            <div>
                              {call.callerName && (
                                <div className="font-semibold text-[var(--foreground)]">{call.callerName}</div>
                              )}
                              <div className="text-[var(--muted)] font-mono text-[11px]">
                                {call.callerPhone || 'Phone not provided'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[var(--muted)] italic">Caller ID unavailable</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-[var(--foreground)]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[var(--muted)]" />
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
                            <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 max-w-xs">
                              Reason: {call.failureReason}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-[var(--foreground)]">
                          {call.requestedService ? (
                            <span className="font-medium text-[var(--foreground)]">{call.requestedService}</span>
                          ) : (
                            <span className="text-[var(--muted)] italic">Not captured</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {call.relatedLead ? (
                            <div className="space-y-0.5">
                              <Link
                                href="/leads"
                                className="inline-flex items-center gap-1 text-blue-600 dark:text-cyan-400 hover:underline font-semibold"
                              >
                                <span>{call.relatedLead.customerName || 'Lead Record'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                              <div className="text-[11px] text-[var(--muted)]">
                                {call.relatedLead.urgency} · {call.relatedLead.status}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[var(--muted)] italic">None</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {call.transcriptStatus === 'complete' && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              <span>Saved ({call.transcriptCount} turns)</span>
                            </span>
                          )}
                          {call.transcriptStatus === 'partial' && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              <span>Partial ({call.transcriptCount} turns)</span>
                            </span>
                          )}
                          {call.transcriptStatus === 'unavailable' && (
                            <span className="text-[var(--muted)] italic">Not recorded</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleCallDetail(call.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline px-2.5 py-1 rounded-lg hover:bg-blue-500/10 transition"
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
                        <tr className="bg-[var(--surface-raised)]/70">
                          <td colSpan={8} className="p-4 sm:p-6 border-t border-[var(--surface-border)]">
                            {loadingCallId === call.id ? (
                              <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                <span>Loading call transcript and lifecycle events...</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Persisted Transcript Section */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                                      Persisted Call Transcript ({detail?.call.transcriptStatus ?? call.transcriptStatus})
                                    </h4>
                                    {isRealContractor && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={actionBusyId === call.id}
                                          onClick={() => handleRedactPii(call.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                                        >
                                          <EyeOff className="h-3 w-3" />
                                          <span>Redact PII</span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionBusyId === call.id}
                                          onClick={() => handleDeleteCall(call.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          <span>Delete Record</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {detail && detail.transcripts.length > 0 ? (
                                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--surface-border)] p-3 space-y-2 max-h-64 overflow-y-auto">
                                      {detail.transcripts.map((msg) => (
                                        <div
                                          key={msg.id}
                                          className={`p-2.5 rounded-xl text-xs ${
                                            msg.sender === 'ai'
                                              ? 'bg-blue-500/10 text-[var(--foreground)] border border-blue-500/20'
                                              : 'bg-[var(--surface-raised)] text-[var(--foreground)] border border-[var(--surface-border)]'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--muted)] mb-1">
                                            <span>{msg.sender === 'ai' ? 'AERIS Receptionist' : 'Caller'}</span>
                                            {msg.incomplete && (
                                              <span className="text-amber-600 dark:text-amber-400">Partial / Interrupted</span>
                                            )}
                                          </div>
                                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--surface-border)] p-4 text-xs text-[var(--muted)]">
                                      No turn-by-turn transcript messages were persisted for this session.
                                    </div>
                                  )}
                                </div>

                                {/* Lifecycle Audit Trail */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                                    Call Lifecycle Events ({detail?.lifecycleEvents?.length ?? call.lifecycleEvents.length})
                                  </h4>
                                  <div className="bg-[var(--surface)] rounded-xl border border-[var(--surface-border)] p-3 space-y-2 max-h-64 overflow-y-auto">
                                    {(detail?.lifecycleEvents ?? call.lifecycleEvents).length > 0 ? (
                                      (detail?.lifecycleEvents ?? call.lifecycleEvents).map((ev) => (
                                        <div
                                          key={ev.id}
                                          className="flex items-start justify-between gap-2 border-b border-[var(--surface-border)]/50 last:border-0 pb-2 last:pb-0 text-xs"
                                        >
                                          <div>
                                            <span className="font-semibold text-[var(--foreground)]">{ev.label}</span>
                                            <span className="ml-2 text-[11px] font-mono text-[var(--muted)]">
                                              ({ev.lifecycleEvent || ev.eventType})
                                            </span>
                                          </div>
                                          <span className="text-[11px] text-[var(--muted)] font-mono shrink-0">
                                            {new Date(ev.createdAt).toLocaleTimeString([], {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              second: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs text-[var(--muted)] italic">No lifecycle events recorded.</p>
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
