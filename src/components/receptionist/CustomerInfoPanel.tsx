'use client';

import React from 'react';
import { CustomerInfo, LeadStatus } from '@/types';
import {
  User,
  Phone,
  MapPin,
  Wrench,
  AlertCircle,
  Clock,
  FileText,
  Inbox,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface CustomerInfoPanelProps {
  info: CustomerInfo;
  leadId?: string | null;
  appointmentId?: string | null;
  leadStatus?: LeadStatus;
  onCreateLead?: () => void;
  onRequestAppointment?: () => void;
  isCreatingLead?: boolean;
  isRequestingAppt?: boolean;
}

export const CustomerInfoPanel: React.FC<CustomerInfoPanelProps> = ({
  info,
  leadId,
  appointmentId,
  leadStatus = 'new',
  onCreateLead,
  onRequestAppointment,
  isCreatingLead = false,
  isRequestingAppt = false,
}) => {
  const hasData = Boolean(
    info.name ||
      info.phone ||
      info.serviceAddress ||
      info.city ||
      info.cityOrArea ||
      info.serviceType ||
      info.problemDescription ||
      info.preferredAppointmentTime ||
      leadId
  );

  // Map urgency level to user-friendly labels and badges: Routine, Priority, Emergency
  const getUrgencyConfig = (urgency?: string) => {
    switch (urgency) {
      case 'emergency':
        return {
          label: 'Emergency',
          badgeClass:
            'bg-rose-500/15 text-rose-500 dark:text-rose-400 border-rose-500/30',
          dotClass: 'bg-rose-500',
        };
      case 'urgent':
        return {
          label: 'Priority',
          badgeClass:
            'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-500',
        };
      case 'normal':
      default:
        return {
          label: 'Routine',
          badgeClass:
            'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-500',
        };
    }
  };

  // Determine customer type based on service or notes
  const getCustomerType = () => {
    const text = `${info.serviceType || ''} ${info.problemDescription || ''}`.toLowerCase();
    if (text.includes('commercial') || text.includes('rooftop') || text.includes('warehouse')) {
      return 'Light Commercial';
    }
    return 'Residential';
  };

  const urgencyConfig = getUrgencyConfig(info.urgency);
  const customerType = getCustomerType();

  // Truthful appointment status mapping
  const getAppointmentStatusLabel = () => {
    if (!appointmentId) return 'Not requested';
    if (leadStatus === 'completed') return 'Completed';
    // Strictly truthful: never claims 'Confirmed' unless verified
    return 'Appointment Requested';
  };

  return (
    <div className="rounded-2xl border p-5 flex flex-col h-full transition-colors duration-200
      bg-[var(--surface)] text-[var(--foreground)] border-[var(--surface-border)] shadow-xs
    ">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[var(--surface-border)] mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-cyan-400">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              Customer Information
            </h3>
            <p className="text-[10px] text-[var(--muted)]">Live Extracted Record</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {leadId && (
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
              Lead #{leadId.slice(0, 8)}
            </span>
          )}
          <span className="text-[10px] font-semibold text-blue-600 dark:text-cyan-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
            Live Intake
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-raised)]/50">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 dark:text-cyan-400 flex items-center justify-center mb-2.5">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold text-[var(--foreground)]">
            Awaiting Customer Details
          </p>
          <p className="text-[11px] text-[var(--muted)] mt-1 max-w-[240px]">
            As the caller speaks with AERIS Receptionist, customer details and HVAC symptoms populate here in real time.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between space-y-3.5 text-xs">
          {/* Row 1: Full Name & Phone Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <User className="h-3 w-3 text-blue-500" />
                <span>Customer Name</span>
              </div>
              <p className="font-semibold text-[var(--foreground)] truncate">
                {info.name || <span className="text-[var(--muted)] italic font-normal">Awaiting details</span>}
              </p>
            </div>

            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <Phone className="h-3 w-3 text-cyan-500" />
                <span>Phone Number</span>
              </div>
              <p className="font-semibold text-[var(--foreground)] truncate font-mono">
                {info.phone || <span className="text-[var(--muted)] italic font-normal font-sans">Awaiting details</span>}
              </p>
            </div>
          </div>

          {/* Row 2: Service Address & Customer Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <MapPin className="h-3 w-3 text-rose-500" />
                <span>Service Address</span>
              </div>
              <p className="font-semibold text-[var(--foreground)] truncate">
                {info.serviceAddress || info.city || info.cityOrArea || (
                  <span className="text-[var(--muted)] italic font-normal">Awaiting details</span>
                )}
              </p>
            </div>

            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <Sparkles className="h-3 w-3 text-purple-500" />
                <span>Customer Type</span>
              </div>
              <p className="font-semibold text-[var(--foreground)]">
                {customerType}
              </p>
            </div>
          </div>

          {/* Row 3: HVAC Issue & Urgency Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <Wrench className="h-3 w-3 text-amber-500" />
                <span>HVAC Issue / Service</span>
              </div>
              <p className="font-semibold text-[var(--foreground)] truncate">
                {info.serviceType || info.problemDescription || (
                  <span className="text-[var(--muted)] italic font-normal">Awaiting details</span>
                )}
              </p>
            </div>

            <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
                <AlertCircle className="h-3 w-3 text-emerald-500" />
                <span>Urgency Level</span>
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${urgencyConfig.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${urgencyConfig.dotClass}`} />
                  {urgencyConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Preferred Appointment Time */}
          <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-cyan-400 text-[10px] font-medium uppercase tracking-wider">
                <Clock className="h-3 w-3" />
                <span>Preferred Appointment Time</span>
              </div>
              {appointmentId && (
                <span className="text-[9px] font-mono text-cyan-600 dark:text-cyan-300 font-bold">
                  {getAppointmentStatusLabel()}
                </span>
              )}
            </div>
            <p className="font-semibold text-[var(--foreground)] text-xs">
              {info.preferredAppointmentTime || (
                <span className="text-[var(--muted)] italic font-normal">
                  Awaiting preferred time window...
                </span>
              )}
            </p>
          </div>

          {/* Contextual Actions: Create Lead & Create Appointment Request */}
          <div className="pt-2 border-t border-[var(--surface-border)] space-y-2">
            <div className="flex items-center gap-2">
              {/* Create Lead Action */}
              <button
                onClick={onCreateLead}
                disabled={Boolean(leadId) || isCreatingLead || !info.name}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-150
                  ${
                    leadId
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-default'
                      : !info.name
                      ? 'bg-[var(--surface-raised)] text-[var(--muted)] border border-[var(--surface-border)] cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm hover:from-blue-500 hover:to-cyan-500 active:scale-[0.98]'
                  }
                `}
              >
                {leadId ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Lead Captured</span>
                  </>
                ) : (
                  <>
                    <Wrench className="h-3.5 w-3.5" />
                    <span>{isCreatingLead ? 'Creating Lead...' : 'Create Lead'}</span>
                  </>
                )}
              </button>

              {/* Create Appointment Request Action */}
              <button
                onClick={onRequestAppointment}
                disabled={Boolean(appointmentId) || isRequestingAppt || !leadId}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-150
                  ${
                    appointmentId
                      ? 'bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20 cursor-default'
                      : !leadId
                      ? 'bg-[var(--surface-raised)] text-[var(--muted)] border border-[var(--surface-border)] cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm hover:from-indigo-500 hover:to-blue-500 active:scale-[0.98]'
                  }
                `}
              >
                {appointmentId ? (
                  <>
                    <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Appointment Requested</span>
                  </>
                ) : (
                  <>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{isRequestingAppt ? 'Requesting...' : 'Request Appointment'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[var(--muted)] pt-1">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                <span>Deterministic AI Qualification</span>
              </span>
              <span className="font-mono text-[9px]">AERIS CRM Sync</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
