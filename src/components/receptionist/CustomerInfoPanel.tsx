'use client';

import React from 'react';
import { CustomerInfo } from '@/types';
import { formatUrgency } from '@/lib/utils';
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
} from 'lucide-react';

interface CustomerInfoPanelProps {
  info: CustomerInfo;
  leadId?: string | null;
  appointmentId?: string | null;
}

export const CustomerInfoPanel: React.FC<CustomerInfoPanelProps> = ({
  info,
  leadId,
  appointmentId,
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

  const urgencyStyle = formatUrgency(info.urgency);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Customer Information Panel
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {leadId && (
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              {leadId}
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            Real-time Extraction
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            Awaiting Customer Details
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
            As the caller speaks with the receptionist, extracted information will populate here automatically.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between space-y-3 text-xs">
          {/* Top row: Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Customer Name</span>
              </div>
              <p className="font-semibold text-slate-900 truncate">
                {info.name || <span className="text-slate-400 italic">Not provided</span>}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span>Phone Number</span>
              </div>
              <p className="font-semibold text-slate-900 truncate">
                {info.phone || <span className="text-slate-400 italic">Not provided</span>}
              </p>
            </div>
          </div>

          {/* Row 2: Service Address & City / Area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>Service Address</span>
              </div>
              <p className="font-semibold text-slate-900 truncate">
                {info.serviceAddress || <span className="text-slate-400 italic">Not provided</span>}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>City / Area</span>
              </div>
              <p className="font-semibold text-slate-900 truncate">
                {info.city || info.cityOrArea || <span className="text-slate-400 italic">Not provided</span>}
              </p>
            </div>
          </div>

          {/* Service & Urgency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <Wrench className="h-3.5 w-3.5 text-slate-400" />
                <span>Service Type</span>
              </div>
              <p className="font-semibold text-slate-900">
                {info.serviceType || <span className="text-slate-400 italic">Not provided</span>}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
                <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                <span>Urgency</span>
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${urgencyStyle.bg} ${urgencyStyle.text} ${urgencyStyle.border}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${urgencyStyle.dot}`} />
                  {urgencyStyle.label}
                </span>
              </div>
            </div>
          </div>

          {/* Problem Description */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 text-[11px] font-medium">
              <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
              <span>Problem Description</span>
            </div>
            <p className="text-slate-800 text-xs leading-relaxed">
              {info.problemDescription || (
                <span className="text-slate-400 italic">Awaiting issue description...</span>
              )}
            </p>
          </div>

          {/* Preferred Appointment Time */}
          <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200/80">
            <div className="flex items-center gap-1.5 text-blue-700 mb-1 text-[11px] font-medium">
              <Clock className="h-3.5 w-3.5 text-blue-600" />
              <span>Preferred Appointment Time</span>
            </div>
            <p className="font-semibold text-blue-950">
              {info.preferredAppointmentTime || (
                <span className="text-blue-400 italic font-normal">
                  Awaiting preferred schedule window...
                </span>
              )}
            </p>
          </div>

          {/* Capture confirmation indicator */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Form Auto-Populated by AI</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">Summit HVAC CRM Ready</span>
          </div>
        </div>
      )}
    </div>
  );
};
