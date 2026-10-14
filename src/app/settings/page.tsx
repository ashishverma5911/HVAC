'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowLeft,
  Plus,
  X,
  Save,
  ShieldCheck,
  Volume2,
  Languages,
  HelpCircle,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { validateSettingsInput } from '@/lib/validation/contractorSettings';
import {
  SUPPORTED_VOICE_LANGUAGES,
  US_CONTRACTOR_TIMEZONES,
  DEFAULT_CALLER_INTAKE_QUESTIONS,
  DEFAULT_APPOINTMENT_REQUEST_RULES,
  DEFAULT_CONVERSATION_PREFERENCES,
  DEFAULT_BUSINESS_FAQS,
  type ContractorFaqItem,
  type SupportedVoiceLanguage,
  type AfterHoursBehavior,
  type PhoneIntegrationStatus,
} from '@/lib/ai/contractorConfig';

const PRESET_SERVICES = [
  'AC Repair',
  'AC Installation',
  'Furnace Repair',
  'Furnace Installation',
  'HVAC Maintenance',
  'Emergency HVAC Service',
  'AC Repair & Diagnostic',
  'AC Replacement & Installation',
  'Heating & Furnace Repair',
  'Heat Pump Maintenance',
  'Seasonal HVAC Tune-up',
  'Duct Cleaning & Inspection',
  '24/7 Emergency Service',
  'Thermostat Repair & Smart Upgrades',
];

interface PhoneIntegrationSnapshot {
  status: PhoneIntegrationStatus;
  statusLabel: string;
  statusReason: string;
  assignedAerisNumber: string | null;
  forwardingNumber: string | null;
  twilioSidVerified: boolean;
}

const PHONE_STATUS_BADGE: Record<PhoneIntegrationStatus, string> = {
  not_configured: 'bg-slate-100 text-slate-700 border-slate-300',
  setup_required: 'bg-amber-50 text-amber-800 border-amber-300',
  configuration_pending: 'bg-blue-50 text-blue-800 border-blue-300',
  connected_and_verified: 'bg-emerald-50 text-emerald-800 border-emerald-300',
};

export default function ContractorSettingsPage() {
  const router = useRouter();

  // Loading & notification states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Core Business Profile state
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [postalCode, setPostalCode] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');

  // Service Areas & Supported ZIPs
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState('');
  const [supportedZips, setSupportedZips] = useState<string[]>([]);
  const [zipInput, setZipInput] = useState('');

  // Services Offered
  const [servicesOffered, setServicesOffered] = useState<string[]>([]);
  const [customServiceInput, setCustomServiceInput] = useState('');

  // Hours
  const [weekdayHours, setWeekdayHours] = useState('8:00 AM – 6:00 PM');
  const [saturdayHours, setSaturdayHours] = useState('9:00 AM – 2:00 PM');
  const [sundayHours, setSundayHours] = useState('Emergency Service Only');

  // Receptionist Behavior, Pronunciation, Languages, FAQs & Escalation
  const [customGreeting, setCustomGreeting] = useState('');
  const [pronunciationGuide, setPronunciationGuide] = useState('');
  const [conversationPreferences, setConversationPreferences] = useState(
    DEFAULT_CONVERSATION_PREFERENCES
  );
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedVoiceLanguage[]>(['en-US']);
  const [callerIntakeQuestions, setCallerIntakeQuestions] = useState<string[]>([
    ...DEFAULT_CALLER_INTAKE_QUESTIONS,
  ]);
  const [newQuestionInput, setNewQuestionInput] = useState('');
  const [businessFaqs, setBusinessFaqs] = useState<ContractorFaqItem[]>([
    ...DEFAULT_BUSINESS_FAQS,
  ]);
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');
  const [emergencyServiceEnabled, setEmergencyServiceEnabled] = useState(true);
  const [afterHoursBehavior, setAfterHoursBehavior] =
    useState<AfterHoursBehavior>('emergency_dispatch');
  const [afterHoursInstructions, setAfterHoursInstructions] = useState('');
  const [callbackInstructions, setCallbackInstructions] = useState('');
  const [appointmentRequestRules, setAppointmentRequestRules] = useState(
    DEFAULT_APPOINTMENT_REQUEST_RULES
  );
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferInstructions, setTransferInstructions] = useState('');

  // Phone Integration & Call Forwarding
  const [forwardingEnabled, setForwardingEnabled] = useState(false);
  const [forwardingMode, setForwardingMode] = useState<
    'conditional_busy_no_answer' | 'unconditional_all_calls' | 'after_hours_only'
  >('conditional_busy_no_answer');
  const [carrierName, setCarrierName] = useState('');
  const [phoneIntegration, setPhoneIntegration] = useState<PhoneIntegrationSnapshot | null>(null);
  const [destinationPhoneInput, setDestinationPhoneInput] = useState('');
  const [twilioSidInput, setTwilioSidInput] = useState('');
  const [associatingPhone, setAssociatingPhone] = useState(false);

  const applySettingsData = useCallback((s: Record<string, unknown>) => {
    setBusinessName((s.name as string) || '');
    setPhone((s.phone as string) || '');
    setBusinessEmail((s.businessEmail as string) || '');
    setWebsite((s.website as string) || '');
    setAddress((s.address as string) || '');
    setCity((s.city as string) || '');
    setState((s.state as string) || 'TX');
    setPostalCode((s.postalCode as string) || '');
    setTimezone((s.timezone as string) || 'America/Chicago');
    setServiceAreas((s.serviceAreas as string[]) || []);
    setSupportedZips((s.supportedZips as string[]) || []);
    setServicesOffered((s.servicesOffered as string[]) || []);
    const bh = (s.businessHours as Record<string, string> | undefined) || {};
    setWeekdayHours(bh.weekdays || '8:00 AM – 6:00 PM');
    setSaturdayHours(bh.saturday || '');
    setSundayHours(bh.sunday || '');
    setEmergencyServiceEnabled((s.emergencyServiceEnabled as boolean | undefined) ?? true);
    setAfterHoursBehavior((s.afterHoursBehavior as AfterHoursBehavior) || 'emergency_dispatch');
    setAfterHoursInstructions((s.afterHoursInstructions as string) || '');
    setCallbackInstructions(
      (s.callbackInstructions as string) || (s.transferInstructions as string) || ''
    );
    setAppointmentRequestRules(
      (s.appointmentRequestRules as string) || DEFAULT_APPOINTMENT_REQUEST_RULES
    );
    setTransferPhoneNumber((s.transferPhoneNumber as string) || '');
    setTransferInstructions((s.transferInstructions as string) || '');
    setCustomGreeting((s.customGreeting as string) || '');
    setPronunciationGuide((s.pronunciationGuide as string) || '');
    setConversationPreferences(
      (s.conversationPreferences as string) || DEFAULT_CONVERSATION_PREFERENCES
    );
    setSupportedLanguages(
      Array.isArray(s.supportedLanguages) && s.supportedLanguages.length > 0
        ? (s.supportedLanguages as SupportedVoiceLanguage[])
        : ['en-US']
    );
    setCallerIntakeQuestions(
      Array.isArray(s.callerIntakeQuestions) && s.callerIntakeQuestions.length > 0
        ? (s.callerIntakeQuestions as string[])
        : [...DEFAULT_CALLER_INTAKE_QUESTIONS]
    );
    setBusinessFaqs(
      Array.isArray(s.businessFaqs) && s.businessFaqs.length > 0
        ? (s.businessFaqs as ContractorFaqItem[])
        : [...DEFAULT_BUSINESS_FAQS]
    );
    setForwardingEnabled(Boolean(s.forwardingEnabled));
    if (s.forwardingMode) {
      setForwardingMode(
        s.forwardingMode as
          | 'conditional_busy_no_answer'
          | 'unconditional_all_calls'
          | 'after_hours_only'
      );
    }
    setCarrierName((s.carrierName as string) || '');
    if (s.phoneIntegration) {
      setPhoneIntegration(s.phoneIntegration as PhoneIntegrationSnapshot);
    }
  }, []);

  // 1. Fetch current settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/contractor/settings', { cache: 'no-store' });
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
          applySettingsData(data.settings as Record<string, unknown>);
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
  }, [router, applySettingsData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/contractor/settings', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success && data.settings) {
        applySettingsData(data.settings as Record<string, unknown>);
        setSuccessMessage('Settings reloaded from database.');
      } else {
        setErrorMessage(data.error || 'Failed to refresh settings.');
      }
    } catch (err) {
      console.error('Failed to refresh settings:', err);
      setErrorMessage('Network error while refreshing settings.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssociateDestinationPhone = async () => {
    const trimmedPhone = destinationPhoneInput.trim();
    if (!trimmedPhone) {
      setErrorMessage('Please enter a provisioned Twilio destination phone number to associate.');
      return;
    }

    setAssociatingPhone(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/contractor/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationPhoneNumber: trimmedPhone,
          twilioSid: twilioSidInput.trim() || undefined,
          label: 'AERIS Inbound Destination',
          isActive: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.phoneIntegration) {
          setPhoneIntegration(data.phoneIntegration as PhoneIntegrationSnapshot);
        }
        setDestinationPhoneInput('');
        setTwilioSidInput('');
        setSuccessMessage(
          `Provisioned destination number ${data.associatedNumber?.phoneNumber || trimmedPhone} associated with your contractor account.`
        );
      } else {
        setErrorMessage(data.error || 'Failed to associate destination phone number.');
      }
    } catch (err) {
      console.error('Failed to associate destination number:', err);
      setErrorMessage('Network error while associating destination phone number.');
    } finally {
      setAssociatingPhone(false);
    }
  };

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

  const handleAddZip = () => {
    const trimmed = zipInput.trim();
    if (/^\d{5}(-\d{4})?$/.test(trimmed) && !supportedZips.includes(trimmed)) {
      setSupportedZips([...supportedZips, trimmed]);
      setZipInput('');
    }
  };

  const handleRemoveZip = (zip: string) => {
    setSupportedZips(supportedZips.filter((z) => z !== zip));
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

  const handleToggleLanguage = (code: SupportedVoiceLanguage) => {
    if (supportedLanguages.includes(code)) {
      if (supportedLanguages.length > 1) {
        setSupportedLanguages(supportedLanguages.filter((l) => l !== code));
      }
    } else {
      setSupportedLanguages([...supportedLanguages, code]);
    }
  };

  const handleAddIntakeQuestion = () => {
    const trimmed = newQuestionInput.trim();
    if (trimmed && !callerIntakeQuestions.includes(trimmed)) {
      setCallerIntakeQuestions([...callerIntakeQuestions, trimmed]);
      setNewQuestionInput('');
    }
  };

  const handleRemoveIntakeQuestion = (q: string) => {
    setCallerIntakeQuestions(callerIntakeQuestions.filter((item) => item !== q));
  };

  const handleAddFaq = () => {
    const q = newFaqQuestion.trim();
    const a = newFaqAnswer.trim();
    if (q && a) {
      setBusinessFaqs([...businessFaqs, { question: q, answer: a }]);
      setNewFaqQuestion('');
      setNewFaqAnswer('');
    }
  };

  const handleRemoveFaq = (index: number) => {
    setBusinessFaqs(businessFaqs.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const payload = {
      name: businessName,
      phone,
      businessEmail,
      website,
      address,
      city,
      state,
      postalCode,
      timezone,
      serviceAreas,
      supportedZips,
      servicesOffered,
      businessHours: {
        weekdays: weekdayHours,
        saturday: saturdayHours,
        sunday: sundayHours,
      },
      emergencyServiceEnabled,
      afterHoursBehavior,
      afterHoursInstructions,
      callbackInstructions: callbackInstructions || transferInstructions,
      appointmentRequestRules,
      transferPhoneNumber,
      transferInstructions: transferInstructions || callbackInstructions,
      customGreeting,
      pronunciationGuide,
      conversationPreferences,
      supportedLanguages,
      callerIntakeQuestions,
      businessFaqs,
      forwardingEnabled,
      forwardingMode,
      carrierName,
    };

    const validation = validateSettingsInput(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage('Please correct the highlighted errors before saving.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        if (data.settings?.phoneIntegration) {
          setPhoneIntegration(data.settings.phoneIntegration);
        }
        setSuccessMessage(
          'Business configuration saved! AERIS AI receptionist is immediately updated.'
        );
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
                Configure your business profile, service territory, receptionist voice behavior, emergency escalation, and phone forwarding.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={refreshing}
                onClick={handleManualRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
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
                All AI appointment bookings remain strictly marked as{' '}
                <span className="font-mono font-semibold">requested</span>.
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Business Email
                  </label>
                  <input
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="dispatch@apexcomfort.com"
                  />
                  {fieldErrors.businessEmail && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.businessEmail}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Business Website (Optional)
                  </label>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://www.apexcomfort.com"
                  />
                  {fieldErrors.website && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.website}</p>
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

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating Time Zone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {US_CONTRACTOR_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
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

              {/* Supported ZIP Codes */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Supported ZIP Codes (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={zipInput}
                    onChange={(e) => setZipInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddZip();
                      }
                    }}
                    placeholder="Add 5-digit ZIP code (e.g. 75201)"
                    className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddZip}
                    className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition border border-slate-300"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add ZIP</span>
                  </button>
                </div>

                {fieldErrors.supportedZips && (
                  <p className="text-xs text-red-600">{fieldErrors.supportedZips}</p>
                )}

                {supportedZips.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {supportedZips.map((zip) => (
                      <span
                        key={zip}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-800 text-xs font-mono font-medium rounded-full border border-blue-200"
                      >
                        <span>{zip}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveZip(zip)}
                          className="text-blue-400 hover:text-red-600 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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

              {servicesOffered.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {servicesOffered.map((srv) => (
                    <span
                      key={srv}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-900 border border-blue-200"
                    >
                      <span>{srv}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleService(srv)}
                        className="text-blue-400 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {fieldErrors.servicesOffered && (
                <p className="text-xs text-red-600">{fieldErrors.servicesOffered}</p>
              )}
            </div>

            {/* 4. Business Hours */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Business Hours &amp; Availability</h3>
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

            {/* 5. Receptionist Behavior, Pronunciation, Languages & Emergency Escalation */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Receptionist Behavior, Voice &amp; Emergency Escalation
                </h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Receptionist Greeting
                </label>
                <input
                  type="text"
                  value={customGreeting}
                  onChange={(e) => setCustomGreeting(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Thanks for calling Apex Comfort Systems! How can our HVAC team assist you today?"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                  <Volume2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Business Name Pronunciation or Preferred Wording</span>
                </label>
                <input
                  type="text"
                  value={pronunciationGuide}
                  onChange={(e) => setPronunciationGuide(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Pronounced 'AY-pex Comfort' — say 'Apex' on follow-up turns"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Greeting &amp; Conversation Style Preferences
                </label>
                <textarea
                  rows={2}
                  value={conversationPreferences}
                  onChange={(e) => setConversationPreferences(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Keep responses warm, concise (1–3 sentences), and ask one or two intake questions at a time."
                />
              </div>

              {/* Supported Voice Languages */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Languages className="h-3.5 w-3.5 text-blue-600" />
                  <span>Supported Voice Languages</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUPPORTED_VOICE_LANGUAGES.map((lang) => {
                    const selected = supportedLanguages.includes(lang.code);
                    return (
                      <label
                        key={lang.code}
                        className={`flex items-center justify-between p-3 rounded-lg border text-xs font-medium cursor-pointer transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleToggleLanguage(lang.code)}
                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                          />
                          <span>{lang.label}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{lang.code}</span>
                      </label>
                    );
                  })}
                </div>
                {fieldErrors.supportedLanguages && (
                  <p className="text-xs text-red-600">{fieldErrors.supportedLanguages}</p>
                )}
              </div>

              {/* Caller Intake Questions */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
                  <span>Questions the Receptionist Should Ask Callers</span>
                </label>
                <div className="space-y-1.5">
                  {callerIntakeQuestions.map((q, idx) => (
                    <div
                      key={q}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800"
                    >
                      <span>
                        {idx + 1}. {q}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIntakeQuestion(q)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuestionInput}
                    onChange={(e) => setNewQuestionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddIntakeQuestion();
                      }
                    }}
                    placeholder="Add custom intake question..."
                    className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddIntakeQuestion}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition"
                  >
                    Add Question
                  </button>
                </div>
              </div>

              {/* Business FAQs */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700">
                  Verified Business FAQs (Answered by AERIS Without Inventing Policies)
                </label>
                <div className="space-y-2">
                  {businessFaqs.map((faq, idx) => (
                    <div
                      key={`${faq.question}-${idx}`}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900">Q: {faq.question}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFaq(idx)}
                          className="text-slate-400 hover:text-red-600 shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-slate-600">A: {faq.answer}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    value={newFaqQuestion}
                    onChange={(e) => setNewFaqQuestion(e.target.value)}
                    placeholder="FAQ Question (e.g. Do you service heat pumps?)"
                    className="text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFaqAnswer}
                      onChange={(e) => setNewFaqAnswer(e.target.value)}
                      placeholder="Verified Answer..."
                      className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddFaq}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition shrink-0"
                    >
                      Add FAQ
                    </button>
                  </div>
                </div>
              </div>

              {/* Emergency & After-Hours Policy */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    24/7 After-Hours Emergency Service
                  </h4>
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
                  After-Hours Operating Mode
                </label>
                <select
                  value={afterHoursBehavior}
                  onChange={(e) => setAfterHoursBehavior(e.target.value as AfterHoursBehavior)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="emergency_dispatch">
                    Dispatch Urgent Emergencies 24/7 &amp; Book Routine Calls for Next Business Day
                  </option>
                  <option value="next_day_callback">
                    Record All After-Hours Leads for First-Thing Next-Morning Callback
                  </option>
                  <option value="live_transfer">
                    Offer Immediate Live Transfer to On-Call Phone for After-Hours Emergencies
                  </option>
                </select>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Appointment-Request Rules
                </label>
                <textarea
                  rows={2}
                  value={appointmentRequestRules}
                  onChange={(e) => setAppointmentRequestRules(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Verify the caller is inside our service area first, capture all 5 lead details, and clarify that appointments are requested pending dispatcher confirmation."
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
                    Human Callback &amp; Escalation Instructions
                  </label>
                  <input
                    type="text"
                    value={callbackInstructions || transferInstructions}
                    onChange={(e) => {
                      setCallbackInstructions(e.target.value);
                      setTransferInstructions(e.target.value);
                    }}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Transfer immediately if caller requests human or reports safety risks."
                  />
                </div>
              </div>
            </div>

            {/* 6. Phone Setup & Call Forwarding Status */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <PhoneCall className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Phone Setup &amp; Call Forwarding
                  </h3>
                </div>
                {phoneIntegration && (
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                      PHONE_STATUS_BADGE[phoneIntegration.status] ||
                      'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {phoneIntegration.statusLabel}
                  </span>
                )}
              </div>

              {phoneIntegration && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="font-semibold text-slate-900">
                    Assigned AERIS Number:{' '}
                    <span className="font-mono">
                      {phoneIntegration.assignedAerisNumber || 'Not provisioned yet'}
                    </span>
                  </div>
                  <p className="text-slate-600">{phoneIntegration.statusReason}</p>
                </div>
              )}

              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Enable Call Forwarding from Existing Business Number
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Keep your existing business number and forward unanswered or after-hours calls to AERIS.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={forwardingEnabled}
                  onChange={(e) => setForwardingEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Forwarding Mode
                  </label>
                  <select
                    value={forwardingMode}
                    onChange={(e) =>
                      setForwardingMode(
                        e.target.value as
                          | 'conditional_busy_no_answer'
                          | 'unconditional_all_calls'
                          | 'after_hours_only'
                      )
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="conditional_busy_no_answer">
                      Conditional (When Busy or Unanswered)
                    </option>
                    <option value="after_hours_only">After-Hours &amp; Weekends Only</option>
                    <option value="unconditional_all_calls">
                      All Inbound Calls (*72 Immediate Forwarding)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Carrier / VoIP Provider
                  </label>
                  <input
                    type="text"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. RingCentral, Verizon, AT&T"
                  />
                </div>
              </div>

              {/* Operator / Administrator Provisioned Destination Number Binding */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Associate Provisioned AERIS / Twilio Destination Number (Admin / Operator)
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Once a real Twilio phone number is provisioned and pointed at the AERIS voice webhook, associate its E.164 number and Twilio Phone SID (`PN...`) here. Do not enter unprovisioned numbers.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={destinationPhoneInput}
                    onChange={(e) => setDestinationPhoneInput(e.target.value)}
                    placeholder="Twilio Destination (e.g. +19725550140)"
                    className="text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={twilioSidInput}
                    onChange={(e) => setTwilioSidInput(e.target.value)}
                    placeholder="Twilio Phone SID (PN... optional)"
                    className="text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAssociateDestinationPhone}
                    disabled={associatingPhone}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-semibold rounded-lg transition"
                  >
                    {associatingPhone ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Associating...</span>
                      </>
                    ) : (
                      <span>Associate Destination Number</span>
                    )}
                  </button>
                </div>
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
