'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  Phone,
  MapPin,
  Clock,
  ShieldAlert,
  PhoneForwarded,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowLeft,
  Plus,
  X,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { validateSettingsInput } from '@/lib/validation/contractorSettings';

const PRESET_SERVICES = [
  'AC Repair & Diagnostic',
  'AC Replacement & Installation',
  'Heating & Furnace Repair',
  'Heat Pump Maintenance',
  'Seasonal HVAC Tune-up',
  'Duct Cleaning & Inspection',
  '24/7 Emergency Service',
  'Thermostat Repair & Smart Upgrades',
];

export default function ContractorSettingsPage() {
  const router = useRouter();

  // Loading & notification states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [postalCode, setPostalCode] = useState('');

  // Service Areas
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState('');

  // Services Offered
  const [servicesOffered, setServicesOffered] = useState<string[]>([]);
  const [customServiceInput, setCustomServiceInput] = useState('');

  // Hours
  const [weekdayHours, setWeekdayHours] = useState('8:00 AM – 6:00 PM');
  const [saturdayHours, setSaturdayHours] = useState('9:00 AM – 2:00 PM');
  const [sundayHours, setSundayHours] = useState('Emergency Service Only');

  // Emergency & Dispatch
  const [emergencyServiceEnabled, setEmergencyServiceEnabled] = useState(true);
  const [afterHoursInstructions, setAfterHoursInstructions] = useState('');
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferInstructions, setTransferInstructions] = useState('');
  const [customGreeting, setCustomGreeting] = useState('');

  // 1. Fetch current settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/contractor/settings');
        if (res.status === 401) {
          router.push('/login?redirect=/settings');
          return;
        }
        if (res.status === 403) {
          router.push('/onboarding');
          return;
        }

        const data = await res.json();
        if (data.success && data.settings) {
          const s = data.settings;
          setBusinessName(s.name || '');
          setPhone(s.phone || '');
          setAddress(s.address || '');
          setCity(s.city || '');
          setState(s.state || 'TX');
          setPostalCode(s.postalCode || '');
          setServiceAreas(s.serviceAreas || []);
          setServicesOffered(s.servicesOffered || []);
          setWeekdayHours(s.businessHours?.weekdays || '8:00 AM – 6:00 PM');
          setSaturdayHours(s.businessHours?.saturday || '');
          setSundayHours(s.businessHours?.sunday || '');
          setEmergencyServiceEnabled(s.emergencyServiceEnabled ?? true);
          setAfterHoursInstructions(s.afterHoursInstructions || '');
          setTransferPhoneNumber(s.transferPhoneNumber || '');
          setTransferInstructions(s.transferInstructions || '');
          setCustomGreeting(s.customGreeting || '');
        } else {
          setErrorMessage(data.error || 'Failed to load business settings.');
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        setErrorMessage('Network error while loading settings.');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [router]);

  const handleAddArea = () => {
    const trimmed = areaInput.trim();
    if (trimmed && !serviceAreas.includes(trimmed)) {
      setServiceAreas([...serviceAreas, trimmed]);
      setAreaInput('');
    }
  };

  const handleRemoveArea = (area: string) => {
    setServiceAreas(serviceAreas.filter((a) => a !== area));
  };

  const handleToggleService = (service: string) => {
    if (servicesOffered.includes(service)) {
      setServicesOffered(servicesOffered.filter((s) => s !== service));
    } else {
      setServicesOffered([...servicesOffered, service]);
    }
  };

  const handleAddCustomService = () => {
    const trimmed = customServiceInput.trim();
    if (trimmed && !servicesOffered.includes(trimmed)) {
      setServicesOffered([...servicesOffered, trimmed]);
      setCustomServiceInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const payload = {
      name: businessName,
      phone,
      address,
      city,
      state,
      postalCode,
      serviceAreas,
      servicesOffered,
      businessHours: {
        weekdays: weekdayHours,
        saturday: saturdayHours,
        sunday: sundayHours,
      },
      emergencyServiceEnabled,
      afterHoursInstructions,
      transferPhoneNumber,
      transferInstructions,
      customGreeting,
    };

    // Client-side quick check
    const validation = validateSettingsInput(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage('Please correct the highlighted errors before saving.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/contractor/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.details) {
          setFieldErrors(data.details);
        }
        setErrorMessage(data.error || 'Failed to update contractor settings.');
      } else {
        setSuccessMessage('Business configuration saved! AERIS AI receptionist is immediately updated.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setErrorMessage('A network error occurred while updating settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar currentRoute="dashboard" />
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Loading business configuration...</p>
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Contractor Dashboard</span>
                </Link>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Contractor Business Settings
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Configure your service territory, business hours, emergency escalation policies, and dispatcher transfer numbers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Live AI Context</span>
              </span>
            </div>
          </div>

          {/* Feedback Messages */}
          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-900">Changes Saved</h4>
                <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-900">Update Failed</h4>
                <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Immutable Safety Rules Notice */}
          <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Immutable AI Safety Policies Enforced</p>
              <p className="text-blue-700 leading-relaxed">
                For liability protection, AERIS will never provide DIY high-voltage or refrigerant troubleshooting instructions,
                will never fabricate technician availability or fixed pricing quotes, and always escalates life-safety emergencies.
                All AI appointment bookings remain strictly marked as <span className="font-mono font-semibold">requested</span>.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Core Business Profile */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Business Profile</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Apex Comfort Systems"
                  />
                  {fieldErrors.name && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Inbound Business Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(214) 555-0199"
                  />
                  {fieldErrors.phone && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1234 Industrial Parkway"
                  />
                  {fieldErrors.address && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.address}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Dallas"
                  />
                  {fieldErrors.city && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.city}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                      placeholder="TX"
                    />
                    {fieldErrors.state && (
                      <p className="text-xs text-red-600 mt-1">{fieldErrors.state}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="75201"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Service Areas */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <MapPin className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Service Coverage Areas</h3>
              </div>

              <p className="text-xs text-slate-500">
                AERIS will check caller locations against these cities and neighborhoods before booking or taking service calls.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddArea();
                    }
                  }}
                  placeholder="Add city or area (e.g. Fort Worth, Arlington)"
                  className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition border border-blue-200"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Area</span>
                </button>
              </div>

              {fieldErrors.serviceAreas && (
                <p className="text-xs text-red-600">{fieldErrors.serviceAreas}</p>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {serviceAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-800 text-xs font-medium rounded-full border border-slate-200"
                  >
                    <span>{area}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveArea(area)}
                      className="text-slate-400 hover:text-red-600 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* 3. Services Offered */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Services Offered</h3>
              </div>

              <p className="text-xs text-slate-500">
                Select all services your technicians perform. AERIS will offer triage and scheduling only for selected services.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRESET_SERVICES.map((srv) => {
                  const selected = servicesOffered.includes(srv);
                  return (
                    <label
                      key={srv}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        selected
                          ? 'bg-blue-50/60 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleService(srv)}
                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>{srv}</span>
                    </label>
                  );
                })}
              </div>

              {/* Custom Service Input */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={customServiceInput}
                  onChange={(e) => setCustomServiceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomService();
                    }
                  }}
                  placeholder="Add custom HVAC specialty (e.g. Commercial Chiller Service)"
                  className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomService}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition border border-slate-300"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Specialty</span>
                </button>
              </div>

              {fieldErrors.servicesOffered && (
                <p className="text-xs text-red-600">{fieldErrors.servicesOffered}</p>
              )}
            </div>

            {/* 4. Business Hours */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Business Hours & Availability</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monday – Friday <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={weekdayHours}
                    onChange={(e) => setWeekdayHours(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="8:00 AM – 6:00 PM"
                  />
                  {fieldErrors.businessHours && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.businessHours}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Saturday</label>
                  <input
                    type="text"
                    value={saturdayHours}
                    onChange={(e) => setSaturdayHours(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="9:00 AM – 2:00 PM"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sunday</label>
                  <input
                    type="text"
                    value={sundayHours}
                    onChange={(e) => setSundayHours(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Emergency Only or Closed"
                  />
                </div>
              </div>
            </div>

            {/* 5. Emergency & Human Dispatch Policies */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Emergency & Human Dispatch</h3>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">24/7 After-Hours Emergency Service</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Allow AERIS to accept urgent requests outside regular operating hours.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emergencyServiceEnabled}
                    onChange={(e) => setEmergencyServiceEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  After-Hours Emergency Protocol Instructions
                </label>
                <textarea
                  rows={2}
                  value={afterHoursInstructions}
                  onChange={(e) => setAfterHoursInstructions(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Immediate on-call dispatch for severe cooling loss (>85°F indoor), heating failure (<55°F), or refrigerant/gas leaks."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Human Escalation Phone Number
                  </label>
                  <input
                    type="text"
                    value={transferPhoneNumber}
                    onChange={(e) => setTransferPhoneNumber(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(214) 555-0199 (default is business phone)"
                  />
                  {fieldErrors.transferPhoneNumber && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.transferPhoneNumber}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Human Transfer Condition / Instruction
                  </label>
                  <input
                    type="text"
                    value={transferInstructions}
                    onChange={(e) => setTransferInstructions(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Transfer immediately if caller requests human or reports safety risks."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Receptionist Greeting (Optional)
                </label>
                <input
                  type="text"
                  value={customGreeting}
                  onChange={(e) => setCustomGreeting(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Thanks for calling Apex Comfort Systems! How can our HVAC team assist you today?"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end gap-3 pt-2 pb-12">
              <Link
                href="/dashboard"
                className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold rounded-lg shadow-sm transition"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving Settings...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Business Settings</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
