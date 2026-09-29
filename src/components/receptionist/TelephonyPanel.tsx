'use client';

import React, { useState, useEffect } from 'react';
import { Phone, Radio, Shield, Clock, CheckCircle2, AlertCircle, Copy, Check, RefreshCw, Volume2, Wrench, AlertTriangle, ArrowRight, Server } from 'lucide-react';

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
  const [testWebhookResult, setTestWebhookResult] = useState<{ success: boolean; message: string; streamUrl?: string } | null>(null);
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
        const fallbackRes = await fetch('http://localhost:8080/api/telephony/status', { cache: 'no-store' });
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

  const effectiveWebhookUrl = telephonyStatus?.webhookUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/telephony/twilio/voice` : '/api/telephony/twilio/voice');
  const effectiveStreamUrl = telephonyStatus?.streamUrl || (typeof window !== 'undefined' ? `ws://${window.location.hostname}:8080/api/telephony/twilio-stream` : 'ws://localhost:8080/api/telephony/twilio-stream');

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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${isServerOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Twilio US Telephony Bridge</h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isServerOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isServerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {isServerOnline ? 'Bridge Ready' : 'Connecting...'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bridges inbound PSTN phone calls to Gemini 3.8 Live over 8kHz μ-law WebSockets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleTestWebhook}
              disabled={isTestingWebhook}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
            >
              <Radio className="w-3.5 h-3.5" />
              {isTestingWebhook ? 'Testing...' : 'Test TwiML Webhook'}
            </button>
          </div>
        </div>

        {/* Preflight Public Endpoints Validation Banner */}
        <div className="mt-4">
          {isReadyForRealTwilio ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 font-medium">
                <strong>Preflight Passed:</strong> Both <code className="font-mono text-emerald-900 bg-emerald-100/60 px-1 py-0.5 rounded">PUBLIC_HTTP_BASE_URL</code> and <code className="font-mono text-emerald-900 bg-emerald-100/60 px-1 py-0.5 rounded">PUBLIC_WS_BASE_URL</code> are configured for live Twilio PSTN calls.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="flex items-center gap-2 font-semibold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Preflight Notice: Local Simulation Mode Active</span>
              </div>
              <p className="mt-1 text-slate-600">
                Before connecting a real Twilio phone number, configure separate public URLs in <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">.env.local</code>:
              </p>
              <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-slate-600 font-mono text-[11px]">
                {telephonyStatus?.missingConfig?.map((item, idx) => (
                  <li key={idx} className="text-amber-800">{item}</li>
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
          <div className={`mt-3 p-3 rounded-lg text-xs flex flex-col gap-1 ${
            testWebhookResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            <div className="flex items-center gap-2 font-semibold">
              {testWebhookResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{testWebhookResult.message}</span>
            </div>
          </div>
        )}

        {/* Telephony Configuration Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Twilio Phone #</div>
            <div className="text-sm font-semibold text-slate-800 mt-1 font-mono">
              {telephonyStatus?.twilioPhoneNumber || 'Not Configured'}
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active PSTN Calls</div>
            <div className="text-sm font-semibold text-emerald-700 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {telephonyStatus?.activeCallCount ?? 0} concurrent
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cost Protection</div>
            <div className="text-sm font-semibold text-slate-800 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Max {telephonyStatus?.maxCallDurationSeconds ? Math.round(telephonyStatus.maxCallDurationSeconds / 60) : 5} min / call
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Security</div>
            <div className="text-sm font-semibold text-slate-800 mt-1 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              HMAC-SHA1 Sig
            </div>
          </div>
        </div>

        {/* Distinct Public Endpoints Display */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          {/* 1. Inbound Voice Webhook URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                1. Twilio Voice Webhook URL (HTTP / HTTPS &mdash; for Twilio Phone Number console):
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Port 3000 / Next.js</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-100 px-3 py-2 rounded-lg text-xs font-mono text-slate-800 border border-slate-200 select-all overflow-x-auto whitespace-nowrap">
                {effectiveWebhookUrl}
              </code>
              <button
                onClick={handleCopyWebhookUrl}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 shrink-0"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedWebhook ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* 2. Media Stream WebSocket URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                2. Media Stream WebSocket Target (WS / WSS &mdash; TwiML streams audio here):
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Port 8080 / Telephony Server</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-100 px-3 py-2 rounded-lg text-xs font-mono text-slate-800 border border-slate-200 select-all overflow-x-auto whitespace-nowrap">
                {effectiveStreamUrl}
              </code>
              <button
                onClick={handleCopyStreamUrl}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 shrink-0"
              >
                {copiedStream ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedStream ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live / Recent Calls Monitor */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">PSTN Phone Call Activity Log</h4>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {telephonyStatus?.recentSessions?.length || 0} calls recorded
          </span>
        </div>

        {(!telephonyStatus?.recentSessions || telephonyStatus.recentSessions.length === 0) ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <Radio className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
            No incoming phone calls received yet.
            <p className="text-[11px] text-slate-400 mt-1">
              Calls made to your Twilio number will show live telemetry here with barge-in &amp; tool actions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Caller Phone</th>
                  <th className="py-2.5 px-3 font-semibold">Duration</th>
                  <th className="py-2.5 px-3 font-semibold">Lead Status</th>
                  <th className="py-2.5 px-3 font-semibold">Detected Intent</th>
                  <th className="py-2.5 px-3 font-semibold">Tools Executed</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {telephonyStatus.recentSessions.map((call) => (
                  <tr key={call.sessionId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium text-slate-900">{call.callerPhone}</td>
                    <td className="py-2 px-3 text-slate-600">{call.durationSeconds}s</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 capitalize">
                        {call.leadStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 capitalize">
                      {call.detectedIntent.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-700">
                      {call.toolCalls > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Wrench className="w-3 h-3" />
                          {call.toolCalls} actions
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {call.ended ? (
                        <span className="text-slate-500 font-medium">Completed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold animate-pulse">
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

      {/* Twilio Setup Guidance Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-sm">
        <h4 className="text-sm font-bold flex items-center gap-2 mb-2 text-white">
          <Phone className="w-4 h-4 text-emerald-400" />
          Preflight Guide: Connecting Real Twilio Phone Calls in 3 Steps
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="bg-white/10 rounded-lg p-3 backdrop-blur-xs">
            <div className="font-bold text-emerald-400 mb-1">1. Expose Both Local Ports</div>
            <p className="text-slate-300">
              Expose port 3000 as <code className="text-white font-mono bg-black/30 px-1 py-0.5 rounded">PUBLIC_HTTP_BASE_URL</code> (Next.js webhook), and port 8080 as <code className="text-white font-mono bg-black/30 px-1 py-0.5 rounded">PUBLIC_WS_BASE_URL</code> (WebSocket server).
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-3 backdrop-blur-xs">
            <div className="font-bold text-emerald-400 mb-1">2. Configure Twilio Webhook</div>
            <p className="text-slate-300">
              In Twilio Console &gt; Phone Numbers, set Voice Webhook to <code className="text-white font-mono bg-black/30 px-1 py-0.5 rounded">POST https://PUBLIC_HTTP_BASE_URL/api/telephony/twilio/voice</code>.
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-3 backdrop-blur-xs">
            <div className="font-bold text-emerald-400 mb-1">3. Dial the Phone Number</div>
            <p className="text-slate-300">
              When Twilio calls the webhook, TwiML streams audio directly to <code className="text-white font-mono bg-black/30 px-1 py-0.5 rounded">wss://PUBLIC_WS_BASE_URL/...</code> for real-time Gemini Live AI conversation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
