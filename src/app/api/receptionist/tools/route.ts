import { NextResponse } from 'next/server';
import { executeAgentToolAsync } from '@/lib/ai/toolExecutor';
import { resolveTenantContext } from '@/lib/auth/tenant';
import { demoLimiter } from '@/lib/security/demoLimiter';
import { logDiagnosticEvent } from '@/lib/diagnostics/logger';
import { createSafeErrorResponse } from '@/lib/errors/safeResponse';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const startTime = Date.now();
  let conversationId = '';
  let toolName = '';

  try {
    // 1. Resolve server-side tenant context
    // SAFEGUARD 1: Authenticated user with missing business returns 403 (does NOT fall back to demo)
    const tenant = await resolveTenantContext();
    if (!tenant.success) {
      return createSafeErrorResponse({
        code: tenant.category === 'MISSING_BUSINESS_PROFILE' ? 'MISSING_BUSINESS_PROFILE' : 'FORBIDDEN',
        userMessage: tenant.error,
        status: tenant.status,
      });
    }

    const body = await req.json();
    conversationId = body?.conversationId;
    toolName = body?.toolName;
    const args = body?.args;

    if (!conversationId || typeof conversationId !== 'string') {
      return createSafeErrorResponse({
        code: 'INVALID_INPUT',
        userMessage: 'Missing or invalid conversationId.',
        status: 400,
      });
    }

    if (!toolName || typeof toolName !== 'string') {
      return createSafeErrorResponse({
        code: 'INVALID_INPUT',
        userMessage: 'Missing or invalid toolName.',
        status: 400,
      });
    }

    // 2. Demo abuse limiter: cap turns and tool executions per anonymous demo conversation
    if (tenant.isDemo) {
      const turnCheck = demoLimiter.recordTurn(conversationId);
      if (!turnCheck.allowed) {
        logDiagnosticEvent({
          event: 'DEMO_RATE_LIMIT_TRIGGERED',
          conversationId,
          isDemo: true,
          details: { toolName, turns: turnCheck.turns },
          error: turnCheck.reason,
        });

        return createSafeErrorResponse({
          code: 'DEMO_LIMIT_EXCEEDED',
          userMessage: turnCheck.reason,
          status: 429,
        });
      }
    }

    const toolArgs = args && typeof args === 'object' ? args : {};

    // 3. SAFEGUARD 2 & 3:
    // - Pass server-resolved businessConfig and isDemo flag
    // - Client or LLM-supplied business_id cannot override the verified context
    const result = await executeAgentToolAsync(toolName, toolArgs, {
      conversationId,
      businessConfig: tenant.config,
      businessId: tenant.businessId,
      isDemo: tenant.isDemo,
    });

    const durationMs = Date.now() - startTime;

    // Log diagnostic event with automatic PII masking (names, phones, addresses sanitized)
    logDiagnosticEvent({
      event: 'TOOL_EXECUTED',
      businessId: tenant.businessId,
      conversationId,
      isDemo: tenant.isDemo,
      durationMs,
      details: {
        toolName,
        success: !result.error,
        args: toolArgs, // automatically scrubbed by logger/piiMask
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logDiagnosticEvent({
      event: 'REQUEST_FAILED',
      conversationId,
      durationMs,
      details: { toolName },
      error: error instanceof Error ? error.message : 'Unknown tool execution error',
    });

    return createSafeErrorResponse({
      code: 'INTERNAL_SERVER_ERROR',
      userMessage: 'Failed to execute receptionist tool.',
      status: 500,
      internalError: error,
    });
  }
}
