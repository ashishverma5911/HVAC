'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  User,
  AlertTriangle,
  Flame,
  Bot,
  MessageSquare,
  Wrench,
  Loader2,
  PhoneCall,
  Sparkles,
  Check,
  FileText,
  Plus,
  Send,
  ClipboardList,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

const APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE =
  'Appointment requested — contractor confirmation required.';

interface InternalNoteItem {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

interface ContactAttemptItem {
  id: string;
  method: 'phone' | 'sms' | 'email' | 'in_person';
  outcome: 'reached' | 'voicemail' | 'no_answer' | 'scheduled' | 'other';
  summary: string;
  recordedBy: string;
  timestamp: string;
}

interface NextFollowUpData {
  action: string;
  dueAt?: string | null;
  assignedTo?: string | null;
  completed?: boolean;
  updatedAt: string;
}

interface HumanEscalationData {
  escalationMode: 'live_transfer' | 'callback_request';
  liveTransferConnected: boolean;
  callbackRequested: boolean;
  reason: string;
  urgency: string;
  summary: string;
  transferNumber?: string | null;
  callbackInstructions?: string | null;
  requestedAt: string;
}

interface LeadDetailData {
  id: string;
  customer_name: string;
  phone: string;
  service_address: string;
  city_area?: string | null;
  service_type: string;
  reported_issue: string;
  urgency: 'normal' | 'urgent' | 'emergency';
  status:
    | 'new'
    | 'contacted'
    | 'qualified'
    | 'appointment_requested'
    | 'converted'
    | 'closed_not_proceeding'
    | 'transferred'
    | 'completed';
  source: string;
  source_call_id?: string | null;
  preferred_appointment_window?: string | null;
  appointment_confirmation_message?: string;
  internal_notes?: InternalNoteItem[];
  contact_attempts?: ContactAttemptItem[];
  next_follow_up?: NextFollowUpData | null;
  human_escalation?: HumanEscalationData | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AppointmentData {
  id: string;
  requested_date: string;
  requested_slot: string;
  status: string;
  confirmation_message?: string;
  notes?: string | null;
  created_at: string;
}

interface MessageData {
  id: string;
  sender: 'customer' | 'ai' | 'system';
  text: string;
  created_at: string;
}

interface AuditEventData {
  id: string;
  event_type: string;
  payload: {
    tool?: string;
    summary?: string;
    status?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

interface ConversationData {
  id: string;
  channel: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  external_call_sid?: string | null;
  caller_identifier?: string | null;
  called_number?: string | null;
  duration_seconds?: number | null;
  messages: MessageData[];
  auditEvents: AuditEventData[];
}

const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'appointment_requested', label: 'Appointment Requested' },
  { value: 'converted', label: 'Converted' },
  { value: 'closed_not_proceeding', label: 'Closed / Not Proceeding' },
];

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const leadId = resolvedParams.id;

  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Follow-up & Status State
  const [selectedStatus, setSelectedStatus] = useState<string>('new');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Internal Note Form
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Contact Attempt Form
  const [attemptMethod, setAttemptMethod] = useState<'phone' | 'sms' | 'email' | 'in_person'>('phone');
  const [attemptOutcome, setAttemptOutcome] = useState<
    'reached' | 'voicemail' | 'no_answer' | 'scheduled' | 'other'
  >('reached');
  const [attemptSummary, setAttemptSummary] = useState('');
  const [savingAttempt, setSavingAttempt] = useState(false);

  // Next Follow-up Form
  const [followUpAction, setFollowUpAction] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  useEffect(() => {
    async function loadLead() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contractor/leads/${leadId}`);
        if (res.status === 401) {
          router.push(`/login?redirect=/leads/${leadId}`);
          return;
        }
        if (res.status === 403) {
          router.push('/onboarding');
          return;
        }
        if (res.status === 404) {
          setError('Lead not found or does not belong to your organization.');
          return;
        }

        const data = await res.json();
        if (data.success && data.lead) {
          setLead(data.lead);
          setSelectedStatus(data.lead.status || 'new');
          if (data.lead.next_follow_up?.action) {
            setFollowUpAction(data.lead.next_follow_up.action);
            setFollowUpDueAt(data.lead.next_follow_up.dueAt || '');
          }
          setAppointments(data.appointments || []);
          setConversation(data.conversation || null);
        } else {
          setError(data.error || 'Failed to retrieve lead details.');
        }
      } catch (err) {
        console.error('Failed to load lead detail:', err);
        setError('A network error occurred while loading lead details.');
      } finally {
        setLoading(false);
      }
    }

    loadLead();
  }, [leadId, router]);

  const showBanner = (message: string) => {
    setStatusSuccess(message);
    setActionError(null);
    setTimeout(() => setStatusSuccess(null), 4000);
  };

  const handleStatusChange = async (targetStatus: string) => {
    if (!lead) return;
    setUpdatingStatus(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLead(data.lead);
        setSelectedStatus(data.lead.status);
        showBanner(`Lead status updated to ${targetStatus.replace(/_/g, ' ')}.`);
      } else {
        setActionError(data.error || 'Failed to update lead status.');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      setActionError('A network error occurred while updating status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !noteInput.trim()) return;
    setSavingNote(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNote: noteInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLead(data.lead);
        setNoteInput('');
        showBanner('Internal follow-up note saved.');
      } else {
        setActionError(data.error || 'Failed to save internal note.');
      }
    } catch (err) {
      console.error('Error saving note:', err);
      setActionError('A network error occurred while saving note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleRecordContactAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !attemptSummary.trim()) return;
    setSavingAttempt(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactAttempt: {
            method: attemptMethod,
            outcome: attemptOutcome,
            summary: attemptSummary.trim(),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLead(data.lead);
        setSelectedStatus(data.lead.status);
        setAttemptSummary('');
        showBanner('Customer contact attempt recorded.');
      } else {
        setActionError(data.error || 'Failed to record contact attempt.');
      }
    } catch (err) {
      console.error('Error recording contact attempt:', err);
      setActionError('A network error occurred while recording contact attempt.');
    } finally {
      setSavingAttempt(false);
    }
  };

  const handleSaveNextFollowUp = async (e: React.FormEvent, markCompleted = false) => {
    e.preventDefault();
    if (!lead || !followUpAction.trim()) return;
    setSavingFollowUp(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contractor/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextFollowUp: {
            action: followUpAction.trim(),
            dueAt: followUpDueAt.trim() || null,
            completed: markCompleted,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLead(data.lead);
        showBanner(markCompleted ? 'Next follow-up action marked completed.' : 'Next follow-up action updated.');
      } else {
        setActionError(data.error || 'Failed to update next follow-up action.');
      }
    } catch (err) {
      console.error('Error saving next follow-up:', err);
      setActionError('A network error occurred while updating follow-up action.');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'emergency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <Flame className="h-3.5 w-3.5 text-red-600" />
            <span>Emergency</span>
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Urgent</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <span>Normal</span>
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'converted':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Converted</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'closed_not_proceeding':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300">
            <span>Closed / Not Proceeding</span>
          </span>
        );
      case 'appointment_requested':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Calendar className="h-3.5 w-3.5 text-blue-600" />
            <span>Appointment Requested</span>
          </span>
        );
      case 'contacted':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <Phone className="h-3.5 w-3.5 text-sky-600" />
            <span>Contacted</span>
          </span>
        );
      case 'qualified':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" />
            <span>Qualified</span>
          </span>
        );
      case 'transferred':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
            <span>Transferred</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            <span>New</span>
          </span>
        );
    }
  };

  if (loading) {
    return (
      <AppShell pageTitle="Lead Details" badge="LOADING">
        <div className="py-20 flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
          <p className="text-sm font-medium text-[var(--muted)]">Loading lead record...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !lead) {
    return (
      <AppShell pageTitle="Lead Details" badge="ERROR">
        <div className="py-20 flex flex-col items-center justify-center px-4">
          <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl p-8 text-center space-y-4 shadow-sm">
            <div className="h-12 w-12 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Record Unavailable</h2>
            <p className="text-xs text-[var(--muted)]">{error || 'Lead could not be found.'}</p>
            <div className="pt-2">
              <Link
                href="/leads"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Leads List</span>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const displayCustomerName = lead.customer_name || 'Customer name not provided';
  const internalNotes = lead.internal_notes || [];
  const contactAttempts = lead.contact_attempts || [];
  const humanEscalation = lead.human_escalation || null;

  return (
    <AppShell pageTitle={`Lead: ${displayCustomerName}`} badge="CRM LEAD">
      <div className="max-w-7xl mx-auto space-y-6">
          {/* Breadcrumb & Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-500">
                <Link href="/dashboard" className="hover:text-blue-600 transition">
                  Dashboard
                </Link>
                <span>/</span>
                <Link href="/leads" className="hover:text-blue-600 transition">
                  Leads
                </Link>
                <span>/</span>
                <span className="text-slate-800 font-semibold">{displayCustomerName}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {displayCustomerName}
                </h1>
                {getStatusBadge(lead.status)}
                {getUrgencyBadge(lead.urgency)}
              </div>
            </div>

            {/* Status & Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500">Status:</span>
                <select
                  value={selectedStatus}
                  disabled={updatingStatus}
                  onChange={(e) => {
                    const nextStatus = e.target.value;
                    setSelectedStatus(nextStatus);
                    handleStatusChange(nextStatus);
                  }}
                  className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
                >
                  {LEAD_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {lead.status === 'transferred' && (
                    <option value="transferred">Transferred</option>
                  )}
                  {lead.status === 'completed' && (
                    <option value="completed">Completed</option>
                  )}
                </select>
              </div>

              {lead.status !== 'converted' && lead.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange('converted')}
                  disabled={updatingStatus}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  {updatingStatus ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>Mark Converted</span>
                </button>
              )}

              <Link
                href="/leads"
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs transition"
              >
                Back to Leads
              </Link>
            </div>
          </div>

          {statusSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800 font-medium">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Main Content Layout: 3 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Customer Profile, Service Request, Appointment Request, Human Escalation */}
            <div className="lg:col-span-1 space-y-6">
              {/* Customer Profile Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <User className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Customer Details</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">Customer Name</span>
                    {lead.customer_name ? (
                      <span className="text-slate-900 font-semibold text-sm">
                        {lead.customer_name}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Not provided by caller</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">Callback Phone Number</span>
                    {lead.phone ? (
                      <a
                        href={`tel:${lead.phone}`}
                        className="text-blue-600 font-semibold text-sm hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>{lead.phone}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 italic">Not provided by caller</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">
                      Service Address / Service Area
                    </span>
                    {lead.service_address ? (
                      <p className="text-slate-800 font-semibold mt-0.5 leading-relaxed">
                        {lead.service_address}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic mt-0.5">Not provided by caller</p>
                    )}
                    {lead.city_area && (
                      <span className="inline-block mt-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        Area: {lead.city_area}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Source Call ID</span>
                      <span className="font-mono font-medium text-slate-700 break-all">
                        {lead.source_call_id || conversation?.external_call_sid || conversation?.id || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Lead Source</span>
                      <span className="font-semibold text-slate-700 capitalize">
                        {lead.source?.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Created</span>
                      <span className="font-medium text-slate-700">
                        {new Date(lead.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(lead.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Updated</span>
                      <span className="font-medium text-slate-700">
                        {new Date(lead.updated_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(lead.updated_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service & Equipment Request */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Service Request</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">Requested HVAC Service</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {lead.service_type || 'HVAC Service'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">
                      Problem Description
                    </span>
                    <p className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed font-normal">
                      {lead.reported_issue || 'No problem description provided.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Appointment Request Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Appointment Request</h3>
                </div>

                {appointments.length > 0 || lead.preferred_appointment_window ? (
                  <div className="space-y-3 text-xs">
                    {appointments.length > 0 ? (
                      appointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-900">{appt.requested_slot}</span>
                            <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 uppercase tracking-wide">
                              {appt.status}
                            </span>
                          </div>
                          {appt.notes && (
                            <p className="text-[11px] text-blue-700 italic">{appt.notes}</p>
                          )}
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-amber-800">
                            {appt.confirmation_message || APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-900">
                            {lead.preferred_appointment_window}
                          </span>
                          <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 uppercase tracking-wide">
                            requested
                          </span>
                        </div>
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-amber-800">
                          {APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <p>No appointment window requested yet during this intake call.</p>
                  </div>
                )}
              </div>

              {/* Human Escalation / Callback Status Card */}
              {humanEscalation && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 shadow-2xs space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4 text-amber-700" />
                      <h3 className="text-sm font-bold text-amber-900">
                        {humanEscalation.liveTransferConnected
                          ? 'Live Human Transfer'
                          : 'Human Callback Escalation Requested'}
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      {humanEscalation.urgency}
                    </span>
                  </div>
                  <p className="text-amber-900 font-medium">{humanEscalation.summary}</p>
                  {!humanEscalation.liveTransferConnected && (
                    <p className="text-[11px] text-amber-800">
                      Callback requested (live transfer not connected). Please follow up directly with the caller.
                    </p>
                  )}
                  {humanEscalation.transferNumber && (
                    <p className="text-[11px] text-amber-700 font-mono">
                      Escalation Target: {humanEscalation.transferNumber}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right 2 Columns: Human Follow-Up Workspace + Originating Call & Transcript */}
            <div className="lg:col-span-2 space-y-6">
              {/* Human Follow-Up & Dispatcher Workspace */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Human Follow-Up &amp; Dispatcher Actions
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    All follow-up updates are tenant-isolated and persisted
                  </span>
                </div>

                {/* Next Follow-Up Action Tracker */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-600" />
                      <span>Next Follow-Up Action</span>
                    </span>
                    {lead.next_follow_up && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          lead.next_follow_up.completed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {lead.next_follow_up.completed ? 'Completed' : 'Pending Follow-Up'}
                      </span>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => handleSaveNextFollowUp(e, false)}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                  >
                    <input
                      type="text"
                      value={followUpAction}
                      onChange={(e) => setFollowUpAction(e.target.value)}
                      placeholder="e.g., Call customer back to confirm Tuesday morning slot"
                      className="sm:col-span-2 text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={followUpDueAt}
                        onChange={(e) => setFollowUpDueAt(e.target.value)}
                        placeholder="Due window (optional)"
                        className="flex-1 text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={savingFollowUp || !followUpAction.trim()}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
                      >
                        {savingFollowUp ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Record Contact Attempt & Internal Notes Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Contact Attempts Column */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-blue-600" />
                      <span>Contact Attempts ({contactAttempts.length})</span>
                    </h4>

                    <form onSubmit={handleRecordContactAttempt} className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={attemptMethod}
                          onChange={(e) =>
                            setAttemptMethod(
                              e.target.value as 'phone' | 'sms' | 'email' | 'in_person'
                            )
                          }
                          className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                        >
                          <option value="phone">Phone Call</option>
                          <option value="sms">SMS Text</option>
                          <option value="email">Email</option>
                          <option value="in_person">In Person</option>
                        </select>
                        <select
                          value={attemptOutcome}
                          onChange={(e) =>
                            setAttemptOutcome(
                              e.target.value as
                                | 'reached'
                                | 'voicemail'
                                | 'no_answer'
                                | 'scheduled'
                                | 'other'
                            )
                          }
                          className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                        >
                          <option value="reached">Reached Customer</option>
                          <option value="voicemail">Left Voicemail</option>
                          <option value="no_answer">No Answer</option>
                          <option value="scheduled">Appointment Confirmed</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={attemptSummary}
                          onChange={(e) => setAttemptSummary(e.target.value)}
                          placeholder="Log contact outcome summary..."
                          className="flex-1 text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={savingAttempt || !attemptSummary.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Log</span>
                        </button>
                      </div>
                    </form>

                    {contactAttempts.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {contactAttempts.map((att) => (
                          <div
                            key={att.id}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-800 uppercase">
                                {att.method} • {att.outcome.replace('_', ' ')}
                              </span>
                              <span className="text-slate-400">
                                {new Date(att.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-slate-700">{att.summary}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No contact attempts logged yet.
                      </p>
                    )}
                  </div>

                  {/* Internal Notes Column */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      <span>Internal Dispatcher Notes ({internalNotes.length})</span>
                    </h4>

                    <form onSubmit={handleAddInternalNote} className="flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add an internal note for your team..."
                        className="flex-1 text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={savingNote || !noteInput.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                      >
                        <Send className="h-3 w-3" />
                        <span>Add Note</span>
                      </button>
                    </form>

                    {internalNotes.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {internalNotes.map((note) => (
                          <div
                            key={note.id}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-semibold text-slate-600">{note.author}</span>
                              <span>
                                {new Date(note.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                {new Date(note.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-slate-800">{note.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No internal notes added yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Originating Call & Conversation Transcript */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Originating Call &amp; AI Actions
                    </h3>
                  </div>

                  {conversation && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded">
                        Channel: {conversation.channel}
                      </span>
                      {conversation.external_call_sid && (
                        <span className="font-mono text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded">
                          Call SID: {conversation.external_call_sid}
                        </span>
                      )}
                      {typeof conversation.duration_seconds === 'number' && (
                        <span className="font-mono text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded">
                          Duration: {conversation.duration_seconds}s
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  {/* Simplified AI Tool Execution Events (Audit Timeline) */}
                  {conversation?.auditEvents && conversation.auditEvents.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                        <span>AERIS AI Action Audit</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {conversation.auditEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800">
                                {evt.payload?.summary || evt.event_type}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(evt.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <span className="text-[11px] text-blue-600 font-mono">
                              Tool: {evt.payload?.tool || 'action'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript Messages Stream */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-blue-600" />
                      <span>Intake Transcript</span>
                    </h4>

                    {conversation?.messages && conversation.messages.length > 0 ? (
                      <div className="space-y-3 pt-1">
                        {conversation.messages.map((msg) => {
                          const isAI = msg.sender === 'ai';
                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
                            >
                              {isAI && (
                                <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                                  <Bot className="h-4 w-4" />
                                </div>
                              )}

                              <div
                                className={`max-w-xl p-3.5 rounded-2xl text-xs leading-relaxed ${
                                  isAI
                                    ? 'bg-slate-100 text-slate-900 rounded-tl-sm'
                                    : 'bg-blue-600 text-white rounded-tr-sm shadow-2xs'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-4 mb-1">
                                  <span
                                    className={`font-bold text-[11px] ${
                                      isAI ? 'text-blue-700' : 'text-blue-100'
                                    }`}
                                  >
                                    {isAI
                                      ? 'AERIS AI Receptionist'
                                      : lead.customer_name || 'Caller'}
                                  </span>
                                  <span
                                    className={`text-[10px] ${
                                      isAI ? 'text-slate-400' : 'text-blue-200'
                                    }`}
                                  >
                                    {new Date(msg.created_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-line">{msg.text}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-xs text-slate-400 italic">
                        No transcript recorded for this ticket.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  );
}
