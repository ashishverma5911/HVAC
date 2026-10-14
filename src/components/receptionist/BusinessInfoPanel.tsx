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
  const emergencyEnabled = config ? config.emergencyServiceEnabled : true;
  const emergencySummary = config
    ? config.emergencyServiceEnabled
      ? config.afterHoursInstructions || 'Available (24/7 Priority On-Call)'
      : 'Standard Business Hours Only (Next-Morning Queue)'
    : 'Available (24/7 Priority On-Call)';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Business Information Panel
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
          {isDemo ? 'Summit HVAC Profile' : 'Active Contractor Profile'}
        </span>
      </div>

      <div className="space-y-3.5 text-xs text-slate-700">
        {/* Business Name & Tagline */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px] font-medium">Business:</span>
            <span className="font-bold text-slate-900 text-sm">{businessName}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isDemo
              ? summitHvacProfile.tagline
              : `Configured AI Receptionist Profile${config?.timezone ? ` (${config.timezone})` : ''}`}
          </p>
        </div>

        {/* Location */}
        <div className="flex items-start gap-2.5 p-2 rounded-md">
          <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-500 block text-[11px]">Location:</span>
            <span className="font-semibold text-slate-900">{locationText}</span>
          </div>
        </div>

        {/* Service Area */}
        <div className="flex items-start gap-2.5 p-2 rounded-md">
          <Navigation className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-500 block text-[11px]">Service Area:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {serviceAreas.map((city) => (
                <span
                  key={city}
                  className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded font-medium border border-slate-200"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="flex items-start gap-2.5 p-2 rounded-md">
          <Wrench className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-500 block text-[11px]">Services:</span>
            <ul className="mt-1 grid grid-cols-2 gap-1 text-[11px] font-medium text-slate-800">
              {services.map((svc) => (
                <li key={svc} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span>{svc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Business Hours */}
        <div className="flex items-start gap-2.5 p-2 rounded-md">
          <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-500 block text-[11px]">Business Hours:</span>
            <span className="font-semibold text-slate-900">{hoursText}</span>
          </div>
        </div>

        {/* Emergency Service */}
        <div
          className={`flex items-start gap-2.5 p-2 rounded-lg border ${
            emergencyEnabled
              ? 'bg-emerald-50/70 border-emerald-200/80'
              : 'bg-amber-50/70 border-amber-200/80'
          }`}
        >
          <ShieldCheck
            className={`h-4 w-4 shrink-0 mt-0.5 ${
              emergencyEnabled ? 'text-emerald-700' : 'text-amber-700'
            }`}
          />
          <div>
            <span
              className={`font-bold block text-[11px] ${
                emergencyEnabled ? 'text-emerald-900' : 'text-amber-900'
              }`}
            >
              Emergency Service:
            </span>
            <span
              className={`font-medium text-[11px] ${
                emergencyEnabled ? 'text-emerald-800' : 'text-amber-800'
              }`}
            >
              {emergencySummary}
            </span>
          </div>
        </div>

        {/* Notice */}
        <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="italic">
            {isDemo
              ? 'Important: This is fictional demo information used to calibrate the receptionist AI system.'
              : `Active server-verified receptionist configuration for ${businessName}.`}
          </p>
        </div>
      </div>
    </div>
  );
};

