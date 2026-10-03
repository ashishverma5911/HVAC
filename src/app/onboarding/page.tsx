'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bot,
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
  ArrowRight,
  Plus,
  X,
} from 'lucide-react';
import { validateOnboardingInput } from '@/lib/validation/contractorOnboarding';

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

export default function OnboardingPage() {
  const router = useRouter();

  // Auth & Page state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form Fields
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [postalCode, setPostalCode] = useState('');

  // Service Areas
  const [serviceAreas, setServiceAreas] = useState<string[]>(['Dallas', 'Plano', 'Frisco']);
  const [areaInput, setAreaInput] = useState('');

  // Services Offered
  const [servicesOffered, setServicesOffered] = useState<string[]>([
    'AC Repair & Diagnostic',
    'AC Replacement & Installation',
    'Heating & Furnace Repair',
    'Seasonal HVAC Tune-up',
    '24/7 Emergency Service',
  ]);
  const [customServiceInput, setCustomServiceInput] = useState('');

  // Business Hours
  const [weekdayHours, setWeekdayHours] = useState('8:00 AM – 6:00 PM');
  const [saturdayHours, setSaturdayHours] = useState('9:00 AM – 2:00 PM');
  const [sundayHours, setSundayHours] = useState('Emergency Service Only');

  // Emergency & Escalation
  const [emergencyServiceEnabled, setEmergencyServiceEnabled] = useState(true);
  const [afterHoursInstructions, setAfterHoursInstructions] = useState(
    'Immediate on-call dispatch for severe cooling loss (>85°F indoor), heating failure (<55°F), or refrigerant/gas leaks.'
  );
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferInstructions, setTransferInstructions] = useState(
    'Transfer directly to lead dispatcher on call if the customer requests a human or expresses safety concerns.'
  );

  // Check auth status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();

        if (!data.authenticated) {
          router.push('/login?redirect=/onboarding');
          return;
        }

        if (data.hasBusiness) {
          // Already onboarded
          router.push('/dashboard');
          return;
        }

        if (data.user?.email) {
          setUserEmail(data.user.email);
        }
      } catch (err) {
        console.error('Failed to verify auth status:', err);
      } finally {
        setCheckingAuth(false);
      }
    }

    checkStatus();
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

  const toggleService = (service: string) => {
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
      transferPhoneNumber: transferPhoneNumber || phone,
      transferInstructions,
    };

    // Client-side quick check
    const validation = validateOnboardingInput(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage('Please correct the highlighted fields before submitting.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/contractor/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Already registered
          setErrorMessage('Your account is already onboarded. Redirecting to dashboard...');
          setTimeout(() => router.push('/dashboard'), 1500);
          return;
        }

        if (data.details && typeof data.details === 'object') {
          setFieldErrors(data.details);
        }
        setErrorMessage(data.error || 'Failed to complete onboarding. Please check your entries.');
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Success!
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error submitting onboarding profile.';
      setErrorMessage(msg);
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Checking contractor account status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pilot Onboarding</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Configure Your AERIS AI Receptionist
          </h1>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            Provide your HVAC business profile and service guidelines. AERIS AI will use these rules to answer calls,
            qualify emergency leads, and request appointments.
          </p>
          {userEmail && (
            <p className="text-xs text-slate-400 font-mono">Signed in as: {userEmail}</p>
          )}
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="rounded-xl bg-red-50 p-4 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Submission Incomplete</p>
              <p className="text-xs mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {/* Section 1: Business Identity */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">1. Company Identity &amp; Contact</h2>
                <p className="text-xs text-slate-500">How AERIS AI introduces your business to callers.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Apex Heating & Air Conditioning"
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-hidden transition ${
                    fieldErrors.name
                      ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                      : 'border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Main Business Phone *
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Phone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(469) 555-0144"
                    className={`w-full rounded-lg border pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-hidden transition ${
                      fieldErrors.phone
                        ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                    }`}
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="1234 Contractor Way, Suite 100"
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-hidden transition ${
                    fieldErrors.address
                      ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                      : 'border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                  }`}
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
                  placeholder="Dallas"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="TX"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="75201"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Service Coverage & Offerings */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">2. Service Areas &amp; Capabilities</h2>
                <p className="text-xs text-slate-500">AERIS AI will automatically check caller locations against these areas.</p>
              </div>
            </div>

            {/* Service Areas */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cities / Service Areas * (At least one required)
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {serviceAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    <span>{area}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveArea(area)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
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
                  placeholder="Type city (e.g. McKinney) and press Add"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Add Area
                </button>
              </div>
              {fieldErrors.serviceAreas && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.serviceAreas}</p>
              )}
            </div>

            {/* Services Offered */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Services Offered * (Check all that apply)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRESET_SERVICES.map((srv) => {
                  const checked = servicesOffered.includes(srv);
                  return (
                    <label
                      key={srv}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        checked
                          ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleService(srv)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>{srv}</span>
                    </label>
                  );
                })}
              </div>

              {/* Custom service addition */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={customServiceInput}
                  onChange={(e) => setCustomServiceInput(e.target.value)}
                  placeholder="Add custom specialty service..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
                <button
                  type="button"
                  onClick={handleAddCustomService}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Add Service
                </button>
              </div>
              {fieldErrors.servicesOffered && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.servicesOffered}</p>
              )}
            </div>
          </div>

          {/* Section 3: Hours & Emergency Dispatch */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">3. Business Hours &amp; Emergency Escalation</h2>
                <p className="text-xs text-slate-500">Controls scheduling boundaries and off-hours emergency protocols.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Weekdays (Mon – Fri) *
                </label>
                <input
                  type="text"
                  required
                  value={weekdayHours}
                  onChange={(e) => setWeekdayHours(e.target.value)}
                  placeholder="8:00 AM – 6:00 PM"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Saturday</label>
                <input
                  type="text"
                  value={saturdayHours}
                  onChange={(e) => setSaturdayHours(e.target.value)}
                  placeholder="9:00 AM – 2:00 PM"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sunday</label>
                <input
                  type="text"
                  value={sundayHours}
                  onChange={(e) => setSundayHours(e.target.value)}
                  placeholder="Emergency Service Only"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>
            </div>

            {/* Emergency Toggle */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">24/7 Emergency Service Enabled</span>
                    <span className="text-[11px] text-slate-500 block">
                      AERIS AI will immediately mark urgent safety and temperature hazards as emergency leads.
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={emergencyServiceEnabled}
                  onChange={(e) => setEmergencyServiceEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {emergencyServiceEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emergency &amp; After-Hours Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={afterHoursInstructions}
                    onChange={(e) => setAfterHoursInstructions(e.target.value)}
                    placeholder="Instructions for urgent callers outside standard hours..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
              )}
            </div>

            {/* Human Transfer Settings */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <PhoneForwarded className="h-5 w-5 text-blue-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Human Dispatcher Escalation</span>
                  <span className="text-[11px] text-slate-500 block">
                    Target phone number when AI receptionist transfers callers to a live team member.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dispatcher Transfer Phone Number
                  </label>
                  <input
                    type="tel"
                    value={transferPhoneNumber}
                    onChange={(e) => setTransferPhoneNumber(e.target.value)}
                    placeholder={phone || '(469) 555-0144'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Transfer Instructions
                  </label>
                  <input
                    type="text"
                    value={transferInstructions}
                    onChange={(e) => setTransferInstructions(e.target.value)}
                    placeholder="Transfer if customer asks for manager or reports gas smell"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submission Bar */}
          <div className="p-6 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              * Required fields. You can update these settings anytime from your contractor settings.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving &amp; Initializing Receptionist...</span>
                </>
              ) : (
                <>
                  <span>Save Configuration &amp; Open Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
