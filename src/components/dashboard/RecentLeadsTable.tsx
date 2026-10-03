'use client';

import React, { useState } from 'react';
import { DashboardLead, UrgencyLevel, LeadStatus } from '@/types';
import { formatLeadStatus, formatUrgency } from '@/lib/utils';
import { Search, Filter, Phone, MapPin, Wrench, Clock, Eye } from 'lucide-react';

interface RecentLeadsTableProps {
  leads: DashboardLead[];
}

export const RecentLeadsTable: React.FC<RecentLeadsTableProps> = ({ leads }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<DashboardLead | null>(null);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.notes.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesUrgency =
      filterUrgency === 'all' || lead.urgency === filterUrgency;

    return matchesSearch && matchesUrgency;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Table Header & Search Controls */}
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Recent Customer Leads</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Inbound calls captured and qualified by AERIS AI Receptionist
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search leads, cities, issues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>

          {/* Urgency Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-500 ml-1.5" />
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="bg-transparent border-0 text-slate-700 text-xs font-medium focus:ring-0 pr-6"
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
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
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
          <tbody className="divide-y divide-slate-100">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No leads found matching your search.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const urgencyStyle = formatUrgency(lead.urgency);
                const statusStyle = formatLeadStatus(lead.status);

                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/80 transition"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>
                        <span>{lead.customerName}</span>
                        <span className="block text-[11px] font-normal text-slate-500">
                          {lead.phone}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <span className="font-medium">{lead.service}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        <span>{lead.city}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${urgencyStyle.bg} ${urgencyStyle.text} ${urgencyStyle.border}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${urgencyStyle.dot}`} />
                        {urgencyStyle.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {lead.timeReceived}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 rounded hover:bg-blue-50 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span>Showing {filteredLeads.length} of {leads.length} recorded leads</span>
        <span className="font-mono text-[11px]">Local Mock Storage • No Database Connected</span>
      </div>

      {/* Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-base font-bold text-slate-900">
                Lead Intake Details
              </h4>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500 block text-[11px]">Customer</span>
                  <span className="font-semibold text-slate-900 text-sm">
                    {selectedLead.customerName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Phone</span>
                  <span className="font-semibold text-slate-900">
                    {selectedLead.phone}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Location</span>
                <span className="font-medium text-slate-900">{selectedLead.city}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Service Inquired</span>
                <span className="font-medium text-slate-900">{selectedLead.service}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-semibold mb-1">
                  AI Call Notes &amp; Reported Issues:
                </span>
                <p className="text-slate-800 leading-relaxed">
                  {selectedLead.notes}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition"
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
