'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Bot, Mail, Lock, AlertCircle, ArrowRight, CheckCircle2, Loader2, ArrowLeft, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/context/ThemeContext';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const redirectTarget =
    rawRedirect &&
    rawRedirect.startsWith('/') &&
    !rawRedirect.startsWith('//') &&
    !rawRedirect.startsWith('/\\')
      ? rawRedirect
      : '/dashboard';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Check if Supabase client can be initialized
  const [clientAvailable, setClientAvailable] = useState<boolean>(true);

  useEffect(() => {
    try {
      createClient();
    } catch {
      setClientAvailable(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMessage(error.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          router.push(redirectTarget);
          router.refresh();
        }
      } else {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          setErrorMessage(error.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          setSuccessMessage('Account created successfully! Redirecting to setup...');
          setTimeout(() => {
            router.push('/onboarding');
            router.refresh();
          }, 800);
        } else if (data.user) {
          setSuccessMessage(
            'Account registered! Please check your email inbox to confirm your account before signing in.'
          );
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Controls: Back & Theme Toggle */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Demo Preview</span>
        </Link>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-500" />
          )}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex justify-center">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25">
            <Bot className="h-8 w-8" />
            <span className="absolute -inset-1 rounded-2xl bg-cyan-400 opacity-20 blur-xs" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
          AERIS Receptionist
        </h2>
        <p className="mt-1 text-center text-xs sm:text-sm text-[var(--muted)]">
          Contractor Portal &mdash; Manage your AI receptionist, leads, and dispatch.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[var(--surface)] py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-[var(--surface-border)]">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-xl bg-[var(--surface-raised)] p-1 mb-6 border border-[var(--surface-border)]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition ${
                mode === 'signin'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition ${
                mode === 'signup'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              Register New Contractor
            </button>
          </div>

          {!clientAvailable && (
            <div className="mb-4 rounded-xl bg-amber-500/10 p-3.5 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs">
              <strong>Notice:</strong> Supabase environment variables are not configured in this environment.
              Demo sandbox mode is available on the home page.
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-xl bg-rose-500/10 p-3.5 border border-rose-500/25 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 rounded-xl bg-emerald-500/10 p-3.5 border border-emerald-500/25 flex items-start gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required={mode === 'signup'}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className="h-4 w-4 text-[var(--muted)]" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contractor@example.com"
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] pl-10 pr-3.5 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4 w-4 text-[var(--muted)]" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] pl-10 pr-3.5 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>
              {mode === 'signup' && (
                <p className="text-[11px] text-[var(--muted)] mt-1">Must be at least 6 characters.</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-2.5 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/25 hover:from-blue-500 hover:to-cyan-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : mode === 'signin' ? (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span>Create Account &amp; Setup Receptionist</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-[var(--surface-border)] pt-4 text-center">
            <p className="text-xs text-[var(--muted)]">
              Testing the public receptionist?{' '}
              <Link href="/" className="font-semibold text-blue-600 dark:text-cyan-400 hover:underline">
                Go to Public Demo Sandbox &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
