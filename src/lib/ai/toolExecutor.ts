import { AgentAction, ToolName, UrgencyLevel } from '@/types';
import { mockStore } from '@/lib/mock/store';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from './contractorConfig';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';

export interface ExecuteToolContext {
  conversationId: string;
  businessConfig?: ContractorBusinessConfig;
  businessId?: string;
  isDemo?: boolean;
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

const VALID_TOOLS: ToolName[] = [
  'check_business_hours',
  'check_service_area',
  'create_lead',
  'get_available_slots',
  'request_appointment',
  'transfer_to_human',
];

/**
 * Validates and executes an agent tool call securely.
 *
 * CRITICAL SAFEGUARDS:
 * 1. Business Context Immutability: Client or LLM-supplied business_id inside rawArgs is stripped
 *    and NEVER used to override the server-verified business context.
 * 2. Demo Execution Boundary: When isDemo is true (or unauthenticated), tool execution strictly
 *    interacts with the in-memory mock store and performs ZERO database writes.
 * 3. Exact Tool Contract Preservation: All 6 Phase 4 tools preserve their parameter validation
 *    and deterministic return shapes.
 */
export async function executeAgentToolAsync(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  context: ExecuteToolContext
): Promise<ExecuteToolResult> {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const actionId = `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const validToolName = toolName as ToolName;
  const displayName = TOOL_DISPLAY_NAMES[validToolName] || toolName;

  if (!VALID_TOOLS.includes(validToolName)) {
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

  // SAFEGUARD: Strip any malicious or accidental client/LLM-supplied business_id
  const sanitizedArgs = { ...rawArgs };
  delete sanitizedArgs.business_id;
  delete sanitizedArgs.businessId;

  const config = context.businessConfig || DEFAULT_SUMMIT_HVAC_CONFIG;
  const isDemoMode = context.isDemo !== false || !context.businessId;

  try {
    let output: Record<string, unknown>;

    switch (validToolName) {
      case 'check_business_hours': {
        const day = typeof sanitizedArgs.day === 'string' ? sanitizedArgs.day : undefined;

        if (context.businessConfig) {
          const hours = context.businessConfig.businessHours;
          let specificDayHours = hours.weekdays;
          if (day && day.toLowerCase().includes('sat')) {
            specificDayHours = hours.saturday || 'Closed';
          } else if (day && day.toLowerCase().includes('sun')) {
            specificDayHours = hours.sunday || 'Closed';
          }

          output = {
            businessName: context.businessConfig.name,
            requestedDay: day || 'General',
            operatingHours: specificDayHours,
            weekdayHours: hours.weekdays,
            saturdayHours: hours.saturday || 'Closed',
            sundayHours: hours.sunday || 'Closed',
            emergencyService: context.businessConfig.emergencyServiceEnabled
              ? '24/7 on-call emergency service is enabled.'
              : 'Emergency service is not currently available outside standard operating hours.',
            emergencyAvailable: context.businessConfig.emergencyServiceEnabled,
            currentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        } else {
          output = mockStore.checkBusinessHours(day);
        }
        break;
      }

      case 'check_service_area': {
        const city = typeof sanitizedArgs.city === 'string' ? sanitizedArgs.city.trim() : undefined;
        const zip = typeof sanitizedArgs.zip === 'string' ? sanitizedArgs.zip.trim() : undefined;

        if (context.businessConfig) {
          const supportedCities = context.businessConfig.serviceAreas;
          const supportedZips = context.businessConfig.supportedZips || [];

          let matchedCity = false;
          let matchedZip = false;

          if (city) {
            matchedCity = supportedCities.some(
              (c) => c.toLowerCase() === city.toLowerCase() || city.toLowerCase().includes(c.toLowerCase())
            );
          }

          if (zip) {
            matchedZip = supportedZips.includes(zip);
          }

          const isSupported = matchedCity || matchedZip;

          output = {
            query: { city, zip },
            supported: isSupported,
            businessName: context.businessConfig.name,
            matchedLocation: matchedCity ? city : matchedZip ? zip : null,
            primaryServiceAreas: supportedCities,
            supportedZipCount: supportedZips.length,
            message: isSupported
              ? `Yes! ${city || zip} is within ${context.businessConfig.name}'s service territory.`
              : `Unfortunately, ${city || zip || 'that area'} is outside ${context.businessConfig.name}'s current service area. We serve ${supportedCities.join(', ')}.`,
          };
        } else {
          output = mockStore.checkServiceArea(context.conversationId, city, zip);
        }
        break;
      }

      case 'create_lead': {
        const customerName = String(sanitizedArgs.customerName || '');
        const phone = String(sanitizedArgs.phone || '');
        const serviceAddress = String(sanitizedArgs.serviceAddress || sanitizedArgs.address || '');
        const serviceType = String(sanitizedArgs.serviceType || '');
        const reportedIssue = String(sanitizedArgs.reportedIssue || '');
        const urgency = (sanitizedArgs.urgency as UrgencyLevel) || 'normal';

        if (isDemoMode) {
          // DEMO BOUNDARY: Strictly in-memory mock store, zero database writes
          output = mockStore.createLead(context.conversationId, {
            customerName,
            phone,
            serviceAddress,
            serviceType,
            reportedIssue,
            urgency,
          });
        } else {
          // Contractor Mode: Real database persistence with deterministic idempotency
          try {
            const persistenceResult = await ContractorPersistenceService.persistLead(
              context.businessId!,
              {
                conversationId: context.conversationId,
                customerName,
                phone,
                serviceAddress,
                serviceType,
                reportedIssue,
                urgency,
                status: 'qualified',
                source: 'web_chat',
              }
            );

            output = {
              success: true,
              leadId: persistenceResult.leadId,
              businessId: context.businessId,
              customerName,
              phone,
              serviceAddress,
              serviceType,
              reportedIssue,
              urgency,
              status: 'qualified',
              isDuplicate: persistenceResult.isDuplicate,
              message: `Service lead created successfully for ${customerName} (${config.name}).`,
            };
          } catch (dbErr: unknown) {
            console.error('[ToolExecutor] Failed to persist contractor lead:', dbErr);
            throw new Error('Database persistence failed while recording service lead.');
          }
        }
        break;
      }

      case 'get_available_slots': {
        const serviceType = typeof sanitizedArgs.serviceType === 'string' ? sanitizedArgs.serviceType : undefined;
        const urgency = sanitizedArgs.urgency as UrgencyLevel | undefined;
        const preferredDate = typeof sanitizedArgs.preferredDate === 'string' ? sanitizedArgs.preferredDate : undefined;

        output = mockStore.getAvailableSlots(context.conversationId, {
          serviceType,
          urgency,
          preferredDate,
        });
        break;
      }

      case 'request_appointment': {
        const leadId = String(sanitizedArgs.leadId || '');
        const preferredSlot = String(sanitizedArgs.preferredSlot || '');
        const customerName = String(sanitizedArgs.customerName || '');
        const phone = String(sanitizedArgs.phone || '');
        const serviceAddress = String(sanitizedArgs.serviceAddress || sanitizedArgs.address || '');

        if (isDemoMode) {
          // DEMO BOUNDARY: Strictly in-memory mock store
          output = mockStore.requestAppointment(context.conversationId, {
            leadId,
            preferredSlot,
            customerName,
            phone,
            serviceAddress,
          });
        } else {
          // Contractor Mode: Real database persistence with status strictly 'requested'
          try {
            const apptResult = await ContractorPersistenceService.persistAppointment(
              context.businessId!,
              {
                leadId,
                requestedSlot: preferredSlot,
                notes: `Requested via AERIS AI for ${customerName || 'customer'} at ${serviceAddress || 'service address'}`,
              }
            );

            output = {
              success: true,
              appointmentId: apptResult.appointmentId,
              leadId,
              preferredSlot,
              status: 'requested', // STRICT INVARIANT: Always 'requested'
              isDuplicate: apptResult.isDuplicate,
              message: `Appointment requested for ${preferredSlot}. A dispatcher from ${config.name} will follow up to confirm.`,
            };
          } catch (dbErr: unknown) {
            console.error('[ToolExecutor] Failed to persist contractor appointment:', dbErr);
            throw new Error('Database persistence failed while requesting appointment.');
          }
        }
        break;
      }

      case 'transfer_to_human': {
        const reason = String(sanitizedArgs.reason || '');
        const urgency = (sanitizedArgs.urgency as UrgencyLevel) || 'normal';
        const summary = String(sanitizedArgs.summary || reason);

        if (isDemoMode) {
          output = mockStore.transferToHuman(context.conversationId, {
            reason,
            urgency,
            summary,
          });
        } else {
          const transferPhone = config.transferPhoneNumber || config.phone;
          const instructions = config.transferInstructions || 'Connecting to dispatcher on duty.';

          output = {
            success: true,
            status: 'transferred',
            transferId: `TR-${Date.now().toString().slice(-4)}`,
            transferred: true,
            reason,
            urgency,
            summary,
            transferNumber: transferPhone,
            instructions,
            message: `Call is being transferred to a human representative at ${transferPhone}.`,
          };
        }
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
        input: sanitizedArgs,
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
        input: sanitizedArgs,
        error: errorMsg,
        timestamp,
      },
    };
  }
}

/**
 * Synchronous tool executor preserved for backwards compatibility with tests and demo callers.
 * For contractor mode, persists in background when called synchronously.
 */
export function executeAgentTool(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  context: ExecuteToolContext
): ExecuteToolResult {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const actionId = `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const validToolName = toolName as ToolName;
  const displayName = TOOL_DISPLAY_NAMES[validToolName] || toolName;

  if (!VALID_TOOLS.includes(validToolName)) {
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

  const sanitizedArgs = { ...rawArgs };
  delete sanitizedArgs.business_id;
  delete sanitizedArgs.businessId;

  const config = context.businessConfig || DEFAULT_SUMMIT_HVAC_CONFIG;
  const isDemoMode = context.isDemo !== false || !context.businessId;

  try {
    let output: Record<string, unknown>;

    switch (validToolName) {
      case 'check_business_hours': {
        const day = typeof sanitizedArgs.day === 'string' ? sanitizedArgs.day : undefined;

        if (context.businessConfig) {
          const hours = context.businessConfig.businessHours;
          let specificDayHours = hours.weekdays;
          if (day && day.toLowerCase().includes('sat')) {
            specificDayHours = hours.saturday || 'Closed';
          } else if (day && day.toLowerCase().includes('sun')) {
            specificDayHours = hours.sunday || 'Closed';
          }

          output = {
            businessName: context.businessConfig.name,
            requestedDay: day || 'General',
            operatingHours: specificDayHours,
            weekdayHours: hours.weekdays,
            saturdayHours: hours.saturday || 'Closed',
            sundayHours: hours.sunday || 'Closed',
            emergencyService: context.businessConfig.emergencyServiceEnabled
              ? '24/7 on-call emergency service is enabled.'
              : 'Emergency service is not currently available outside standard operating hours.',
            emergencyAvailable: context.businessConfig.emergencyServiceEnabled,
            currentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        } else {
          output = mockStore.checkBusinessHours(day);
        }
        break;
      }

      case 'check_service_area': {
        const city = typeof sanitizedArgs.city === 'string' ? sanitizedArgs.city.trim() : undefined;
        const zip = typeof sanitizedArgs.zip === 'string' ? sanitizedArgs.zip.trim() : undefined;

        if (context.businessConfig) {
          const supportedCities = context.businessConfig.serviceAreas;
          const supportedZips = context.businessConfig.supportedZips || [];

          let matchedCity = false;
          let matchedZip = false;

          if (city) {
            matchedCity = supportedCities.some(
              (c) => c.toLowerCase() === city.toLowerCase() || city.toLowerCase().includes(c.toLowerCase())
            );
          }

          if (zip) {
            matchedZip = supportedZips.includes(zip);
          }

          const isSupported = matchedCity || matchedZip;

          output = {
            query: { city, zip },
            supported: isSupported,
            businessName: context.businessConfig.name,
            matchedLocation: matchedCity ? city : matchedZip ? zip : null,
            primaryServiceAreas: supportedCities,
            supportedZipCount: supportedZips.length,
            message: isSupported
              ? `Yes! ${city || zip} is within ${context.businessConfig.name}'s service territory.`
              : `Unfortunately, ${city || zip || 'that area'} is outside ${context.businessConfig.name}'s current service area. We serve ${supportedCities.join(', ')}.`,
          };
        } else {
          output = mockStore.checkServiceArea(context.conversationId, city, zip);
        }
        break;
      }

      case 'create_lead': {
        const customerName = String(sanitizedArgs.customerName || '');
        const phone = String(sanitizedArgs.phone || '');
        const serviceAddress = String(sanitizedArgs.serviceAddress || sanitizedArgs.address || '');
        const serviceType = String(sanitizedArgs.serviceType || '');
        const reportedIssue = String(sanitizedArgs.reportedIssue || '');
        const urgency = (sanitizedArgs.urgency as UrgencyLevel) || 'normal';

        if (isDemoMode) {
          output = mockStore.createLead(context.conversationId, {
            customerName,
            phone,
            serviceAddress,
            serviceType,
            reportedIssue,
            urgency,
          });
        } else {
          const deterministicLeadId = `LEAD-${Date.now().toString().slice(-4)}`;
          output = {
            success: true,
            leadId: deterministicLeadId,
            businessId: context.businessId || config.id,
            customerName,
            phone,
            serviceAddress,
            serviceType,
            reportedIssue,
            urgency,
            status: 'qualified',
            message: `Service lead created successfully for ${customerName} (${config.name}).`,
          };

          // Trigger asynchronous background persistence
          ContractorPersistenceService.persistLead(context.businessId!, {
            conversationId: context.conversationId,
            customerName,
            phone,
            serviceAddress,
            serviceType,
            reportedIssue,
            urgency,
            status: 'qualified',
            source: 'web_chat',
          }).catch((err) => console.error('[ToolExecutor] Background lead persistence error:', err));
        }
        break;
      }

      case 'get_available_slots': {
        const serviceType = typeof sanitizedArgs.serviceType === 'string' ? sanitizedArgs.serviceType : undefined;
        const urgency = sanitizedArgs.urgency as UrgencyLevel | undefined;
        const preferredDate = typeof sanitizedArgs.preferredDate === 'string' ? sanitizedArgs.preferredDate : undefined;

        output = mockStore.getAvailableSlots(context.conversationId, {
          serviceType,
          urgency,
          preferredDate,
        });
        break;
      }

      case 'request_appointment': {
        const leadId = String(sanitizedArgs.leadId || '');
        const preferredSlot = String(sanitizedArgs.preferredSlot || '');
        const customerName = String(sanitizedArgs.customerName || '');
        const phone = String(sanitizedArgs.phone || '');
        const serviceAddress = String(sanitizedArgs.serviceAddress || sanitizedArgs.address || '');

        if (isDemoMode) {
          output = mockStore.requestAppointment(context.conversationId, {
            leadId,
            preferredSlot,
            customerName,
            phone,
            serviceAddress,
          });
        } else {
          const appointmentId = `APT-${Date.now().toString().slice(-4)}`;
          output = {
            success: true,
            appointmentId,
            leadId,
            preferredSlot,
            status: 'requested',
            message: `Appointment requested for ${preferredSlot}. A dispatcher from ${config.name} will follow up to confirm.`,
          };

          // Trigger asynchronous background persistence
          ContractorPersistenceService.persistAppointment(context.businessId!, {
            leadId,
            requestedSlot: preferredSlot,
            notes: `Requested via AERIS AI for ${customerName || 'customer'} at ${serviceAddress || 'service address'}`,
          }).catch((err) => console.error('[ToolExecutor] Background appointment persistence error:', err));
        }
        break;
      }

      case 'transfer_to_human': {
        const reason = String(sanitizedArgs.reason || '');
        const urgency = (sanitizedArgs.urgency as UrgencyLevel) || 'normal';
        const summary = String(sanitizedArgs.summary || reason);

        if (isDemoMode) {
          output = mockStore.transferToHuman(context.conversationId, {
            reason,
            urgency,
            summary,
          });
        } else {
          const transferPhone = config.transferPhoneNumber || config.phone;
          const instructions = config.transferInstructions || 'Connecting to dispatcher on duty.';

          output = {
            success: true,
            status: 'transferred',
            transferId: `TR-${Date.now().toString().slice(-4)}`,
            transferred: true,
            reason,
            urgency,
            summary,
            transferNumber: transferPhone,
            instructions,
            message: `Call is being transferred to a human representative at ${transferPhone}.`,
          };
        }
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
        input: sanitizedArgs,
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
        input: sanitizedArgs,
        error: errorMsg,
        timestamp,
      },
    };
  }
}
