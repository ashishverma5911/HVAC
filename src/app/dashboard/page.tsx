'use client';

import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { RecentLeadsTable } from '@/components/dashboard/RecentLeadsTable';
import { mockDashboardMetrics, mockRecentLeads } from '@/mock/dashboardData';
import { ArrowLeft, Building2, SlidersHorizontal, Download } from 'lucide-react';

export default function DashboardPage() {
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
                  Summit HVAC Contractor Dashboard
                </h1>
                <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                  Dallas, TX
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Live oversight of inbound AI receptionist calls, lead qualification, and technician dispatch queues.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                Mock Data Preview
              </span>
            </div>
          </div>

          {/* Metric KPIs */}
          <MetricCards metrics={mockDashboardMetrics} />

          {/* Recent Leads Table */}
          <RecentLeadsTable leads={mockRecentLeads} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
