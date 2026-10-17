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
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  UserCheck,
  Users,
  Globe,
  Mail,
  Wrench,
  MessageSquare,
  Volume2,
  Languages,
  HelpCircle,
  PhoneCall,
  Save,
  Edit3,
  ShieldCheck,
  Lock,
  Info,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  validateOnboardingInput,
  validateOnboardingStep,
} from '@/lib/validation/contractorOnboarding';
import {
  SUPPORTED_VOICE_LANGUAGES,
  US_CONTRACTOR_TIMEZONES,
  DEFAULT_CALLER_INTAKE_QUESTIONS,
  type SupportedVoiceLanguage,
  type AfterHoursBehavior,
  type PhoneIntegrationStatus,
} from '@/lib/ai/contractorConfig';

const CORE_HVAC_SERVICES = [
  'AC Repair',
  'AC Installation',
  'Furnace Repair',
  'Furnace Installation',
  'HVAC Maintenance',
  'Emergency HVAC Service',
  'Heat Pump Service & Installation',
  'Ductwork & Airflow Inspection',
  'Smart Thermostat Installation',
];

interface PhoneIntegrationSnapshot {
  status: PhoneIntegrationStatus;
  statusLabel: string;
  statusReason: string;
  assignedAerisNumber: string | null;
  forwardingNumber: string | null;
  twilioSidVerified: boolean;
}

const STEP_DEFINITIONS = [
  { step: 1, title: 'Create Account', subtitle: 'Account & Organization' },
  { step: 2, title: 'Business Profile', subtitle: 'Identity, Coverage & Hours' },
  { step: 3, title: 'Services', subtitle: 'HVAC & Custom Services' },
  { step: 4, title: 'Receptionist', subtitle: 'Greeting, Voice & Escalation' },
  { step: 5, title: 'Phone Setup', subtitle: 'Call Forwarding & Status' },
  { step: 6, title: 'Review & Launch', subtitle: 'Verify & Save Configuration' },
] as const;

const PHONE_STATE_DEFINITIONS: Array<{
  status: PhoneIntegrationStatus;
  label: string;
  badgeClass: string;
  description: string;
}> = [
  {
    status: 'not_configured',
    label: 'Not configured',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    description:
      'No business phone number or call forwarding preference has been saved yet. Browser voice & chat testing remain available.',
  },
  {
    status: 'setup_required',
    label: 'Setup required',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    description:
      'Your business phone number is saved, but call forwarding to an AERIS inbound number has not been enabled yet.',
  },
  {
    status: 'configuration_pending',
    label: 'Configuration pending',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300',
    description:
      'Call forwarding preferences are saved. Waiting for dedicated AERIS inbound number assignment and carrier verification.',
  },
  {
    status: 'connected_and_verified',
    label: 'Connected and verified',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description:
      'Your assigned AERIS inbound number is provisioned, active in the telephony router, and verified to receive forwarded calls.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  // Wizard Step State (1..6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Auth & Loading States
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [hasExistingDraft, setHasExistingDraft] = useState(false);

  // Step 1 Inline Auth States (when user lands on /onboarding before signing in)
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authConfirmPasswordInput, setAuthConfirmPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccessNotice, setAuthSuccessNotice] = useState<string | null>(null);

  // Step 1 Organization Mode: 'create' or 'join'
  const [orgAction, setOrgAction] = useState<'create' | 'join'>('create');
  const [joinOrgSlug, setJoinOrgSlug] = useState('');
  const [joinVerificationPhone, setJoinVerificationPhone] = useState('');
  const [joiningOrg, setJoiningOrg] = useState(false);

  // Submission & Draft States
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedBanner, setDraftSavedBanner] = useState<string | null>(null);
  const [completionSuccess, setCompletionSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // STEP 2: Business Profile Fields
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [postalCode, setPostalCode] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [serviceAreas, setServiceAreas] = useState<string[]>(['Dallas', 'Plano', 'Frisco']);
  const [areaInput, setAreaInput] = useState('');
  const [supportedZips, setSupportedZips] = useState<string[]>([]);
  const [zipInput, setZipInput] = useState('');
  const [weekdayHours, setWeekdayHours] = useState('8:00 AM – 6:00 PM');
  const [saturdayHours, setSaturdayHours] = useState('9:00 AM – 2:00 PM');
  const [sundayHours, setSundayHours] = useState('Emergency Service Only');

  // STEP 3: Services Offered
  const [servicesOffered, setServicesOffered] = useState<string[]>([
    'AC Repair',
    'AC Installation',
    'Furnace Repair',
    'Furnace Installation',
    'HVAC Maintenance',
    'Emergency HVAC Service',
  ]);
  const [customServiceInput, setCustomServiceInput] = useState('');

  // STEP 4: Receptionist Behavior
  const [customGreeting, setCustomGreeting] = useState(
    'Thank you for calling! How can our HVAC team help you today?'
  );
  const [pronunciationGuide, setPronunciationGuide] = useState('');
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedVoiceLanguage[]>(['en-US']);
  const [callerIntakeQuestions, setCallerIntakeQuestions] = useState<string[]>([
    ...DEFAULT_CALLER_INTAKE_QUESTIONS,
  ]);
  const [newQuestionInput, setNewQuestionInput] = useState('');
  const [emergencyServiceEnabled, setEmergencyServiceEnabled] = useState(true);
  const [afterHoursBehavior, setAfterHoursBehavior] =
    useState<AfterHoursBehavior>('emergency_dispatch');
  const [afterHoursInstructions, setAfterHoursInstructions] = useState(
    'Immediate on-call dispatch for severe cooling loss (>85°F indoor), heating failure (<55°F), active water leaks, or gas/burning odors.'
  );
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferInstructions, setTransferInstructions] = useState(
    'Have our lead on-call dispatcher call the customer back within 15 minutes, or transfer immediately if the caller reports a safety hazard or requests a human manager.'
  );

  // STEP 5: Phone Setup & Call Forwarding
  const [forwardingEnabled, setForwardingEnabled] = useState(false);
  const [forwardingMode, setForwardingMode] = useState<
    'conditional_busy_no_answer' | 'unconditional_all_calls' | 'after_hours_only'
  >('conditional_busy_no_answer');
  const [carrierName, setCarrierName] = useState('');
  const [serverPhoneIntegration, setServerPhoneIntegration] =
    useState<PhoneIntegrationSnapshot | null>(null);

  // Load auth & any existing incomplete onboarding draft on mount
  useEffect(() => {
    async function loadOnboardingState() {
      try {
        const statusRes = await fetch('/api/auth/status');
        const statusData = await statusRes.json();

        if (!statusData.authenticated) {
          setIsAuthenticated(false);
          setCurrentStep(1);
          setCheckingAuth(false);
          return;
        }

        setIsAuthenticated(true);
        if (statusData.user?.email) {
          setUserEmail(statusData.user.email);
          setBusinessEmail((prev) => prev || statusData.user.email);
        }
        if (statusData.user?.id) {
          setUserId(statusData.user.id);
        }

        // If already completed onboarding and not explicitly editing, redirect to dashboard
        const urlParams = new URLSearchParams(window.location.search);
        const forceResume = urlParams.get('resume') === '1';

        if (statusData.hasBusiness && statusData.onboardingCompleted && !forceResume) {
          router.push('/dashboard');
          return;
        }

        // Fetch existing onboarding draft from GET /api/contractor/onboarding
        const draftRes = await fetch('/api/contractor/onboarding');
        if (draftRes.ok) {
          const draftData = await draftRes.json();
          if (draftData.phoneIntegration) {
            setServerPhoneIntegration(draftData.phoneIntegration);
          }
          if (draftData.hasBusiness && draftData.draft) {
            const d = draftData.draft;
            setHasExistingDraft(true);
            if (d.name) setBusinessName(d.name);
            if (d.phone) setPhone(d.phone);
            if (d.businessEmail) setBusinessEmail(d.businessEmail);
            if (d.website) setWebsite(d.website);
            if (d.address) setAddress(d.address);
            if (d.city) setCity(d.city);
            if (d.state) setState(d.state);
            if (d.postalCode) setPostalCode(d.postalCode);
            if (d.timezone) setTimezone(d.timezone);
            if (Array.isArray(d.serviceAreas) && d.serviceAreas.length > 0) {
              setServiceAreas(d.serviceAreas);
            }
            if (Array.isArray(d.supportedZips)) {
              setSupportedZips(d.supportedZips);
            }
            if (Array.isArray(d.servicesOffered) && d.servicesOffered.length > 0) {
              setServicesOffered(d.servicesOffered);
            }
            if (d.businessHours?.weekdays) setWeekdayHours(d.businessHours.weekdays);
            if (d.businessHours?.saturday !== undefined) setSaturdayHours(d.businessHours.saturday);
            if (d.businessHours?.sunday !== undefined) setSundayHours(d.businessHours.sunday);
            if (typeof d.emergencyServiceEnabled === 'boolean') {
              setEmergencyServiceEnabled(d.emergencyServiceEnabled);
            }
            if (d.afterHoursBehavior) setAfterHoursBehavior(d.afterHoursBehavior);
            if (d.afterHoursInstructions) setAfterHoursInstructions(d.afterHoursInstructions);
            if (d.transferPhoneNumber) setTransferPhoneNumber(d.transferPhoneNumber);
            if (d.transferInstructions) setTransferInstructions(d.transferInstructions);
            if (d.customGreeting) setCustomGreeting(d.customGreeting);
            if (d.pronunciationGuide) setPronunciationGuide(d.pronunciationGuide);
            if (Array.isArray(d.supportedLanguages) && d.supportedLanguages.length > 0) {
              setSupportedLanguages(d.supportedLanguages);
            }
            if (Array.isArray(d.callerIntakeQuestions) && d.callerIntakeQuestions.length > 0) {
              setCallerIntakeQuestions(d.callerIntakeQuestions);
            }
            if (typeof d.forwardingEnabled === 'boolean') {
              setForwardingEnabled(d.forwardingEnabled);
            }
            if (d.forwardingMode) setForwardingMode(d.forwardingMode);
            if (d.carrierName) setCarrierName(d.carrierName);

            const savedStep =
              typeof draftData.onboardingStep === 'number' &&
              draftData.onboardingStep >= 2 &&
              draftData.onboardingStep <= 6
                ? draftData.onboardingStep
                : 2;
            setCurrentStep(savedStep);
          }
        }
      } catch (err) {
        console.error('Failed to verify onboarding status:', err);
      } finally {
        setCheckingAuth(false);
      }
    }

    loadOnboardingState();
  }, [router]);

  // Compute live phone integration status accurately without ever faking a provisioned number
  const computedPhoneIntegration: PhoneIntegrationSnapshot = React.useMemo(() => {
    if (
      serverPhoneIntegration &&
      serverPhoneIntegration.status === 'connected_and_verified' &&
      serverPhoneIntegration.assignedAerisNumber
    ) {
      return serverPhoneIntegration;
    }

    const digits = phone.replace(/\D/g, '');
    const hasValidBusinessPhone =
      digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));

    if (!hasValidBusinessPhone) {
      return {
        status: 'not_configured',
        statusLabel: 'Not configured',
        statusReason:
          'Enter a valid 10-digit business phone number in Step 2 to configure call forwarding.',
        assignedAerisNumber: null,
        forwardingNumber: null,
        twilioSidVerified: false,
      };
    }

    if (!forwardingEnabled) {
      return {
        status: 'setup_required',
        statusLabel: 'Setup required',
        statusReason:
          'Your business phone number is recorded, but call forwarding to AERIS has not been enabled yet. Enable call forwarding below when you are ready.',
        assignedAerisNumber: null,
        forwardingNumber: phone,
        twilioSidVerified: false,
      };
    }

    return {
      status: 'configuration_pending',
      statusLabel: 'Configuration pending',
      statusReason:
        'Call forwarding preferences are saved. A dedicated AERIS inbound routing number has not been provisioned to this account yet. No phone number is claimed as provisioned until carrier routing is verified.',
      assignedAerisNumber: null,
      forwardingNumber: phone,
      twilioSidVerified: false,
    };
  }, [phone, forwardingEnabled, serverPhoneIntegration]);

  // Build current form payload
  const buildFormPayload = (options?: {
    isDraft?: boolean;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
  }) => ({
    name: businessName,
    phone,
    businessEmail: businessEmail || userEmail,
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
    transferPhoneNumber: transferPhoneNumber || phone,
    transferInstructions,
    customGreeting,
    pronunciationGuide,
    supportedLanguages,
    callerIntakeQuestions,
    forwardingEnabled,
    forwardingMode,
    carrierName,
    isDraft: options?.isDraft ?? false,
    onboardingCompleted: options?.onboardingCompleted ?? true,
    onboardingStep: options?.onboardingStep ?? currentStep,
    resumeUpdate: hasExistingDraft,
  });

  // Step 1 Inline Supabase Sign-In / Sign-Up Handler
  const handleInlineAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setAuthSuccessNotice(null);

    if (!authEmailInput.trim() || !authPasswordInput) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    if (authMode === 'signup') {
      if (authPasswordInput.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
      if (authPasswordInput !== authConfirmPasswordInput) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setAuthLoading(true);
    try {
      const supabase = createClient();
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmailInput.trim(),
          password: authPasswordInput,
        });
        if (error) {
          setErrorMessage(error.message);
          setAuthLoading(false);
          return;
        }
        if (data.user && !data.session) {
          setAuthSuccessNotice(
            'Account created! Please check your email inbox to confirm your address, or sign in if confirmation is disabled.'
          );
          setAuthMode('signin');
          setAuthLoading(false);
          return;
        }
        if (data.user) {
          setIsAuthenticated(true);
          setUserEmail(data.user.email || authEmailInput.trim());
          setUserId(data.user.id);
          setBusinessEmail((prev) => prev || data.user?.email || authEmailInput.trim());
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmailInput.trim(),
          password: authPasswordInput,
        });
        if (error) {
          setErrorMessage(error.message);
          setAuthLoading(false);
          return;
        }
        if (data.user) {
          setIsAuthenticated(true);
          setUserEmail(data.user.email || authEmailInput.trim());
          setUserId(data.user.id);
          setBusinessEmail((prev) => prev || data.user?.email || authEmailInput.trim());
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 1 Join Existing Organization Handler
  const handleJoinOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const validation = validateOnboardingStep(1, {
      action: 'join',
      organizationSlug: joinOrgSlug,
      verificationPhone: joinVerificationPhone,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage('Please provide both the organization slug and 10-digit business phone.');
      return;
    }

    setJoiningOrg(true);
    try {
      const res = await fetch('/api/contractor/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          organizationSlug: joinOrgSlug.trim().toLowerCase(),
          verificationPhone: joinVerificationPhone.trim(),
          memberRole: 'dispatcher',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details) setFieldErrors(data.details);
        setErrorMessage(data.error || 'Could not join organization. Verify the slug and phone.');
        setJoiningOrg(false);
        return;
      }

      setCompletionSuccess(
        data.message || 'Successfully joined contractor organization! Redirecting to dashboard...'
      );
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1000);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error while joining organization.'
      );
      setJoiningOrg(false);
    }
  };

  // Helper list handlers
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

  const toggleLanguage = (code: SupportedVoiceLanguage) => {
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

  // Validate current step before moving forward
  const handleNextStep = () => {
    setErrorMessage(null);
    setFieldErrors({});
    setDraftSavedBanner(null);

    if (currentStep === 1) {
      if (!isAuthenticated) {
        setErrorMessage('Please sign in or create your contractor account before continuing.');
        return;
      }
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const stepValidation = validateOnboardingStep(currentStep, buildFormPayload());
    if (!stepValidation.valid) {
      setFieldErrors(stepValidation.errors);
      setErrorMessage('Please complete the highlighted fields on this step before continuing.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, 6));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevStep = () => {
    setErrorMessage(null);
    setFieldErrors({});
    setDraftSavedBanner(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save Incomplete Draft & Resume Later
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setFieldErrors({});
    setDraftSavedBanner(null);

    if (!businessName.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage(
        'To save an onboarding draft, please enter at least your Business Name, Phone, and Street Address in Step 2.'
      );
      if (currentStep < 2) setCurrentStep(2);
      return;
    }

    setSavingDraft(true);
    try {
      const payload = buildFormPayload({
        isDraft: true,
        onboardingCompleted: false,
        onboardingStep: currentStep,
      });

      const res = await fetch('/api/contractor/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) setFieldErrors(data.details);
        setErrorMessage(data.error || 'Failed to save onboarding draft.');
        return;
      }

      setHasExistingDraft(true);
      if (data.phoneIntegration) {
        setServerPhoneIntegration(data.phoneIntegration);
      }
      setDraftSavedBanner(
        `Draft saved at Step ${currentStep}. You can safely close this tab and resume onboarding anytime.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error saving draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Final Step 6 Submit: Complete Onboarding & Save Configuration
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setDraftSavedBanner(null);

    const payload = buildFormPayload({
      isDraft: false,
      onboardingCompleted: true,
      onboardingStep: 6,
    });

    const validation = validateOnboardingInput(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage('Please review and correct the highlighted fields before launching.');
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
          setErrorMessage('Your organization is already onboarded. Redirecting to dashboard...');
          setTimeout(() => router.push('/dashboard'), 1200);
          return;
        }
        if (data.details && typeof data.details === 'object') {
          setFieldErrors(data.details);
        }
        setErrorMessage(data.error || 'Failed to save contractor onboarding profile.');
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (data.phoneIntegration) {
        setServerPhoneIntegration(data.phoneIntegration);
      }

      setCompletionSuccess(
        'Your contractor profile and AI receptionist configuration are saved! Redirecting to your live dashboard...'
      );
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Network error submitting onboarding profile.';
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
          <p className="text-xs text-slate-500 font-medium">
            Loading your contractor onboarding workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Brand & Progress Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AERIS Receptionist Contractor Onboarding</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Set Up Your HVAC Receptionist
            </h1>
            <p className="text-xs text-slate-500">
              Step {currentStep} of 6 — {STEP_DEFINITIONS[currentStep - 1]?.subtitle}
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5">
            {isAuthenticated && userEmail ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>{userEmail}</span>
              </div>
            ) : (
              <Link
                href="/login?redirect=/onboarding"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Open Full Login Page</span>
              </Link>
            )}
            {hasExistingDraft && (
              <span className="text-[11px] text-blue-600 font-medium">
                Saved onboarding draft restored
              </span>
            )}
          </div>
        </div>

        {/* 6-Step Interactive Stepper */}
        <nav aria-label="Onboarding progress" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <ol className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {STEP_DEFINITIONS.map((item) => {
              const isCurrent = currentStep === item.step;
              const isCompleted = currentStep > item.step;
              const canJump = isAuthenticated && (item.step <= currentStep || hasExistingDraft);

              return (
                <li key={item.step}>
                  <button
                    type="button"
                    disabled={!canJump}
                    onClick={() => {
                      if (canJump) {
                        setErrorMessage(null);
                        setFieldErrors({});
                        setCurrentStep(item.step);
                      }
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex flex-col gap-1 ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 shadow-2xs'
                        : isCompleted
                        ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900 hover:bg-emerald-50 cursor-pointer'
                        : 'border-slate-200 bg-slate-50/60 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold ${
                          isCurrent
                            ? 'bg-blue-600 text-white'
                            : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isCompleted ? '✓' : item.step}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-75">
                        Step {item.step}
                      </span>
                    </div>
                    <span className="text-xs font-bold truncate">{item.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Feedback Banners */}
        {draftSavedBanner && (
          <div className="rounded-xl bg-blue-50 p-4 border border-blue-200 flex items-start justify-between gap-3 text-blue-900 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Progress Saved</p>
                <p className="text-xs mt-0.5 text-blue-800">{draftSavedBanner}</p>
              </div>
            </div>
            <Link
              href="/"
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline shrink-0"
            >
              Return Home
            </Link>
          </div>
        )}

        {completionSuccess && (
          <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Onboarding Complete</p>
              <p className="text-xs mt-0.5 text-emerald-800">{completionSuccess}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl bg-red-50 p-4 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Action Required</p>
              <p className="text-xs">{errorMessage}</p>
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="list-disc list-inside text-xs text-red-700 pt-1 space-y-0.5">
                  {Object.entries(fieldErrors).map(([key, msg]) => (
                    <li key={key}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 1: CREATE ACCOUNT & ORGANIZATION SELECTION
            ===================================================================== */}
        {currentStep === 1 && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Step 1: Contractor Account &amp; Organization
                </h2>
                <p className="text-xs text-slate-500">
                  Authenticate with Supabase Auth and choose whether to create a new HVAC contractor organization or join an existing team.
                </p>
              </div>
            </div>

            {!isAuthenticated ? (
              <form onSubmit={handleInlineAuth} className="space-y-4 max-w-md mx-auto py-2">
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      authMode === 'signup'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Create New Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      authMode === 'signin'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In to Existing Account
                  </button>
                </div>

                {authSuccessNotice && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {authSuccessNotice}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmailInput}
                    onChange={(e) => setAuthEmailInput(e.target.value)}
                    placeholder="owner@yourhvaccompany.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={authPasswordInput}
                    onChange={(e) => setAuthPasswordInput(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={authConfirmPasswordInput}
                      onChange={(e) => setAuthConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {authMode === 'signup'
                          ? 'Register Contractor Account'
                          : 'Sign In & Continue'}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                {/* Verified Account Card */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      Authenticated Contractor Session
                    </span>
                    <p className="text-sm font-bold text-slate-900">{userEmail}</p>
                    {userId && (
                      <p className="text-[11px] text-slate-400 font-mono">Account ID: {userId}</p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Verified</span>
                  </span>
                </div>

                {/* Organization Mode Selector */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Choose How to Set Up Your Organization
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setOrgAction('create');
                        setErrorMessage(null);
                      }}
                      className={`text-left p-4 rounded-xl border transition space-y-1.5 ${
                        orgAction === 'create'
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Building2 className="h-4 w-4 text-blue-600" />
                          <span>Create New Organization</span>
                        </span>
                        {orgAction === 'create' && (
                          <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Set up a new HVAC business profile, service territory, receptionist voice behavior, and call forwarding as the organization owner.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOrgAction('join');
                        setErrorMessage(null);
                      }}
                      className={`text-left p-4 rounded-xl border transition space-y-1.5 ${
                        orgAction === 'join'
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Users className="h-4 w-4 text-blue-600" />
                          <span>Join Existing Organization</span>
                        </span>
                        {orgAction === 'join' && (
                          <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Join an already-onboarded contractor workspace as an authorized team member using your company&apos;s organization slug and business phone.
                      </p>
                    </button>
                  </div>
                </div>

                {orgAction === 'join' ? (
                  <form
                    onSubmit={handleJoinOrganization}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4"
                  >
                    <h3 className="text-sm font-bold text-slate-900">
                      Join Existing Contractor Workspace
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Organization Slug *
                        </label>
                        <input
                          type="text"
                          required
                          value={joinOrgSlug}
                          onChange={(e) => setJoinOrgSlug(e.target.value)}
                          placeholder="e.g. apex-heating-air-a1b2c3"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                        />
                        {fieldErrors.organizationSlug && (
                          <p className="text-xs text-red-600 mt-1">
                            {fieldErrors.organizationSlug}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Registered Business Phone (Verification) *
                        </label>
                        <input
                          type="tel"
                          required
                          value={joinVerificationPhone}
                          onChange={(e) => setJoinVerificationPhone(e.target.value)}
                          placeholder="(214) 555-0199"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                        />
                        {fieldErrors.verificationPhone && (
                          <p className="text-xs text-red-600 mt-1">
                            {fieldErrors.verificationPhone}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={joiningOrg}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {joiningOrg ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Verifying &amp; Joining...</span>
                          </>
                        ) : (
                          <>
                            <span>Verify &amp; Join Organization</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 py-2.5 px-6 text-sm font-semibold text-white shadow-2xs hover:bg-blue-700 transition"
                    >
                      <span>Continue to Step 2: Business Profile</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            STEP 2: BUSINESS PROFILE
            ===================================================================== */}
        {currentStep === 2 && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 2: Business Profile</h2>
                <p className="text-xs text-slate-500">
                  Provide your company contact details, operating time zone, service areas, and business hours.
                </p>
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
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-300 focus:border-blue-600'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Phone Number *
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
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Email *
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    placeholder="dispatch@apexhvac.com"
                    className={`w-full rounded-lg border pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-hidden transition ${
                      fieldErrors.businessEmail
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                  />
                </div>
                {fieldErrors.businessEmail && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.businessEmail}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Website (Optional)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Globe className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://www.apexhvac.com"
                    className={`w-full rounded-lg border pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-hidden transition ${
                      fieldErrors.website
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                  />
                </div>
                {fieldErrors.website && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.website}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Time Zone *
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                >
                  {US_CONTRACTOR_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.timezone && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.timezone}</p>
                )}
              </div>

              <div className="sm:col-span-2">
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
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-300 focus:border-blue-600'
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-hidden"
                  />
                  {fieldErrors.state && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.state}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="75201"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Service Areas */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <label className="block text-xs font-bold text-slate-800">
                  Service Areas (Cities / Counties) *
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  placeholder="Type city or county (e.g. McKinney) and press Add"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Area</span>
                </button>
              </div>
              {fieldErrors.serviceAreas && (
                <p className="text-xs text-red-600">{fieldErrors.serviceAreas}</p>
              )}

              {/* Optional ZIP codes */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Supported ZIP Codes (Optional)
                </label>
                <div className="flex gap-2">
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
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddZip}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                  >
                    Add ZIP
                  </button>
                </div>
                {supportedZips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {supportedZips.map((zip) => (
                      <span
                        key={zip}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200"
                      >
                        <span>{zip}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveZip(zip)}
                          className="text-blue-400 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Business Hours */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <label className="block text-xs font-bold text-slate-800">
                  Standard Business Hours *
                </label>
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Saturday
                  </label>
                  <input
                    type="text"
                    value={saturdayHours}
                    onChange={(e) => setSaturdayHours(e.target.value)}
                    placeholder="9:00 AM – 2:00 PM"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sunday</label>
                  <input
                    type="text"
                    value={sundayHours}
                    onChange={(e) => setSundayHours(e.target.value)}
                    placeholder="Emergency Service Only"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
              {fieldErrors.businessHours && (
                <p className="text-xs text-red-600">{fieldErrors.businessHours}</p>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 3: SERVICES
            ===================================================================== */}
        {currentStep === 3 && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 3: HVAC &amp; Custom Services</h2>
                <p className="text-xs text-slate-500">
                  Select the services your technicians perform. AERIS will qualify callers and request appointments only for enabled services.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2.5">
                Core HVAC Services (Select all that apply) *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CORE_HVAC_SERVICES.map((srv) => {
                  const checked = servicesOffered.includes(srv);
                  return (
                    <label
                      key={srv}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                        checked
                          ? 'border-blue-600 bg-blue-50/60 text-blue-950'
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
            </div>

            {/* Custom Services */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                Add Custom or Specialty Services
              </label>
              <p className="text-xs text-slate-500">
                Offer commercial refrigeration, mini-split installation, indoor air quality, or boiler repair? Add custom services below.
              </p>
              <div className="flex gap-2">
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
                  placeholder="e.g. Ductless Mini-Split Installation"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddCustomService}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Custom Service</span>
                </button>
              </div>

              {/* Active Service Pills */}
              <div className="pt-2">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Selected Services ({servicesOffered.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {servicesOffered.map((srv) => (
                    <span
                      key={srv}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-900 border border-blue-200"
                    >
                      <span>{srv}</span>
                      <button
                        type="button"
                        onClick={() => toggleService(srv)}
                        className="text-blue-400 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {fieldErrors.servicesOffered && (
                <p className="text-xs text-red-600">{fieldErrors.servicesOffered}</p>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 4: RECEPTIONIST BEHAVIOR
            ===================================================================== */}
        {currentStep === 4 && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Step 4: Receptionist Behavior &amp; Escalation Rules
                </h2>
                <p className="text-xs text-slate-500">
                  Customize how AERIS greets callers, pronounces your company name, asks qualifying questions, and handles emergencies or human callbacks.
                </p>
              </div>
            </div>

            {/* Greeting & Pronunciation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receptionist Opening Greeting
                </label>
                <input
                  type="text"
                  value={customGreeting}
                  onChange={(e) => setCustomGreeting(e.target.value)}
                  placeholder={`Thank you for calling ${businessName || 'our office'}! How can our HVAC team help you today?`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Spoken verbatim when answering inbound calls.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                  <Volume2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Business Name Pronunciation or Preferred Wording (Optional)</span>
                </label>
                <input
                  type="text"
                  value={pronunciationGuide}
                  onChange={(e) => setPronunciationGuide(e.target.value)}
                  placeholder="e.g. Pronounced 'AY-pex Heating and Air' — say 'Apex Comfort' on second reference"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Supported Voice Languages */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-blue-600" />
                <label className="block text-xs font-bold text-slate-800">
                  Supported Voice Languages *
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Limited strictly to languages verified for low-latency Gemini Live &amp; Twilio voice streaming.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUPPORTED_VOICE_LANGUAGES.map((lang) => {
                  const selected = supportedLanguages.includes(lang.code);
                  return (
                    <label
                      key={lang.code}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                        selected
                          ? 'border-blue-600 bg-blue-50/60 text-blue-950'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleLanguage(lang.code)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span>{lang.label}</span>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                        {lang.code}
                      </span>
                    </label>
                  );
                })}
              </div>
              {fieldErrors.supportedLanguages && (
                <p className="text-xs text-red-600">{fieldErrors.supportedLanguages}</p>
              )}
            </div>

            {/* Questions the Receptionist Should Ask Callers */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-blue-600" />
                  <label className="block text-xs font-bold text-slate-800">
                    Questions the Receptionist Should Ask Callers *
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setCallerIntakeQuestions([...DEFAULT_CALLER_INTAKE_QUESTIONS])}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                >
                  Reset to Default Questions
                </button>
              </div>
              <div className="space-y-2">
                {callerIntakeQuestions.map((q, idx) => (
                  <div
                    key={q}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800"
                  >
                    <span className="font-medium">
                      {idx + 1}. {q}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIntakeQuestion(q)}
                      className="text-slate-400 hover:text-red-600 shrink-0"
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
                  placeholder="Add a custom intake question (e.g. Is the unit residential or commercial?)"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddIntakeQuestion}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Question</span>
                </button>
              </div>
              {fieldErrors.callerIntakeQuestions && (
                <p className="text-xs text-red-600">{fieldErrors.callerIntakeQuestions}</p>
              )}
            </div>

            {/* Emergency & After-Hours Behavior */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      24/7 Emergency Triage &amp; Escalation Enabled
                    </span>
                    <span className="text-[11px] text-slate-600 block">
                      Immediately flags severe indoor temperatures, active water leaks, or gas/burning smells as high-priority emergencies.
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={emergencyServiceEnabled}
                  onChange={(e) => setEmergencyServiceEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    After-Hours Operating Behavior
                  </label>
                  <select
                    value={afterHoursBehavior}
                    onChange={(e) => setAfterHoursBehavior(e.target.value as AfterHoursBehavior)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
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

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emergency Escalation Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={afterHoursInstructions}
                    onChange={(e) => setAfterHoursInstructions(e.target.value)}
                    placeholder="Instructions for urgent callers outside standard hours..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Human Callback & Transfer Instructions */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <PhoneForwarded className="h-4 w-4 text-blue-600" />
                <label className="block text-xs font-bold text-slate-800">
                  Human Callback &amp; Live Escalation Instructions
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Human Escalation / On-Call Phone Number
                  </label>
                  <input
                    type="tel"
                    value={transferPhoneNumber}
                    onChange={(e) => setTransferPhoneNumber(e.target.value)}
                    placeholder={phone || '(469) 555-0144'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                  {fieldErrors.transferPhoneNumber && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.transferPhoneNumber}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Human Callback &amp; Transfer Policy
                  </label>
                  <input
                    type="text"
                    value={transferInstructions}
                    onChange={(e) => setTransferInstructions(e.target.value)}
                    placeholder="When and how to promise a human callback or live transfer"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 5: PHONE SETUP
            ===================================================================== */}
        {currentStep === 5 && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <PhoneCall className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Step 5: Phone Setup &amp; Call Forwarding
                </h2>
                <p className="text-xs text-slate-500">
                  Keep your existing business phone number and forward unanswered or after-hours calls to your assigned AERIS number.
                </p>
              </div>
            </div>

            {/* Keep Existing Number Explanation */}
            <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                <Info className="h-4 w-4 text-blue-600 shrink-0" />
                <span>Keep Your Existing Business Number — No Number Porting Required</span>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                You never need to change the phone number printed on your trucks, website, or Google Business Profile.
                Your customers continue dialing <span className="font-mono font-semibold">{phone || 'your existing business number'}</span>, and your phone carrier forwards calls to your assigned AERIS AI receptionist number whenever your team is busy, on another line, or after hours.
              </p>
            </div>

            {/* Honest Live Phone Integration Status Card */}
            <div className="rounded-xl border border-slate-200 p-5 space-y-4 bg-slate-50/60">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Current Telephony Integration State
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                    Assigned AERIS Number:{' '}
                    {computedPhoneIntegration.assignedAerisNumber ? (
                      <span className="font-mono text-emerald-700">
                        {computedPhoneIntegration.assignedAerisNumber}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold">
                        Not Provisioned Yet
                      </span>
                    )}
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    PHONE_STATE_DEFINITIONS.find(
                      (s) => s.status === computedPhoneIntegration.status
                    )?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300'
                  }`}
                >
                  <span>{computedPhoneIntegration.statusLabel}</span>
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">
                {computedPhoneIntegration.statusReason}
              </p>

              {/* All 4 Honest Integration States */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {PHONE_STATE_DEFINITIONS.map((stateDef) => {
                  const isActive = computedPhoneIntegration.status === stateDef.status;
                  return (
                    <div
                      key={stateDef.status}
                      className={`p-3 rounded-xl border text-xs space-y-1 transition ${
                        isActive
                          ? 'border-blue-600 bg-white shadow-2xs ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white/60 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${stateDef.badgeClass}`}
                        >
                          {stateDef.label}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                            Current Status
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                        {stateDef.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Call Forwarding Preferences */}
            <div className="space-y-4 pt-2">
              <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">
                    Enable Call Forwarding Configuration
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Save your forwarding preference now so your account moves to Configuration Pending for AERIS inbound number assignment.
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
                    Preferred Forwarding Mode
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  >
                    <option value="conditional_busy_no_answer">
                      Conditional (When Busy or Unanswered After 3 Rings)
                    </option>
                    <option value="after_hours_only">
                      After-Hours &amp; Weekends Only
                    </option>
                    <option value="unconditional_all_calls">
                      All Inbound Calls (*72 Immediate Forwarding)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Phone Carrier / VoIP Provider (Optional)
                  </label>
                  <input
                    type="text"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="e.g. RingCentral, Verizon Business, AT&T, ServiceTitan"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 6: REVIEW & SAVE
            ===================================================================== */}
        {currentStep === 6 && (
          <form onSubmit={handleFinalSubmit} className="space-y-6">
            <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 6: Review &amp; Save Configuration
                    </h2>
                    <p className="text-xs text-slate-500">
                      Verify your contractor profile, service catalog, receptionist instructions, and phone status before saving.
                    </p>
                  </div>
                </div>
              </div>

              {/* Review Grid */}
              <div className="space-y-4">
                {/* Section: Business Profile */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Business Profile (Step 2)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Business Name</dt>
                      <dd className="font-semibold text-slate-900">{businessName || 'Not set'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Business Phone</dt>
                      <dd className="font-semibold text-slate-900">{phone || 'Not set'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Business Email</dt>
                      <dd className="font-semibold text-slate-900">
                        {businessEmail || userEmail || 'Not set'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Website</dt>
                      <dd className="font-semibold text-slate-900">{website || 'None provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Address</dt>
                      <dd className="font-semibold text-slate-900">
                        {[address, city, state, postalCode].filter(Boolean).join(', ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Time Zone</dt>
                      <dd className="font-semibold text-slate-900">{timezone}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Service Areas</dt>
                      <dd className="font-semibold text-slate-900">
                        {serviceAreas.join(', ')}
                        {supportedZips.length > 0 ? ` (ZIPs: ${supportedZips.join(', ')})` : ''}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Business Hours</dt>
                      <dd className="font-semibold text-slate-900">
                        Weekdays: {weekdayHours} | Sat: {saturdayHours || 'Closed'} | Sun:{' '}
                        {sundayHours || 'Closed'}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Section: Services */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Configured Services (Step 3)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {servicesOffered.map((srv) => (
                      <span
                        key={srv}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-900 border border-blue-200"
                      >
                        {srv}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Section: Receptionist Behavior */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Receptionist Behavior (Step 4)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Opening Greeting</dt>
                      <dd className="font-semibold text-slate-900">&ldquo;{customGreeting}&rdquo;</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Pronunciation / Preferred Wording</dt>
                      <dd className="font-semibold text-slate-900">
                        {pronunciationGuide || 'Standard pronunciation'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Supported Languages</dt>
                      <dd className="font-semibold text-slate-900">
                        {supportedLanguages.join(', ')}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Caller Intake Questions</dt>
                      <dd className="font-semibold text-slate-900">
                        {callerIntakeQuestions.join(' • ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">After-Hours Mode</dt>
                      <dd className="font-semibold text-slate-900">{afterHoursBehavior}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Human Callback Number</dt>
                      <dd className="font-semibold text-slate-900">
                        {transferPhoneNumber || phone}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Section: Phone Integration */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Phone Setup Status (Step 5)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(5)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Integration Status: </span>
                      <span className="font-bold text-slate-900">
                        {computedPhoneIntegration.statusLabel}
                      </span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className="text-slate-500">Assigned AERIS Number: </span>
                      <span className="font-semibold text-slate-900">
                        {computedPhoneIntegration.assignedAerisNumber ||
                          'Not provisioned yet'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {computedPhoneIntegration.statusReason}
                  </p>
                </div>
              </div>

              {/* Final Submit Action Bar */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Step 5</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 px-6 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Contractor Configuration...</span>
                    </>
                  ) : (
                    <>
                      <span>Save Configuration &amp; Launch Dashboard</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Navigation Footer for Steps 2..5 */}
        {currentStep >= 2 && currentStep <= 5 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handlePrevStep}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Previous Step</span>
              </button>

              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition"
              >
                {savingDraft ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving Draft...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span>Save &amp; Resume Later</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextStep}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-2xs transition"
            >
              <span>
                Continue to Step {currentStep + 1}: {STEP_DEFINITIONS[currentStep]?.title}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
