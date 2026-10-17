'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  Calendar,
  Phone,
  Clock,
  AlertTriangle,
  Flame,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

interface LeadItem {
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
  created_at: string;
  updated_at?: string;
  appointment?: {
    id: string;
    requested_date: string;
    requested_slot: string;
    status: string;
    confirmation_message?: string;
  } | null;
}

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Appointment Requested', value: 'appointment_requested' },
  { label: 'Converted', value: 'converted' },
  { label: 'Closed / Not Proceeding', value: 'closed_not_proceeding' },
  { label: 'Transferred', value: 'transferred' },
  { label: 'Completed', value: 'completed' },
];

const URGENCY_OPTIONS = [
  { label: 'All Urgencies', value: '' },
  { label: 'Normal', value: 'normal' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'Emergency', value: 'emergency' },
];

export default function LeadsManagementPage() {
  const router = useRouter();

  // State
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const limit = 10;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', limit.toString());
      if (statusFilter) params.set('status', statusFilter);
      if (urgencyFilter) params.set('urgency', urgencyFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/contractor/leads?${params.toString()}`);
      if (res.status === 401) {
        router.push('/login?redirect=/leads');
        return;
      }
      if (res.status === 403) {
        router.push('/onboarding');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setLeads(data.leads || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalLeads(data.pagination?.total || 0);
      } else {
        setError(data.error || 'Failed to load leads.');
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
      setError('A network error occurred while loading leads.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, urgencyFilter, debouncedSearch, router]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'emergency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <Flame className="h-3 w-3" />
            <span>Emergency</span>
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-3 w-3" />
            <span>Urgent</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/10 text-[var(--muted)] border border-slate-500/20">
            <span>Normal</span>
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'converted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" />
            <span>Converted</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" />
            <span>Completed</span>
          </span>
        );
      case 'closed_not_proceeding':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-[var(--muted)] border border-slate-500/30">
            <span>Closed</span>
          </span>
        );
      case 'appointment_requested':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/30">
            <Calendar className="h-3 w-3" />
            <span>Appt Requested</span>
          </span>
        );
      case 'contacted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
            <Phone className="h-3 w-3" />
            <span>Contacted</span>
          </span>
        );
      case 'qualified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
            <Sparkles className="h-3 w-3" />
            <span>Qualified</span>
          </span>
        );
      case 'transferred':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <PhoneCall className="h-3 w-3" />
            <span>Transferred</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20">
            <span>New</span>
          </span>
        );
    }
  };

  return (
    <AppShell pageTitle="Leads Management" badge="CRM WORKSPACE">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-blue-500 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Contractor Dashboard</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
                Lead Management
              </h1>
              <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Live Intake Workspace</span>
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Real-time qualified customer leads and technician appointment requests captured by AERIS Receptionist.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-xs font-medium text-[var(--foreground)] bg-[var(--surface-raised)] border border-[var(--surface-border)] hover:bg-[var(--surface-border)] px-3.5 py-2 rounded-xl transition"
            >
              Contractor Settings
            </Link>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone number, or street address..."
                className="w-full text-xs pl-9 pr-4 py-2 border border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--foreground)] rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-[var(--muted)] transition"
              />
            </div>

            {/* Urgency Filter Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={urgencyFilter}
                onChange={(e) => {
                  setUrgencyFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs border border-[var(--surface-border)] rounded-xl px-3 py-2 bg-[var(--surface-raised)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-[var(--surface-border)] pt-3">
            <span className="text-[11px] font-semibold text-[var(--muted)] mr-1 flex items-center gap-1 shrink-0">
              <Filter className="h-3 w-3" /> Status:
            </span>
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(opt.value);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[var(--surface-raised)] text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lead Table / Results */}
        <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
              <p className="text-xs text-[var(--muted)]">Loading contractor leads...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center space-y-3">
              <div className="h-10 w-10 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium max-w-sm mx-auto">{error}</p>
              <button
                onClick={fetchLeads}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--surface-border)] text-xs font-semibold text-[var(--foreground)] rounded-xl hover:bg-[var(--surface-border)] transition"
              >
                <span>Retry</span>
              </button>
            </div>
          ) : leads.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="h-12 w-12 bg-[var(--surface-raised)] rounded-2xl flex items-center justify-center mx-auto text-[var(--muted)]">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">No Leads Found</h3>
              <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
                {debouncedSearch || statusFilter || urgencyFilter
                  ? 'No leads matched your filter criteria. Try adjusting your filters or search keywords.'
                  : 'No customer leads recorded yet. As AERIS Receptionist answers inbound inquiries, qualified tickets and appointment requests will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-raised)] border-b border-[var(--surface-border)] text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">City / Area</th>
                    <th className="py-3 px-4">Urgency</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Received</th>
                    <th className="py-3 px-4">Appointment</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--surface-border)]/50 text-xs">
                  {leads.map((lead) => {
                    const requestedSlot =
                      lead.appointment?.requested_slot || lead.preferred_appointment_window || null;

                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-[var(--surface-raised)]/60 transition group cursor-pointer"
                        onClick={() => router.push(`/leads/${lead.id}`)}
                      >
                        <td className="py-3.5 px-4 font-semibold text-[var(--foreground)]">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="hover:text-blue-500 transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {lead.customer_name || (
                              <span className="italic text-[var(--muted)] font-normal">
                                Name not provided
                              </span>
                            )}
                          </Link>
                          {lead.reported_issue && (
                            <p className="text-[11px] text-[var(--muted)] font-normal line-clamp-1 mt-0.5">
                              {lead.reported_issue}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[var(--foreground)] whitespace-nowrap">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-blue-500 transition"
                            >
                              {lead.phone}
                            </a>
                          ) : (
                            <span className="text-[11px] italic text-[var(--muted)] font-sans">
                              Not provided
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--foreground)] font-medium whitespace-nowrap">
                          {lead.service_type || 'HVAC Service'}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--muted)] whitespace-nowrap">
                          {lead.city_area || lead.service_address || (
                            <span className="text-[11px] italic text-[var(--muted)]">
                              Not provided
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getUrgencyBadge(lead.urgency)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getStatusBadge(lead.status)}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--muted)] whitespace-nowrap">
                          {new Date(lead.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          <span className="text-[11px] font-mono text-[var(--muted)]">
                            {new Date(lead.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {requestedSlot ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-cyan-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                <Calendar className="h-3 w-3" />
                                <span>{requestedSlot}</span>
                              </span>
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                Confirmation required
                              </p>
                            </div>
                          ) : (
                            <span className="text-[var(--muted)] text-[11px]">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <Link
                            href={`/leads/${lead.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline transition"
                          >
                            <span>View</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && totalLeads > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-raised)] border-t border-[var(--surface-border)] text-xs text-[var(--muted)]">
              <div>
                Showing{' '}
                <span className="font-semibold text-[var(--foreground)]">
                  {(currentPage - 1) * limit + 1}–{Math.min(currentPage * limit, totalLeads)}
                </span>{' '}
                of <span className="font-semibold text-[var(--foreground)]">{totalLeads}</span> leads
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] disabled:opacity-40 disabled:cursor-not-allowed transition font-medium text-[var(--foreground)]"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                <span className="px-2 font-medium font-mono">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] disabled:opacity-40 disabled:cursor-not-allowed transition font-medium text-[var(--foreground)]"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
