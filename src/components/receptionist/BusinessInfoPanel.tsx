'use client';

import React from 'react';
import { summitHvacProfile } from '@/mock/businessData';
import { ContractorBusinessConfig } from '@/lib/ai/contractorConfig';
import { Building2, MapPin, Navigation, Wrench, Clock, ShieldCheck, Info } from 'lucide-react';

interface BusinessInfoPanelProps {
  config?: ContractorBusinessConfig;
  isDemo?: boolean;
}

export const BusinessInfoPanel: React.FC<BusinessInfoPanelProps> = ({
  config,
  isDemo = true,
}) => {
  const businessName = config?.name || summitHvacProfile.name;
  const locationText =
    config && (config.city || config.state || config.address)
      ? [config.city, config.state].filter(Boolean).join(', ') || config.address || summitHvacProfile.location
      : summitHvacProfile.location;
  const serviceAreas =
    config?.serviceAreas && config.serviceAreas.length > 0
      ? config.serviceAreas
      : summitHvacProfile.serviceArea;
  const services =
    config?.servicesOffered && config.servicesOffered.length > 0
      ? config.servicesOffered
      : summitHvacProfile.services;
  const hoursText = config?.businessHours?.weekdays
    ? `Mon-Fri: ${config.businessHours.weekdays}${
        config.businessHours.saturday ? ` | Sat: ${config.businessHours.saturday}` : ''
      }${config.businessHours.sunday ? ` | Sun: ${config.businessHours.sunday}` : ''}`
    : summitHvacProfile.businessHours;
  const emergencySummary = config
    ? config.emergencyServiceEnabled
      ? config.afterHoursInstructions || 'Available (24/7 Priority On-Call)'
      : 'Standard Business Hours Only (Next-Morning Queue)'
    : 'Available (24/7 Priority On-Call)';

  return (
    <div className="rounded-2xl border p-5 transition-colors duration-200
      bg-[var(--surface)] text-[var(--foreground)] border-[var(--surface-border)] shadow-xs
    ">
      <div className="flex items-center justify-between pb-3.5 border-b border-[var(--surface-border)] mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-cyan-400">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              Contractor Context
            </h3>
            <p className="text-[10px] text-[var(--muted)]">Active Business Rules</p>
          </div>
        </div>

        <span className="text-[10px] font-semibold text-blue-600 dark:text-cyan-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
          {isDemo ? 'Summit HVAC Pilot' : 'Active Contractor'}
        </span>
      </div>

      <div className="space-y-3 text-xs text-[var(--foreground)]">
        {/* Business Name & Tagline */}
        <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[var(--muted)] text-[10px] font-medium uppercase tracking-wider">Business Name</span>
            <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-semibold">
              <ShieldCheck className="h-3 w-3" />
              <span>Verified Intake</span>
            </span>
          </div>
          <p className="font-bold text-[var(--foreground)] text-sm">{businessName}</p>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{locationText}</p>
        </div>

        {/* Territory / Service Areas */}
        <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
            <Navigation className="h-3 w-3 text-blue-500" />
            <span>Service Territory</span>
          </div>
          <p className="text-[var(--foreground)] text-[11px] leading-relaxed">
            {serviceAreas.slice(0, 6).join(', ')}
            {serviceAreas.length > 6 ? ` +${serviceAreas.length - 6} more` : ''}
          </p>
        </div>

        {/* Operating Hours & Emergency */}
        <div className="p-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 text-[10px] font-medium uppercase tracking-wider">
            <Clock className="h-3 w-3 text-cyan-500" />
            <span>Business Hours &amp; After-Hours</span>
          </div>
          <p className="text-[var(--foreground)] text-[11px] font-medium">{hoursText}</p>
          <p className="text-amber-500 dark:text-amber-400 text-[10px] mt-1 font-semibold">
            {emergencySummary}
          </p>
        </div>
      </div>
    </div>
  );
};
