'use client';

import React from 'react';
import Link from 'next/link';
import { Bot, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 bg-[var(--surface)] text-[var(--muted)] py-12 border-t border-[var(--surface-border)] text-xs rounded-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 text-[var(--foreground)] font-bold text-base mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-sm">
                <Bot className="h-4 w-4" />
              </div>
              <span>AERIS Receptionist</span>
            </div>
            <p className="text-[var(--muted)] max-w-md leading-relaxed text-xs">
              A specialized receptionist intelligence system engineered for residential and commercial heating and air conditioning contractors. Answers inquiries, collects customer details, and routes service dispatches without human delays.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-cyan-500 dark:text-cyan-400 bg-blue-500/10 px-3 py-1.5 rounded-xl border border-blue-500/20 max-w-fit font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>AERIS Dispatch Platform</span>
            </div>
          </div>

          <div>
            <h4 className="text-[var(--foreground)] font-semibold text-xs uppercase tracking-wider mb-3">
              Quick Navigation
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/#interactive-demo" className="hover:text-[var(--foreground)] transition">
                  Interactive Receptionist Demo
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-[var(--foreground)] transition">
                  Contractor Capabilities
                </Link>
              </li>
              <li>
                <Link href="/leads" className="hover:text-[var(--foreground)] transition">
                  Leads Management
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-[var(--foreground)] transition">
                  Contractor Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[var(--foreground)] font-semibold text-xs uppercase tracking-wider mb-3">
              Demo Company
            </h4>
            <div className="space-y-1 text-[11px]">
              <p className="text-[var(--foreground)] font-medium">Summit HVAC</p>
              <p>Dallas, Texas (DFW Metroplex)</p>
              <p>Mon–Fri: 8:00 AM – 6:00 PM</p>
              <p>Emergency: 24/7 On-Call</p>
              <p className="text-[var(--muted)] pt-2 italic">Fictional demonstration data only.</p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-[var(--surface-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[var(--muted)]">
          <p>© {new Date().getFullYear()} AERIS Receptionist. All rights reserved.</p>
          <p>Autonomous intake &amp; dispatch routing for US HVAC contractors.</p>
        </div>
      </div>
    </footer>
  );
};
