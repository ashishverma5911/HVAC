import { createAdminClient } from '@/lib/supabase/admin';
import { LeadRow, ContractorIndustry } from '@/lib/supabase/types';
import { normalizeIndustry } from '@/lib/ai/industryTemplates';
import {
  ContractorCallHistoryItem,
  ContractorPersistenceService,
} from '@/lib/services/contractorPersistence';

export interface ContractorDashboardSummary {
  business: {
    id: string;
    name: string;
    industry: ContractorIndustry;
    slug: string;
    phone: string;
    city: string;
    state: string;
  };
  metrics: {
    totalCalls: number;
    totalLeads: number;
    appointmentsRequested: number;
    urgentRequests: number;
  };
  recentLeads: Array<
    Pick<
      LeadRow,
      | 'id'
      | 'customer_name'
      | 'phone'
      | 'service_address'
      | 'city_area'
      | 'service_type'
      | 'reported_issue'
      | 'urgency'
      | 'status'
      | 'created_at'
    >
  >;
  recentCalls: ContractorCallHistoryItem[];
}

/**
 * Dedicated Dashboard & Reporting service for authenticated contractor tenants.
 * Enforces strict tenant scoping by verified business_id and never fabricates metrics or call records.
 */
export class ContractorReportingService {
  static async getDashboardSummary(businessId: string): Promise<ContractorDashboardSummary> {
    if (!businessId) {
      throw new Error('ContractorReportingService: verified businessId is required.');
    }

    const recentCalls = await ContractorPersistenceService.getContractorCallHistory(businessId, {
      limit: 25,
    });
    const ledgerLeads = ContractorPersistenceService.getContractorLeads(businessId);
    const ledgerAppts = ContractorPersistenceService.getContractorAppointments(businessId);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        business: {
          id: businessId,
          name: 'Contractor Organization',
          industry: 'hvac',
          slug: '',
          phone: '',
          city: '',
          state: '',
        },
        metrics: {
          totalCalls: recentCalls.length,
          totalLeads: ledgerLeads.length,
          appointmentsRequested: ledgerAppts.length,
          urgentRequests: ledgerLeads.filter(
            (l) => l.urgency === 'urgent' || l.urgency === 'emergency'
          ).length,
        },
        recentLeads: ledgerLeads.slice(0, 10).map((l) => ({
          id: l.leadId,
          customer_name: l.customerName,
          phone: l.phone,
          service_address: l.serviceAddress,
          city_area: l.cityArea || null,
          service_type: l.serviceType,
          reported_issue: l.reportedIssue,
          urgency: l.urgency,
          status: l.status,
          created_at: l.createdAt,
        })),
        recentCalls,
      };
    }

    const admin = createAdminClient();

    // 1. Query contractor business details
    const { data: business } = await admin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    // 2. Aggregated Queries Scoped Strictly to Verified businessId
    const [callsRes, leadsRes, apptsRes, urgentRes, recentLeadsRes] = await Promise.all([
      admin
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      admin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      admin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),

      admin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .in('urgency', ['urgent', 'emergency']),

      admin
        .from('leads')
        .select(
          'id, customer_name, phone, service_address, city_area, service_type, reported_issue, urgency, status, created_at'
        )
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return {
      business: {
        id: businessId,
        name: business?.name || 'Contractor Organization',
        industry: normalizeIndustry((business as { industry?: string } | null)?.industry),
        slug: business?.slug || '',
        phone: business?.phone || '',
        city: business?.city || '',
        state: business?.state || '',
      },
      metrics: {
        totalCalls: Math.max(callsRes.count || 0, recentCalls.length),
        totalLeads: Math.max(leadsRes.count || 0, ledgerLeads.length),
        appointmentsRequested: Math.max(apptsRes.count || 0, ledgerAppts.length),
        urgentRequests: Math.max(
          urgentRes.count || 0,
          ledgerLeads.filter((l) => l.urgency === 'urgent' || l.urgency === 'emergency').length
        ),
      },
      recentLeads:
        recentLeadsRes.data && recentLeadsRes.data.length > 0
          ? recentLeadsRes.data
          : ledgerLeads.slice(0, 10).map((l) => ({
              id: l.leadId,
              customer_name: l.customerName,
              phone: l.phone,
              service_address: l.serviceAddress,
              city_area: l.cityArea || null,
              service_type: l.serviceType,
              reported_issue: l.reportedIssue,
              urgency: l.urgency,
              status: l.status,
              created_at: l.createdAt,
            })),
      recentCalls,
    };
  }
}

