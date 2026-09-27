'use client';

import React from 'react';
import Link from 'next/link';
import { Bot, Shield } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 text-white font-bold text-base mb-3">
              <Bot className="h-5 w-5 text-blue-400" />
              <span>HVAC AI Receptionist</span>
            </div>
            <p className="text-slate-400 max-w-md leading-relaxed text-xs">
              A specialized AI receptionist system engineered for residential and commercial heating and air conditioning contractors. Handles inquiries, troubleshoots symptoms, qualifies leads, and coordinates dispatch windows.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-amber-400 bg-slate-800/80 px-3 py-1.5 rounded border border-amber-500/20 max-w-fit">
              <Shield className="h-3.5 w-3.5" />
              <span>Prototype Development Stage (Phase 1 & Phase 2 UI Architecture)</span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">
              Prototype Navigation
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="#interactive-demo" className="hover:text-white transition">
                  Interactive Receptionist Demo
                </Link>
              </li>
              <li>
                <Link href="#features" className="hover:text-white transition">
                  Contractor Capabilities
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-white transition">
                  Call Workflow
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition">
                  Contractor Dashboard Preview
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">
              Demo Company
            </h4>
            <div className="space-y-1 text-[11px]">
              <p className="text-white font-medium">Summit HVAC</p>
              <p>Dallas, Texas (DFW Metroplex)</p>
              <p>Mon–Fri: 8:00 AM – 6:00 PM</p>
              <p>Emergency: 24/7 On-Call</p>
              <p className="text-slate-500 pt-2 italic">Fictional demonstration data only.</p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} HVAC AI Receptionist Prototype. All rights reserved.</p>
          <p>No paid services, phone lines, or live customer tracking connected in Phase 1/2.</p>
        </div>
      </div>
    </footer>
  );
};
