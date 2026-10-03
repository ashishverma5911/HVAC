import { NextResponse } from 'next/server';
import { executeAgentTool } from '@/lib/ai/toolExecutor';
import { resolveTenantContext } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 1. Resolve server-side tenant context
    // SAFEGUARD 1: Authenticated user with missing business returns 403 (does NOT fall back to demo)
    const tenant = await resolveTenantContext();
    if (!tenant.success) {
      return NextResponse.json(
        { error: tenant.error, category: tenant.category },
        { status: tenant.status }
      );
    }

    const body = await req.json();
    const { conversationId, toolName, args } = body || {};

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid conversationId.' },
        { status: 400 }
      );
    }

    if (!toolName || typeof toolName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid toolName.' },
        { status: 400 }
      );
    }

    const toolArgs = (args && typeof args === 'object') ? args : {};

    console.log(
      `[Voice Tools API] Executing ${toolName} for conversation: ${conversationId} (tenant: ${tenant.config.name}, demo: ${tenant.isDemo})`,
      toolArgs
    );

    // SAFEGUARD 2 & 3:
    // - Pass server-resolved businessConfig and isDemo flag
    // - Client or LLM-supplied business_id cannot override the verified context
    const result = executeAgentTool(toolName, toolArgs, {
      conversationId,
      businessConfig: tenant.config,
      businessId: tenant.businessId,
      isDemo: tenant.isDemo,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Tool execution error';
    console.error('[Voice Tools API] Execution error:', message);
    return NextResponse.json(
      { error: 'Failed to execute agent tool.' },
      { status: 500 }
    );
  }
}
