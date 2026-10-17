'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DashboardLead } from '@/types';
import { formatLeadStatus, formatUrgency } from '@/lib/utils';
import { Search, Filter, MapPin, Eye, X } from 'lucide-react';

interface RecentLeadsTableProps {
  leads: DashboardLead[];
  isRealContractor?: boolean;
}

export const RecentLeadsTable: React.FC<RecentLeadsTableProps> = ({
  leads,
  isRealContractor = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<DashboardLead | null>(null);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.notes.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesUrgency = filterUrgency === 'all' || lead.urgency === filterUrgency;

    return matchesSearch && matchesUrgency;
  });

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--surface-border)] shadow-sm overflow-hidden">
      {/* Table Header & Search Controls */}
      <div className="p-5 border-b border-[var(--surface-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">Recent Customer Leads</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Inbound calls captured and qualified by AERIS Receptionist
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="h-4 w-4 text-[var(--muted)] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search leads, cities, issues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3.5 py-1.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 w-56 transition"
            />
          </div>

          {/* Urgency Filter */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-raised)] border border-[var(--surface-border)] p-1 rounded-xl text-xs">
            <Filter className="h-3.5 w-3.5 text-[var(--muted)] ml-1.5" />
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="bg-transparent border-0 text-[var(--foreground)] text-xs font-medium focus:ring-0 pr-6"
            >
              <option value="all">All Urgencies</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--surface-raised)] text-[var(--muted)] font-semibold border-b border-[var(--surface-border)] uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Service Requested</th>
              <th className="py-3 px-4">City / Area</th>
              <th className="py-3 px-4">Urgency</th>
              <th className="py-3 px-4">Lead Status</th>
              <th className="py-3 px-4">Received</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--surface-border)]/50">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--muted)]">
                  No leads found matching your search.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const urgencyStyle = formatUrgency(lead.urgency);
                const statusStyle = formatLeadStatus(lead.status);

                return (
                  <tr key={lead.id} className="hover:bg-[var(--surface-raised)]/60 transition">
                    <td className="py-3 px-4 font-semibold text-[var(--foreground)]">
                      <div>
                        <span>
                          {lead.customerName || (
                            <span className="italic font-normal text-[var(--muted)]">
                              Name not provided
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] font-normal text-[var(--muted)] font-mono">
                          {lead.phone || 'Phone not provided'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--foreground)]">
                      <span className="font-medium">{lead.service}</span>
                    </td>
                    <td className="py-3 px-4 text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-[var(--muted)]" />
                        <span>{lead.city || 'Not provided'}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${urgencyStyle.bg} ${urgencyStyle.text} ${urgencyStyle.border}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${urgencyStyle.dot}`} />
                        {urgencyStyle.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--muted)] text-[11px] font-mono">
                      {lead.timeReceived}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isRealContractor ? (
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-cyan-400 hover:underline font-semibold text-xs px-2.5 py-1 rounded-lg hover:bg-blue-500/10 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Detail</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedLead(lead)}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-cyan-400 hover:underline font-medium text-xs px-2.5 py-1 rounded-lg hover:bg-blue-500/10 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Details</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="p-4 bg-[var(--surface-raised)] border-t border-[var(--surface-border)] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          Showing {filteredLeads.length} of {leads.length} recorded leads
        </span>
        {isRealContractor ? (
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
            Live Database Connected • Supabase Tenant Scoped
          </span>
        ) : (
          <span className="font-mono text-[11px]">Local Mock Storage • No Database Connected</span>
        )}
      </div>

      {/* Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-[var(--surface-border)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--surface-border)]">
              <h4 className="text-base font-bold text-[var(--foreground)]">Lead Intake Details</h4>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-raised)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--surface-border)]">
                  <span className="text-[var(--muted)] block text-[11px]">Customer</span>
                  <span className="font-semibold text-[var(--foreground)] text-sm">
                    {selectedLead.customerName}
                  </span>
                </div>
                <div className="bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--surface-border)]">
                  <span className="text-[var(--muted)] block text-[11px]">Phone</span>
                  <span className="font-semibold text-[var(--foreground)] font-mono">
                    {selectedLead.phone}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--surface-border)]">
                <span className="text-[var(--muted)] block text-[11px]">Location</span>
                <span className="font-medium text-[var(--foreground)]">{selectedLead.city}</span>
              </div>

              <div className="bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--surface-border)]">
                <span className="text-[var(--muted)] block text-[11px]">Service Inquired</span>
                <span className="font-medium text-[var(--foreground)]">{selectedLead.service}</span>
              </div>

              <div className="p-3.5 bg-[var(--surface-raised)] rounded-xl border border-[var(--surface-border)]">
                <span className="text-[var(--muted)] block text-[11px] font-semibold mb-1">
                  AI Call Notes &amp; Reported Issues:
                </span>
                <p className="text-[var(--foreground)] leading-relaxed">{selectedLead.notes}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--surface-border)] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-[var(--surface-raised)] hover:bg-[var(--surface-border)] border border-[var(--surface-border)] text-[var(--foreground)] rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
