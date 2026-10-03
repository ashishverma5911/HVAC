'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { RecentLeadsTable } from '@/components/dashboard/RecentLeadsTable';
import { mockDashboardMetrics, mockRecentLeads } from '@/mock/dashboardData';
import { DashboardLead, DashboardMetrics } from '@/types';
import { ArrowLeft, Building2, LogOut, Sparkles, CheckCircle2, Loader2, PhoneCall } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    hasBusiness: boolean;
    businessName?: string | null;
    user?: { email?: string };
  } | null>(null);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>(mockDashboardMetrics);
  const [leads, setLeads] = useState<DashboardLead[]>(mockRecentLeads);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch('/api/auth/status');
        const authData = await res.json();
        setAuthStatus(authData);

        if (authData.authenticated && authData.hasBusiness) {
          // Fetch live database metrics and recent leads
          const dashRes = await fetch('/api/contractor/dashboard');
          if (dashRes.ok) {
            const dashData = await dashRes.json();
            if (dashData.success) {
              setMetrics({
                callsToday: dashData.metrics.totalCalls,
                leads: dashData.metrics.totalLeads,
                appointments: dashData.metrics.appointmentsRequested,
                urgentRequests: dashData.metrics.urgentRequests,
              });

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const mappedLeads: DashboardLead[] = (dashData.recentLeads || []).map((l: any) => ({
                id: l.id,
                customerName: l.customer_name,
                service: l.service_type,
                city: l.city_area || l.service_address || 'Service Area',
                urgency: l.urgency,
                status: l.status,
                timeReceived: new Date(l.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                phone: l.phone,
                notes: l.reported_issue,
              }));
              setLeads(mappedLeads);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoadingData(false);
      }
    }

    loadDashboard();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Failed to sign out:', err);
      router.push('/');
    }
  };

  const businessTitle = authStatus?.businessName || 'Summit HVAC Contractor Dashboard';
  const isRealContractor = authStatus?.authenticated && authStatus?.hasBusiness;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar currentRoute="dashboard" />

      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Top Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Receptionist Demo</span>
                </Link>
              </div>

              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {businessTitle}
                </h1>
                {isRealContractor ? (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Pilot Live Context</span>
                  </span>
                ) : (
                  <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                    Dallas, TX
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Live oversight of inbound AI receptionist calls, lead qualification, and technician dispatch queues.
                {authStatus?.user?.email && ` (Logged in as ${authStatus.user.email})`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isRealContractor ? (
                <>
                  <Link
                    href="/settings"
                    className="text-xs font-medium text-slate-600 hover:text-blue-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs transition"
                  >
                    Contractor Settings
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                    Mock Data Preview
                  </span>
                  <Link
                    href="/login"
                    className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition shadow-2xs"
                  >
                    Contractor Sign In
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Metric KPIs */}
          {loadingData ? (
            <div className="py-12 flex justify-center items-center">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              <MetricCards metrics={metrics} />

              {/* Zero-State for Fresh Contractors */}
              {isRealContractor && leads.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
                  <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <PhoneCall className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">No Inbound Leads Yet</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Your AERIS AI Receptionist is configured and ready. Inbound customer calls and chats will be
                      automatically qualified, recorded, and dispatched here.
                    </p>
                  </div>
                  <Link
                    href="/#interactive-demo"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span>Test Inbound Intake</span>
                  </Link>
                </div>
              ) : (
                /* Recent Leads Table */
                <RecentLeadsTable leads={leads} />
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
