import { NextRequest, NextResponse } from 'next/server';
import { requireContractorAuth } from '@/lib/auth/tenant';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';
import { buildSafeErrorResponse } from '@/lib/errors/safeResponse';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/calls/[id]
 * Retrieves a single contractor call record, its persisted transcripts, and its lifecycle events.
 * Strictly isolated to the authenticated contractor's businessId.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const authResult = await requireContractorAuth();
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          ok: false,
          error: authResult.error || 'Authentication required.',
          code: authResult.code || 'UNAUTHORIZED',
        },
        { status: authResult.status || 401 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const callId = (resolvedParams?.id || '').trim();
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing call identifier.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    const detail = await ContractorPersistenceService.getContractorCallDetail(
      authResult.businessId,
      callId
    );
    if (!detail) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Call record not found or access denied.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      businessId: authResult.businessId,
      ...detail,
    });
  } catch (err: unknown) {
    return buildSafeErrorResponse({
      status: 500,
      code: 'CALL_DETAIL_FETCH_FAILED',
      userMessage: 'Unable to load call record details at this time.',
      internalError: err,
    });
  }
}

/**
 * PATCH /api/contractor/calls/[id]
 * Allows authorized contractor members (owner/dispatcher) to correct caller info or redact PII
 * from a call record and its transcripts.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const authResult = await requireContractorAuth(['owner', 'admin', 'dispatcher']);
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          ok: false,
          error: authResult.error || 'Authentication required.',
          code: authResult.code || 'UNAUTHORIZED',
        },
        { status: authResult.status || 401 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const callId = (resolvedParams?.id || '').trim();
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing call identifier.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    let rawBody: Record<string, unknown> = {};
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON request body.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const sanitizedBody = stripUntrustedTenantIds({ ...rawBody });
    const actionRaw =
      typeof sanitizedBody.action === 'string'
        ? sanitizedBody.action.trim().toLowerCase()
        : sanitizedBody.redactPii === true
        ? 'redact_pii'
        : 'correct';

    if (actionRaw !== 'correct' && actionRaw !== 'redact_pii') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid action. Supported PATCH actions are "correct" or "redact_pii".',
          code: 'INVALID_ACTION',
        },
        { status: 400 }
      );
    }

    const result = await ContractorPersistenceService.correctOrDeleteCallRecord(
      authResult.businessId,
      callId,
      {
        action: actionRaw,
        callerPhone:
          sanitizedBody.callerPhone !== undefined
            ? sanitizedBody.callerPhone === null
              ? null
              : String(sanitizedBody.callerPhone)
            : undefined,
        errorMessage:
          sanitizedBody.errorMessage !== undefined
            ? sanitizedBody.errorMessage === null
              ? null
              : String(sanitizedBody.errorMessage)
            : undefined,
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      callId: result.callId,
      call: result.call,
    });
  } catch (err: unknown) {
    return buildSafeErrorResponse({
      status: 500,
      code: 'CALL_UPDATE_FAILED',
      userMessage: 'Unable to update call record at this time.',
      internalError: err,
    });
  }
}

/**
 * DELETE /api/contractor/calls/[id]
 * Allows authorized contractor owners/admins to delete a call record and its transcripts.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const authResult = await requireContractorAuth(['owner', 'admin']);
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          ok: false,
          error: authResult.error || 'Authentication required.',
          code: authResult.code || 'UNAUTHORIZED',
        },
        { status: authResult.status || 401 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const callId = (resolvedParams?.id || '').trim();
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing call identifier.', code: 'INVALID_PARAM' },
        { status: 400 }
      );
    }

    const result = await ContractorPersistenceService.correctOrDeleteCallRecord(
      authResult.businessId,
      callId,
      { action: 'delete' }
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedCallId: result.callId,
    });
  } catch (err: unknown) {
    return buildSafeErrorResponse({
      status: 500,
      code: 'CALL_DELETE_FAILED',
      userMessage: 'Unable to delete call record at this time.',
      internalError: err,
    });
  }
}
