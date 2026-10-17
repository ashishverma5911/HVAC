'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Radio,
  Sparkles,
  Users,
  Calendar,
  PhoneCall,
  BookOpen,
  Settings,
  Bot,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogIn,
  LogOut,
  User,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { useTheme } from '@/lib/context/ThemeContext';
import { createClient } from '@/lib/supabase/client';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  badge?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: 'emerald' | 'blue' | 'purple' | 'amber';
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  pageTitle,
  badge,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Desktop sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  // Mobile drawer open state
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  // Authentication state
  const [authState, setAuthState] = useState<{
    authenticated: boolean;
    hasBusiness: boolean;
    businessName?: string | null;
    user?: { email?: string };
  } | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setAuthState(data);
      } catch {
        // Fall back gracefully
      }
    }
    checkAuth();
  }, [pathname]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setAuthState({ authenticated: false, hasBusiness: false });
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const navSections: NavSection[] = [
    {
      title: 'OPERATIONS',
      items: [
        {
          name: 'Dashboard',
          href: '/dashboard',
          icon: LayoutDashboard,
        },
        {
          name: 'Demo Preview',
          href: '/',
          icon: Radio,
          badge: 'LIVE',
          badgeColor: 'emerald',
        },
        {
          name: 'Features',
          href: '/features',
          icon: Sparkles,
        },
      ],
    },
    {
      title: 'DISPATCH & LEADS',
      items: [
        {
          name: 'Leads',
          href: '/leads',
          icon: Users,
        },
        {
          name: 'Appointments',
          href: '/appointments',
          icon: Calendar,
        },
        {
          name: 'Call History',
          href: '/calls',
          icon: PhoneCall,
        },
      ],
    },
    {
      title: 'CONTRACTOR SYSTEM',
      items: [
        {
          name: 'Knowledge Base',
          href: '/knowledge-base',
          icon: BookOpen,
        },
        {
          name: 'Settings',
          href: '/settings',
          icon: Settings,
        },
      ],
    },
  ];

  const getEffectivePageTitle = () => {
    if (pageTitle) return pageTitle;
    if (pathname === '/') return 'Demo Preview';
    if (pathname === '/dashboard') return 'Contractor Dashboard';
    if (pathname.startsWith('/leads')) return 'Leads Management';
    if (pathname === '/appointments') return 'Appointment Requests';
    if (pathname === '/calls') return 'Call History & Transcripts';
    if (pathname === '/features') return 'Features & Capabilities';
    if (pathname === '/knowledge-base') return 'Knowledge Base';
    if (pathname === '/settings') return 'Contractor Settings';
    if (pathname === '/login') return 'Contractor Access';
    if (pathname === '/onboarding') return 'Contractor Onboarding';
    return 'AERIS Receptionist';
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--background)] text-[var(--foreground)]">
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* =========================================================================
          LEFT SIDEBAR (Persistent Desktop, Drawer Mobile)
          ========================================================================= */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r transition-all duration-200 ease-in-out
          bg-[#0B1220] text-slate-100 border-[#1E293B] shadow-2xl md:shadow-none
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Sidebar Header: Logo & Branding */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#1E293B]">
          <Link
            href="/"
            className="flex items-center gap-3 overflow-hidden group focus-visible:outline-none"
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform duration-200">
              <Bot className="h-5 w-5" />
              <span className="absolute -inset-0.5 rounded-xl bg-cyan-400 opacity-20 blur-xs group-hover:opacity-40 transition-opacity" />
            </div>

            {(!isCollapsed || isMobileOpen) && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold tracking-tight text-base text-white">
                    AERIS
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
                    Receptionist
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 truncate">
                  HVAC Dispatch Intelligence
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              {(!isCollapsed || isMobileOpen) && (
                <p className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {section.title}
                </p>
              )}

              {section.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={isCollapsed && !isMobileOpen ? item.name : undefined}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150
                      ${
                        isActive
                          ? 'bg-blue-600/20 text-cyan-300 font-semibold border border-blue-500/40 shadow-sm shadow-blue-500/20'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }
                      ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}
                    `}
                  >
                    <div
                      className={`flex items-center justify-center shrink-0 transition-transform duration-150 ${
                        isActive
                          ? 'text-cyan-400 scale-105'
                          : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate flex-1">{item.name}</span>
                    )}

                    {(!isCollapsed || isMobileOpen) && item.badge && (
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border
                          ${
                            item.badgeColor === 'emerald'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          }
                        `}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Subtle active indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-blue-500 to-cyan-400 rounded-r-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer: Theme Toggle & Account Info */}
        <div className="p-3 border-t border-[#1E293B] space-y-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all
              ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}
            `}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <div className="text-amber-400 dark:text-cyan-400">
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-400" />
              )}
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <span className="flex-1 text-left">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
          </button>

          {/* Account Profile Card */}
          {(!isCollapsed || isMobileOpen) ? (
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              {authState?.authenticated ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-blue-600/30 border border-blue-500/40 text-cyan-300 flex items-center justify-center shrink-0 font-bold text-xs">
                      {authState.businessName ? authState.businessName[0].toUpperCase() : 'C'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 truncate text-[11px]">
                        {authState.businessName || 'Contractor Portal'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {authState.user?.email || 'Verified Contractor'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                    <ShieldCheck className="h-3 w-3 text-cyan-400" />
                    <span>Pilot Demo Mode</span>
                  </div>
                  <Link
                    href="/login"
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold text-[11px] shadow-sm hover:from-blue-500 hover:to-cyan-500 transition"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Contractor Sign In</span>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            /* Collapsed icon for account */
            <div className="flex justify-center">
              {authState?.authenticated ? (
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <Link
                  href="/login"
                  title="Contractor Sign In"
                  className="p-2 rounded-xl text-cyan-400 hover:bg-slate-800 transition"
                >
                  <LogIn className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex w-full items-center justify-center py-1.5 text-slate-400 hover:text-white transition"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN APPLICATION AREA (Top Nav + Scrollable Page Content)
          ========================================================================= */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out
          ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}
        `}
      >
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 h-16 border-b flex items-center justify-between px-4 sm:px-6 lg:px-8
          bg-[var(--surface)]/90 backdrop-blur-md border-[var(--surface-border)]
        ">
          {/* Left: Mobile hamburger & Page Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--foreground)]">
                {getEffectivePageTitle()}
              </h1>
              {badge && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20">
                  {badge}
                </span>
              )}
            </div>
          </div>

          {/* Right: Status badge & Action buttons */}
          <div className="flex items-center gap-3">
            {/* Live Status indicator */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold
              bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20
            ">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{authState?.hasBusiness ? 'PILOT ACTIVE' : 'AERIS AI LIVE'}</span>
            </div>

            {/* Quick theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-500" />
              )}
            </button>

            {/* Authentication Action */}
            {authState?.authenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/settings"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--surface-border)] hover:bg-[var(--surface-raised)] transition text-[var(--foreground)]"
                >
                  <Building2 className="h-3.5 w-3.5 text-blue-500" />
                  <span>{authState.businessName || 'Business Settings'}</span>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Sign Out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)] transition"
                >
                  <LogIn className="h-3.5 w-3.5 text-blue-500" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm hover:from-blue-500 hover:to-cyan-500 transition"
                >
                  <span>Sign Up</span>
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
