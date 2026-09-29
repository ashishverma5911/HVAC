import { NextResponse } from 'next/server';
import { executeAgentTool } from '@/lib/ai/toolExecutor';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
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

    console.log(`[Voice Tools API] Executing ${toolName} for conversation: ${conversationId}`, toolArgs);

    const result = executeAgentTool(toolName, toolArgs, { conversationId });

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
