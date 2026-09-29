import { AgentAction, ToolName, UrgencyLevel } from '@/types';
import { mockStore } from '@/lib/mock/store';

export interface ExecuteToolContext {
  conversationId: string;
}

export interface ExecuteToolResult {
  action: AgentAction;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
  check_business_hours: 'Check Business Hours',
  check_service_area: 'Check Service Area',
  create_lead: 'Create CRM Lead',
  get_available_slots: 'Fetch Available Slots',
  request_appointment: 'Request Appointment',
  transfer_to_human: 'Transfer to Human Dispatcher',
};

export function executeAgentTool(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  context: ExecuteToolContext
): ExecuteToolResult {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const actionId = `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const validToolName = toolName as ToolName;
  const displayName = TOOL_DISPLAY_NAMES[validToolName] || toolName;

  const validTools: ToolName[] = [
    'check_business_hours',
    'check_service_area',
    'create_lead',
    'get_available_slots',
    'request_appointment',
    'transfer_to_human',
  ];

  if (!validTools.includes(validToolName)) {
    const errorMsg = `Rejected unknown tool "${toolName}". The server only allows registered actions.`;
    return {
      success: false,
      error: errorMsg,
      action: {
        id: actionId,
        toolName: validToolName,
        displayName,
        status: 'failed',
        input: rawArgs,
        error: errorMsg,
        timestamp,
      },
    };
  }

  try {
    let output: Record<string, unknown>;

    switch (validToolName) {
      case 'check_business_hours': {
        const day = typeof rawArgs.day === 'string' ? rawArgs.day : undefined;
        output = mockStore.checkBusinessHours(day);
        break;
      }

      case 'check_service_area': {
        const city = typeof rawArgs.city === 'string' ? rawArgs.city : undefined;
        const zip = typeof rawArgs.zip === 'string' ? rawArgs.zip : undefined;
        output = mockStore.checkServiceArea(context.conversationId, city, zip);
        break;
      }

      case 'create_lead': {
        const customerName = String(rawArgs.customerName || '');
        const phone = String(rawArgs.phone || '');
        const serviceAddress = String(rawArgs.serviceAddress || rawArgs.address || '');
        const serviceType = String(rawArgs.serviceType || '');
        const reportedIssue = String(rawArgs.reportedIssue || '');
        const urgency = (rawArgs.urgency as UrgencyLevel) || 'normal';

        output = mockStore.createLead(context.conversationId, {
          customerName,
          phone,
          serviceAddress,
          serviceType,
          reportedIssue,
          urgency,
        });
        break;
      }

      case 'get_available_slots': {
        const serviceType = typeof rawArgs.serviceType === 'string' ? rawArgs.serviceType : undefined;
        const urgency = rawArgs.urgency as UrgencyLevel | undefined;
        const preferredDate = typeof rawArgs.preferredDate === 'string' ? rawArgs.preferredDate : undefined;

        output = mockStore.getAvailableSlots(context.conversationId, {
          serviceType,
          urgency,
          preferredDate,
        });
        break;
      }

      case 'request_appointment': {
        const leadId = String(rawArgs.leadId || '');
        const preferredSlot = String(rawArgs.preferredSlot || '');
        const customerName = String(rawArgs.customerName || '');
        const phone = String(rawArgs.phone || '');
        const serviceAddress = String(rawArgs.serviceAddress || rawArgs.address || '');

        output = mockStore.requestAppointment(context.conversationId, {
          leadId,
          preferredSlot,
          customerName,
          phone,
          serviceAddress,
        });
        break;
      }

      case 'transfer_to_human': {
        const reason = String(rawArgs.reason || '');
        const urgency = (rawArgs.urgency as UrgencyLevel) || 'normal';
        const summary = String(rawArgs.summary || reason);

        output = mockStore.transferToHuman(context.conversationId, {
          reason,
          urgency,
          summary,
        });
        break;
      }

      default:
        throw new Error(`Unhandled tool: ${validToolName}`);
    }

    return {
      success: true,
      output,
      action: {
        id: actionId,
        toolName: validToolName,
        displayName,
        status: 'success',
        input: rawArgs,
        output,
        timestamp,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Tool execution failed.';
    return {
      success: false,
      error: errorMsg,
      action: {
        id: actionId,
        toolName: validToolName,
        displayName,
        status: 'failed',
        input: rawArgs,
        error: errorMsg,
        timestamp,
      },
    };
  }
}
