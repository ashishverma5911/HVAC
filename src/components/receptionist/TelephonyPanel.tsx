'use client';

import React, { useState, useEffect } from 'react';
import {
  Phone,
  Radio,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Volume2,
  Wrench,
  AlertTriangle,
  Server,
  Activity,
  Zap,
} from 'lucide-react';

interface TelephonyStatusResponse {
  status: string;
  timestamp: number;
  uptimeSeconds?: number;
  activeCallCount: number;
  twilioConfigured: boolean;
  twilioPhoneNumber: string;
  publicHttpBaseUrl?: string | null;
  publicWsBaseUrl?: string | null;
  webhookUrl?: string;
  streamUrl?: string;
  isReadyForRealTwilio?: boolean;
  missingConfig?: string[];
  maxCallDurationSeconds: number;
  recentSessions: Array<{
    sessionId: string;
    callSid: string;
    callerPhone: string;
    durationSeconds: number;
    ended: boolean;
    leadStatus: string;
    detectedIntent: string;
    toolCalls: number;
  }>;
}

export const TelephonyPanel: React.FC = () => {
  const [telephonyStatus, setTelephonyStatus] = useState<TelephonyStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [copiedStream, setCopiedStream] = useState<boolean>(false);
  const [testWebhookResult, setTestWebhookResult] = useState<{
    success: boolean;
    message: string;
    streamUrl?: string;
  } | null>(null);
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);

  const fetchStatus = async () => {
    try {
      // First try Next.js status endpoint
      const res = await fetch('/api/telephony/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setTelephonyStatus(data);
        setIsLoading(false);
        return;
      }
    } catch {
      // If Next.js route fails, fallback to direct telephony port if available
      try {
        const fallbackRes = await fetch('http://localhost:8080/api/telephony/status', {
          cache: 'no-store',
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setTelephonyStatus(data);
          setIsLoading(false);
          return;
        }
      } catch {}
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const effectiveWebhookUrl =
    telephonyStatus?.webhookUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/api/telephony/twilio/voice`
      : '/api/telephony/twilio/voice');
  const effectiveStreamUrl =
    telephonyStatus?.streamUrl ||
    (typeof window !== 'undefined'
      ? `ws://${window.location.hostname}:8080/api/telephony/twilio-stream`
      : 'ws://localhost:8080/api/telephony/twilio-stream');

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(effectiveWebhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleCopyStreamUrl = () => {
    navigator.clipboard.writeText(effectiveStreamUrl);
    setCopiedStream(true);
    setTimeout(() => setCopiedStream(false), 2000);
  };

  const handleTestWebhook = async () => {
    setIsTestingWebhook(true);
    setTestWebhookResult(null);
    try {
      const res = await fetch('/api/telephony/twilio/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=TEST-PREFLIGHT-123&From=%2B15551234567&To=%2B15557654321',
      });

      if (res.ok) {
        const text = await res.text();
        const streamMatch = text.match(/<Stream url="([^"]+)"/);
        const extractedStreamUrl = streamMatch ? streamMatch[1] : undefined;

        if (extractedStreamUrl) {
          setTestWebhookResult({
            success: true,
            message: `TwiML validated! Generated stream URL points to: ${extractedStreamUrl}`,
            streamUrl: extractedStreamUrl,
          });
        } else {
          setTestWebhookResult({
            success: false,
            message: 'TwiML response received, but <Stream url="..."> tag is missing.',
          });
        }
      } else {
        setTestWebhookResult({
          success: false,
          message: `Webhook returned status ${res.status}: ${res.statusText}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setTestWebhookResult({ success: false, message: `Error: ${msg}` });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const isServerOnline = telephonyStatus?.status === 'online';
  const isReadyForRealTwilio = telephonyStatus?.isReadyForRealTwilio ?? false;

  return (
    <div className="space-y-6">
      {/* Top Telephony Health Banner */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--surface-border)]">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-xl ${
                isServerOnline
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
              }`}
            >
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-[var(--foreground)]">
                  Inbound Telephony Bridge
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isServerOnline
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isServerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {isServerOnline ? 'Bridge Ready' : 'Connecting...'}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Bridges inbound customer phone calls to AERIS Voice over real-time media streams
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] rounded-lg transition-colors border border-[var(--surface-border)]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleTestWebhook}
              disabled={isTestingWebhook}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 rounded-lg transition-all shadow-sm shadow-blue-500/20"
            >
              <Radio className="w-3.5 h-3.5" />
              {isTestingWebhook ? 'Testing...' : 'Test Voice Webhook'}
            </button>
          </div>
        </div>

        {/* Preflight Public Endpoints Validation Banner */}
        <div className="mt-4">
          {isReadyForRealTwilio ? (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="flex-1 font-medium">
                <strong>Preflight Passed:</strong> Both public voice and media stream endpoints are configured for live inbound calls.
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Preflight Notice: Local / Simulation Mode Active</span>
              </div>
              <p className="mt-1.5 text-[var(--muted)]">
                Before connecting a real phone carrier, configure separate public URLs in <code className="font-mono bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200">.env.local</code>:
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1 font-mono text-[11px] text-amber-700 dark:text-amber-300">
                {telephonyStatus?.missingConfig?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                )) || (
                  <>
                    <li>PUBLIC_HTTP_BASE_URL is not set (points to Next.js on port 3000)</li>
                    <li>PUBLIC_WS_BASE_URL is not set (points to Telephony server on port 8080)</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Test Result Alert */}
        {testWebhookResult && (
          <div
            className={`mt-4 p-3.5 rounded-xl text-xs flex flex-col gap-1 ${
              testWebhookResult.success
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {testWebhookResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{testWebhookResult.message}</span>
            </div>
          </div>
        )}

        {/* Telephony Configuration Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5">
          <div className="bg-[var(--surface-raised)] p-3.5 rounded-xl border border-[var(--surface-border)]">
            <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider">
              Inbound Phone Line
            </div>
            <div className="text-sm font-semibold text-[var(--foreground)] mt-1.5 font-mono">
              {telephonyStatus?.twilioPhoneNumber || 'Not Configured'}
            </div>
          </div>

          <div className="bg-[var(--surface-raised)] p-3.5 rounded-xl border border-[var(--surface-border)]">
            <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider">
              Active Phone Calls
            </div>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {telephonyStatus?.activeCallCount ?? 0} concurrent
            </div>
          </div>

          <div className="bg-[var(--surface-raised)] p-3.5 rounded-xl border border-[var(--surface-border)]">
            <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider">
              Cost Protection
            </div>
            <div className="text-sm font-semibold text-[var(--foreground)] mt-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
              Max {telephonyStatus?.maxCallDurationSeconds ? Math.round(telephonyStatus.maxCallDurationSeconds / 60) : 5} min / call
            </div>
          </div>

          <div className="bg-[var(--surface-raised)] p-3.5 rounded-xl border border-[var(--surface-border)]">
            <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider">
              Security
            </div>
            <div className="text-sm font-semibold text-[var(--foreground)] mt-1.5 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              Security Signature
            </div>
          </div>
        </div>

        {/* Distinct Public Endpoints Display */}
        <div className="mt-5 pt-5 border-t border-[var(--surface-border)] space-y-4">
          {/* 1. Inbound Voice Webhook URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                1. Voice Webhook URL (HTTP / HTTPS &mdash; carrier webhook routing):
              </label>
              <span className="text-[10px] text-[var(--muted)] font-mono">Port 3000 / Next.js</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[var(--surface-raised)] px-3 py-2 rounded-xl text-xs font-mono text-[var(--foreground)] border border-[var(--surface-border)] select-all overflow-x-auto whitespace-nowrap">
                {effectiveWebhookUrl}
              </code>
              <button
                onClick={handleCopyWebhookUrl}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--foreground)] bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] rounded-xl transition-colors border border-[var(--surface-border)] shrink-0"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedWebhook ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* 2. Media Stream WebSocket URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                2. Media Stream WebSocket Target (WS / WSS &mdash; real-time audio pipeline):
              </label>
              <span className="text-[10px] text-[var(--muted)] font-mono">Port 8080 / Telephony Server</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[var(--surface-raised)] px-3 py-2 rounded-xl text-xs font-mono text-[var(--foreground)] border border-[var(--surface-border)] select-all overflow-x-auto whitespace-nowrap">
                {effectiveStreamUrl}
              </code>
              <button
                onClick={handleCopyStreamUrl}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--foreground)] bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] rounded-xl transition-colors border border-[var(--surface-border)] shrink-0"
              >
                {copiedStream ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedStream ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live / Recent Calls Monitor */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-4 h-4 text-blue-500" />
            <h4 className="text-sm font-bold text-[var(--foreground)]">Phone Call Activity Log</h4>
          </div>
          <span className="text-xs text-[var(--muted)] font-mono">
            {telephonyStatus?.recentSessions?.length || 0} calls recorded
          </span>
        </div>

        {!telephonyStatus?.recentSessions || telephonyStatus.recentSessions.length === 0 ? (
          <div className="py-10 text-center text-[var(--muted)] text-xs">
            <Radio className="w-8 h-8 mx-auto mb-2 text-[var(--muted)] opacity-50" />
            No incoming phone calls received yet.
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Calls made to your connected phone line will show live telemetry here with barge-in &amp; intake actions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-raised)] text-[var(--muted)] border-b border-[var(--surface-border)]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Caller Phone</th>
                  <th className="py-2.5 px-3 font-semibold">Duration</th>
                  <th className="py-2.5 px-3 font-semibold">Lead Status</th>
                  <th className="py-2.5 px-3 font-semibold">Detected Intent</th>
                  <th className="py-2.5 px-3 font-semibold">Tools Executed</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-border)]/50">
                {telephonyStatus.recentSessions.map((call) => (
                  <tr key={call.sessionId} className="hover:bg-[var(--surface-raised)]/60 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-[var(--foreground)]">
                      {call.callerPhone}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--muted)]">{call.durationSeconds}s</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-cyan-400 capitalize border border-blue-500/20">
                        {call.leadStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--muted)] capitalize">
                      {call.detectedIntent.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[var(--foreground)]">
                      {call.toolCalls > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Wrench className="w-3 h-3" />
                          {call.toolCalls} actions
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">None</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {call.ended ? (
                        <span className="text-[var(--muted)] font-medium">Completed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          In Call
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Telephony Setup Guidance Card */}
      <div className="bg-gradient-to-br from-[#0B1220] to-[#101C2E] text-white rounded-2xl p-6 border border-slate-800 shadow-md">
        <h4 className="text-sm font-bold flex items-center gap-2 mb-3 text-white">
          <Phone className="w-4 h-4 text-cyan-400" />
          Preflight Guide: Connecting Live Phone Calls in 3 Steps
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-xs">
            <div className="font-bold text-cyan-400 mb-1">1. Configure Public Endpoints</div>
            <p className="text-slate-300 leading-relaxed">
              Set <code className="text-cyan-200 font-mono bg-black/40 px-1 py-0.5 rounded">PUBLIC_HTTP_BASE_URL</code> (HTTP webhook) and <code className="text-cyan-200 font-mono bg-black/40 px-1 py-0.5 rounded">PUBLIC_WS_BASE_URL</code> (WebSocket server).
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-xs">
            <div className="font-bold text-cyan-400 mb-1">2. Configure Carrier Webhook</div>
            <p className="text-slate-300 leading-relaxed">
              In your voice provider console, set the Voice Webhook to <code className="text-cyan-200 font-mono bg-black/40 px-1 py-0.5 rounded">POST https://PUBLIC_HTTP_BASE_URL/api/telephony/twilio/voice</code>.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-xs">
            <div className="font-bold text-cyan-400 mb-1">3. Dial the Phone Number</div>
            <p className="text-slate-300 leading-relaxed">
              When a caller dials the number, the gateway streams audio directly to <code className="text-cyan-200 font-mono bg-black/40 px-1 py-0.5 rounded">wss://PUBLIC_WS_BASE_URL/...</code> for real-time AERIS Voice intake.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
