'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  User,
  Phone,
  MapPin,
  Wrench,
  Loader2,
  CalendarCheck,
  ChevronRight,
  X,
  ExternalLink,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

interface AppointmentRecord {
  id: string;
  leadId: string;
  customerName: string;
  phone: string;
  serviceAddress: string;
  serviceType: string;
  slot: string;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
  urgency: 'normal' | 'urgent' | 'emergency';
  createdAt: string;
  notes?: string;
}

// Sample preview appointments for demo mode
const DEMO_APPOINTMENTS: AppointmentRecord[] = [
  {
    id: 'appt-1',
    leadId: 'demo-lead-1',
    customerName: 'Robert Vance',
    phone: '(214) 555-0199',
    serviceAddress: '4820 Elm Street, Dallas, TX',
    serviceType: 'AC Repair',
    slot: 'Tomorrow 9:00 AM – 11:00 AM',
    status: 'requested',
    urgency: 'urgent',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    notes: 'AC blowing warm air upstairs, compressor humming.',
  },
  {
    id: 'appt-2',
    leadId: 'demo-lead-2',
    customerName: 'Linda Sterling',
    phone: '(972) 555-4421',
    serviceAddress: '1204 Oak Ridge Dr, Plano, TX',
    serviceType: 'HVAC Maintenance',
    slot: 'Friday 1:00 PM – 3:00 PM',
    status: 'confirmed',
    urgency: 'normal',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    notes: 'Annual heat pump pre-season tune-up.',
  },
  {
    id: 'appt-3',
    leadId: 'demo-lead-3',
    customerName: 'Marcus Bennett',
    phone: '(817) 555-8832',
    serviceAddress: '731 Meadowbrook Way, Fort Worth, TX',
    serviceType: 'Emergency Inspection',
    slot: 'Today 4:00 PM – 6:00 PM',
    status: 'requested',
    urgency: 'emergency',
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    notes: 'No cooling in home with elderly resident, 96°F indoor reading.',
  },
];

export default function AppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAppt, setSelectedAppt] = useState<AppointmentRecord | null>(null);
  const [isRealContractor, setIsRealContractor] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const authRes = await fetch('/api/auth/status');
      const authData = await authRes.json();
      const real = Boolean(authData.authenticated && authData.hasBusiness);
      setIsRealContractor(real);

      if (real) {
        // Fetch leads that have requested appointments
        const leadsRes = await fetch('/api/contractor/leads?limit=50');
        if (leadsRes.ok) {
          const data = await leadsRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const apptList: AppointmentRecord[] = (data.leads || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((l: any) => l.preferred_appointment_window || l.appointment || l.status === 'appointment_requested')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((l: any) => ({
              id: l.appointment?.id || `appt-${l.id}`,
              leadId: l.id,
              customerName: l.customer_name || 'Caller',
              phone: l.phone || 'Pending',
              serviceAddress: l.service_address || l.city_area || 'Dallas, TX',
              serviceType: l.service_type || 'HVAC Service',
              slot: l.appointment?.requested_slot || l.preferred_appointment_window || 'Next Available Slot',
              status: l.status === 'converted' || l.appointment?.status === 'confirmed' ? 'confirmed' : 'requested',
              urgency: l.urgency || 'normal',
              createdAt: l.created_at,
              notes: l.reported_issue || '',
            }));
          setAppointments(apptList);
        } else {
          setAppointments(DEMO_APPOINTMENTS);
        }
      } else {
        setAppointments(DEMO_APPOINTMENTS);
      }
    } catch {
      setAppointments(DEMO_APPOINTMENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleUpdateStatus = async (
    appt: AppointmentRecord,
    nextStatus: 'confirmed' | 'cancelled' | 'completed'
  ) => {
    // If real contractor, patch the lead record status
    if (isRealContractor) {
      try {
        const leadStatusMap = {
          confirmed: 'converted',
          cancelled: 'closed_not_proceeding',
          completed: 'completed',
        };
        await fetch(`/api/contractor/leads/${encodeURIComponent(appt.leadId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: leadStatusMap[nextStatus] }),
        });
      } catch (err) {
        console.error('Failed to update lead status:', err);
      }
    }

    setAppointments((prev) =>
      prev.map((a) => (a.id === appt.id ? { ...a, status: nextStatus } : a))
    );
    setSelectedAppt(null);
    setActionSuccessMessage(`Appointment status updated to ${nextStatus.toUpperCase()}.`);
    setTimeout(() => setActionSuccessMessage(null), 3000);
  };

  const filteredAppointments = appointments.filter((appt) => {
    const matchesSearch =
      appt.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.phone.includes(searchTerm) ||
      appt.serviceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.serviceAddress.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || appt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AppShell pageTitle="Appointment Requests" badge="DISPATCH QUEUE">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-cyan-400 text-xs font-semibold mb-2 border border-blue-500/20">
              <Calendar className="h-3.5 w-3.5" />
              <span>Contractor Dispatch Queue</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
              Appointment Requests
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 max-w-2xl leading-relaxed">
              Customer inspection windows captured by AERIS Receptionist. All newly requested
              appointments remain <strong>Pending Confirmation</strong> until verified by your
              dispatch team.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--muted)] font-mono">
              Total Queued:{' '}
              <strong className="text-[var(--foreground)]">{appointments.length}</strong>
            </span>
          </div>
        </div>

        {/* Action success alert */}
        {actionSuccessMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* Truthful Status Notice */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Appointment Confirmation Policy:</strong> Customers are informed that preferred
            time slots are tentative requests. Contractors must contact the customer to confirm
            travel windows and technician availability before dispatching.
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search by customer name, phone, or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2 border border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--foreground)] rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-[var(--muted)]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] font-semibold text-[var(--muted)] mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            {['all', 'requested', 'confirmed', 'completed', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-[var(--surface-raised)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {st === 'requested' ? 'Pending' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Appointments Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
            <p className="text-xs text-[var(--muted)]">Loading appointment queue...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] p-12 text-center space-y-3">
            <CalendarCheck className="h-10 w-10 text-[var(--muted)] mx-auto opacity-50" />
            <h3 className="text-sm font-bold text-[var(--foreground)]">No Appointments Found</h3>
            <p className="text-xs text-[var(--muted)] max-w-sm mx-auto">
              No appointments matched your search or filter. When callers request inspections via
              AERIS Receptionist, they appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAppointments.map((appt) => {
              const isConfirmed = appt.status === 'confirmed';
              const isRequested = appt.status === 'requested';
              const isCancelled = appt.status === 'cancelled';

              return (
                <div
                  key={appt.id}
                  className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] hover:border-blue-500/40 p-5 shadow-sm transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-sm text-[var(--foreground)]">
                          {appt.customerName}
                        </h3>
                        <p className="text-xs text-[var(--muted)] font-mono mt-0.5">{appt.phone}</p>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          isConfirmed
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : isRequested
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : isCancelled
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-blue-500/10 text-blue-600 dark:text-cyan-400 border-blue-500/30'
                        }`}
                      >
                        {isRequested ? 'Pending Confirmation' : appt.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-[var(--foreground)] font-medium bg-[var(--surface-raised)] p-2.5 rounded-xl border border-[var(--surface-border)]">
                        <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="truncate">{appt.slot}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[var(--muted)]">
                        <Wrench className="h-3.5 w-3.5 shrink-0" />
                        <span>{appt.serviceType}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[var(--muted)]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{appt.serviceAddress}</span>
                      </div>

                      {appt.notes && (
                        <p className="text-[11px] text-[var(--muted)] bg-[var(--surface-raised)]/60 p-2 rounded-lg italic line-clamp-2">
                          &quot;{appt.notes}&quot;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--surface-border)] flex items-center justify-between gap-2">
                    <Link
                      href={`/leads/${appt.leadId}`}
                      className="text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <span>View Lead</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {isRequested && (
                        <button
                          onClick={() => handleUpdateStatus(appt, 'confirmed')}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-xs"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedAppt(appt)}
                        className="px-2.5 py-1 text-xs font-medium bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] text-[var(--foreground)] border border-[var(--surface-border)] rounded-lg transition"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Manage Appointment Modal */}
        {selectedAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-[var(--surface-border)]">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--surface-border)]">
                <h3 className="font-bold text-base text-[var(--foreground)]">
                  Manage Appointment
                </h3>
                <button
                  onClick={() => setSelectedAppt(null)}
                  className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[var(--muted)] block text-[11px]">Customer</span>
                  <p className="font-bold text-sm text-[var(--foreground)]">
                    {selectedAppt.customerName}
                  </p>
                  <p className="text-[var(--muted)] font-mono">{selectedAppt.phone}</p>
                </div>

                <div className="p-3 bg-[var(--surface-raised)] rounded-xl border border-[var(--surface-border)]">
                  <span className="text-[var(--muted)] block text-[11px] mb-1">
                    Requested Window
                  </span>
                  <p className="font-semibold text-blue-600 dark:text-cyan-400">
                    {selectedAppt.slot}
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    Update Appointment Status:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt, 'confirmed')}
                      className="py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt, 'completed')}
                      className="py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition"
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt, 'cancelled')}
                      className="py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
