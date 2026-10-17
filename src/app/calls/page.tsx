'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PhoneCall, ShieldAlert, RefreshCw, Loader2, Info, ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { CallHistoryTable } from '@/components/dashboard/CallHistoryTable';
import type { ContractorCallHistoryItem } from '@/lib/services/contractorPersistence';

export default function CallsPage() {
  const [calls, setCalls] = useState<ContractorCallHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRealContractor, setIsRealContractor] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authRes = await fetch('/api/auth/status');
      const authData = await authRes.json();
      const real = Boolean(authData.authenticated && authData.hasBusiness);
      setIsRealContractor(real);

      if (real) {
        const callsRes = await fetch('/api/contractor/calls?limit=100');
        if (callsRes.ok) {
          const data = await callsRes.json();
          if (data.ok && Array.isArray(data.calls)) {
            setCalls(data.calls);
          } else {
            setCalls([]);
          }
        } else {
          throw new Error('Failed to fetch call history.');
        }
      } else {
        // Unauthenticated demo mode preview
        setCalls([]);
      }
    } catch (err: unknown) {
      console.error('Failed to load call history:', err);
      setError(err instanceof Error ? err.message : 'Unable to load call logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return (
    <AppShell pageTitle="Call History & Transcripts" badge="TELEPHONY LOGS">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-cyan-400 text-xs font-semibold mb-2 border border-blue-500/20">
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Inbound Telemetry &amp; Compliance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
              Call History &amp; Transcripts
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 max-w-2xl leading-relaxed">
              Complete audit logs of customer phone conversations, turn-by-turn transcripts,
              call durations, detected intents, and privacy management actions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCalls}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] text-[var(--foreground)] border border-[var(--surface-border)] rounded-xl transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Calls</span>
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Calls Table Component */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
            <p className="text-xs text-[var(--muted)]">Loading call history and transcripts...</p>
          </div>
        ) : (
          <CallHistoryTable
            calls={calls}
            isRealContractor={isRealContractor}
            onRefresh={fetchCalls}
          />
        )}
      </div>
    </AppShell>
  );
}
