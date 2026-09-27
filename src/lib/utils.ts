import { LeadStatus, UrgencyLevel } from '@/types';

export function cn(...inputs: Array<string | undefined | null | false>): string {
  return inputs.filter(Boolean).join(' ');
}

export function formatLeadStatus(status: LeadStatus): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'new':
      return {
        label: 'New Lead',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
    case 'qualified':
      return {
        label: 'Qualified',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    case 'appointment_requested':
      return {
        label: 'Appointment Requested',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      };
    case 'transferred':
      return {
        label: 'Transferred / Escalated',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
      };
    case 'completed':
      return {
        label: 'Completed',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
      };
  }
}

export function formatUrgency(urgency: UrgencyLevel): { label: string; bg: string; text: string; border: string; dot: string } {
  switch (urgency) {
    case 'normal':
      return {
        label: 'Normal',
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
      };
    case 'urgent':
      return {
        label: 'Urgent',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300',
        dot: 'bg-amber-500',
      };
    case 'emergency':
      return {
        label: 'Emergency',
        bg: 'bg-rose-50',
        text: 'text-rose-800',
        border: 'border-rose-300',
        dot: 'bg-rose-600 animate-pulse',
      };
  }
}
