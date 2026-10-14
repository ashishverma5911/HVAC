import { NextResponse } from 'next/server';
import { resolveTenantContext } from '@/lib/auth/tenant';
import { getIndustryTemplate } from '@/lib/ai/industryTemplates';

/**
 * GET /api/receptionist/context
 *
 * Returns the server-verified contractor configuration for the active browser session.
 * - Authenticated contractor: returns their verified ContractorBusinessConfig from Supabase.
 * - Unauthenticated visitor: returns the isolated Summit HVAC demo sandbox configuration.
 * - Authenticated user with missing business profile: returns 403 (never falls back to demo).
 */
export async function GET() {
  const tenant = await resolveTenantContext();

  if (!tenant.success) {
    return NextResponse.json(
      { error: tenant.error, category: tenant.category },
      { status: tenant.status }
    );
  }

  const config = tenant.config;
  const template = getIndustryTemplate(config.industry);

  const openingGreeting =
    config.customGreeting && config.customGreeting.trim().length > 0
      ? config.customGreeting.trim()
      : `Hi, you've reached ${config.name}! I'm AERIS, our virtual receptionist. How can I help you with your ${template.displayName.toLowerCase()} needs today?`;

  return NextResponse.json(
    {
      isDemo: tenant.isDemo,
      businessName: config.name,
      openingGreeting,
      config,
    },
    { status: 200 }
  );
}
