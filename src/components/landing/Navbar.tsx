'use client';

import React from 'react';
import Link from 'next/link';
import { Bot, PhoneCall, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentRoute?: 'home' | 'dashboard';
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute = 'home' }) => {
  const scrollToDemo = (e: React.MouseEvent) => {
    if (currentRoute === 'dashboard') return;
    const demoElement = document.getElementById('interactive-demo');
    if (demoElement) {
      e.preventDefault();
      demoElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    if (currentRoute === 'dashboard') return;
    const elem = document.getElementById(id);
    if (elem) {
      e.preventDefault();
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      {/* Prototype Mode Alert Bar */}
      <div className="bg-slate-900 text-slate-100 text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              PROTOTYPE MODE
            </span>
            <span className="hidden sm:inline text-slate-300">
              AERIS AI Receptionist — Real-Time Voice &amp; Chat Intake for HVAC Contractors.
            </span>
            <span className="sm:hidden text-slate-300">
              AERIS AI Receptionist
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Summit HVAC Demo</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-sm transition-transform group-hover:scale-105">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  AERIS AI
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  Receptionist
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                For US Heating & Air Contractors
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link
              href="/#interactive-demo"
              onClick={scrollToDemo}
              className={`transition hover:text-blue-600 ${currentRoute === 'home' ? 'text-slate-900 font-semibold' : ''}`}
            >
              Demo
            </Link>
            <Link
              href="/#features"
              onClick={scrollToSection('features')}
              className="transition hover:text-blue-600"
            >
              Features
            </Link>
            <Link
              href="/#how-it-works"
              onClick={scrollToSection('how-it-works')}
              className="transition hover:text-blue-600"
            >
              How It Works
            </Link>
            <Link
              href="/dashboard"
              className={`transition flex items-center gap-1.5 hover:text-blue-600 ${currentRoute === 'dashboard' ? 'text-blue-600 font-bold' : ''}`}
            >
              <span>Dashboard Preview</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                Mock
              </span>
            </Link>
          </nav>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            <Link
              href="/#interactive-demo"
              onClick={scrollToDemo}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Try AI Receptionist</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
