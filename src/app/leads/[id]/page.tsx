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
  ShieldCheck,
  Check,
} from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

interface LeadDetailData {
  id: string;
  customer_name: string;
  phone: string;
  service_address: string;
  city_area?: string | null;
  service_type: string;
  reported_issue: string;
  urgency: 'normal' | 'urgent' | 'emergency';
  status: 'new' | 'qualified' | 'appointment_requested' | 'transferred' | 'completed';
  source: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AppointmentData {
  id: string;
  requested_date: string;
  requested_slot: string;
  status: string;
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
  messages: MessageData[];
  auditEvents: AuditEventData[];
}

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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

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
        if (data.success) {
          setLead(data.lead);
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

  const handleMarkCompleted = async () => {
    if (!lead || lead.status === 'completed') return;
    setUpdatingStatus(true);
    setStatusSuccess(null);
    try {
      const res = await fetch(`/api/contractor/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLead(data.lead);
        setStatusSuccess('Lead marked as Completed.');
        setTimeout(() => setStatusSuccess(null), 3500);
      } else {
        alert(data.error || 'Failed to update lead status.');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('A network error occurred.');
    } finally {
      setUpdatingStatus(false);
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
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'appointment_requested':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Calendar className="h-3.5 w-3.5 text-blue-600" />
            <span>Appointment Requested</span>
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
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar currentRoute="dashboard" />
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Loading lead record...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar currentRoute="dashboard" />
        <main className="flex-1 flex items-center justify-center py-20 px-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-2xs">
            <div className="h-12 w-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Record Unavailable</h2>
            <p className="text-xs text-slate-600">{error || 'Lead could not be found.'}</p>
            <div className="pt-2">
              <Link
                href="/leads"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Leads List</span>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar currentRoute="dashboard" />

      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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
                <span className="text-slate-800 font-semibold">{lead.customer_name}</span>
              </div>

              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {lead.customer_name}
                </h1>
                {getStatusBadge(lead.status)}
                {getUrgencyBadge(lead.urgency)}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              {lead.status !== 'completed' ? (
                <button
                  type="button"
                  onClick={handleMarkCompleted}
                  disabled={updatingStatus}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  {updatingStatus ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Mark Completed</span>
                    </>
                  )}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Ticket Completed</span>
                </span>
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

          {/* Main Content Layout: 2 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Lead & Appointment Information */}
            <div className="lg:col-span-1 space-y-6">
              {/* Customer Profile Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <User className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Customer Details</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">Phone Number</span>
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-blue-600 font-semibold text-sm hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{lead.phone}</span>
                    </a>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">Service Address</span>
                    <p className="text-slate-800 font-semibold mt-0.5 leading-relaxed">
                      {lead.service_address}
                    </p>
                    {lead.city_area && (
                      <span className="inline-block mt-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        Area: {lead.city_area}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Lead Source</span>
                      <span className="font-semibold text-slate-700 capitalize">
                        {lead.source?.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Received At</span>
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
                    <span className="text-slate-500 font-medium block">Requested Service</span>
                    <span className="font-bold text-slate-800 text-sm">{lead.service_type}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">Reported Problem Description</span>
                    <p className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed font-normal">
                      {lead.reported_issue}
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

                {appointments.length > 0 ? (
                  <div className="space-y-3 text-xs">
                    {appointments.map((appt) => (
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
                        <p className="text-[11px] text-slate-500">
                          Requested via AERIS AI • Dispatcher follow-up pending
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <p>No appointment requested yet during this intake call.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right 2 Columns: Conversation Transcript & AI Action Audit Timeline */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Inbound Conversation & AI Actions
                    </h3>
                  </div>

                  {conversation && (
                    <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded">
                      Channel: {conversation.channel}
                    </span>
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
                                    {isAI ? 'AERIS AI Receptionist' : lead.customer_name}
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
      </main>

      <Footer />
    </div>
  );
}
