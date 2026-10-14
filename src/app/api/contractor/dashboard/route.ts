import { NextResponse } from 'next/server';
import { requireContractorAuth } from '@/lib/auth/tenant';
import { ContractorReportingService } from '@/lib/services/contractorReporting';
import {
  evaluateCallRecordingPolicy,
  US_CALL_RECORDING_CONSENT_REQUIREMENTS,
} from '@/lib/compliance/callPrivacyAndCompliance';
import { safeErrorResponse } from '@/lib/errors/safeResponse';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase environment is not configured.', code: 'UNCONFIGURED' },
      { status: 503 }
    );
  }

  try {
    // 1. Authenticate caller and resolve verified business_id strictly from session
    const auth = await requireContractorAuth();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    // 2. Load tenant-scoped dashboard summary via dedicated reporting service
    const summary = await ContractorReportingService.getDashboardSummary(auth.businessId);

    return NextResponse.json({
      success: true,
      business: summary.business,
      metrics: summary.metrics,
      recentLeads: summary.recentLeads,
      recentCalls: summary.recentCalls,
      recordingPolicy: evaluateCallRecordingPolicy(),
      consentRequirements: US_CALL_RECORDING_CONSENT_REQUIREMENTS,
    });
  } catch (err: unknown) {
    return safeErrorResponse({
      userMessage: 'Failed to retrieve contractor dashboard data.',
      code: 'SERVER_ERROR',
      status: 500,
      internalError: err,
    });
  }
}

