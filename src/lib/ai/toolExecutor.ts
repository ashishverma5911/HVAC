import { AgentAction, ToolName, UrgencyLevel } from '@/types';
import { mockStore } from '@/lib/mock/store';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from './contractorConfig';
import { ContractorPersistenceService } from '@/lib/services/contractorPersistence';
import { stripUntrustedTenantIds } from '@/lib/validation/tenantSanitizer';
import {
  APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
  sanitizeCustomerField,
  sanitizeLeadCaptureInput,
} from '@/lib/validation/contractorLeads';

export interface ExecuteToolContext {
  conversationId: string;
  businessConfig?: ContractorBusinessConfig;
  businessId?: string;
  isDemo?: boolean;
  channel?: 'web_chat' | 'web_voice' | 'telephony';
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
 * 1. Business Context Immutability: Client or LLM-supplied business_id / contractor_id inside rawArgs
 *    is stripped and NEVER used to override the server-verified business context.
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

  // SAFEGUARD: Strip any malicious or accidental client/LLM-supplied tenant/contractor IDs
  const sanitizedArgs = stripUntrustedTenantIds(rawArgs);

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
            timezone: context.businessConfig.timezone || 'America/Chicago',
            requestedDay: day || 'General',
            operatingHours: specificDayHours,
            weekdayHours: hours.weekdays,
            saturdayHours: hours.saturday || 'Closed',
            sundayHours: hours.sunday || 'Closed',
            emergencyService: context.businessConfig.emergencyServiceEnabled
              ? context.businessConfig.afterHoursInstructions || '24/7 on-call emergency service is enabled.'
              : 'Emergency service is not currently available outside standard operating hours.',
            emergencyAvailable: context.businessConfig.emergencyServiceEnabled,
            afterHoursBehavior: context.businessConfig.afterHoursBehavior || 'emergency_dispatch',
            afterHoursInstructions: context.businessConfig.afterHoursInstructions || null,
            callbackInstructions:
              context.businessConfig.callbackInstructions ||
              context.businessConfig.transferInstructions ||
              null,
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

          const session = mockStore.getSession(context.conversationId);
          session.serviceAreaChecked = true;
          session.serviceAreaSupported = isSupported;
          session.matchedArea = matchedCity ? (city || null) : matchedZip ? (zip || null) : null;

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

        if (context.businessId && !isDemoMode) {
          const isSupp = Boolean((output as Record<string, unknown>)?.supported);
          ContractorPersistenceService.persistCallEvent(context.businessId, context.conversationId, 'tool_audit', {
            tool: 'check_service_area',
            summary: isSupp
              ? `Service area checked — ${city || zip || 'Primary area'} (Passed)`
              : `Service area checked — ${city || zip || 'Unknown'} (Out of Area)`,
            status: isSupp ? 'passed' : 'rejected',
          }).catch(() => {});
        }
        break;
      }

      case 'create_lead': {
        const sanitizedLead = sanitizeLeadCaptureInput(sanitizedArgs);
        const customerName = sanitizedLead.customerName;
        const phone = sanitizedLead.phone;
        const serviceAddress = sanitizedLead.serviceAddress;
        const cityArea = sanitizedLead.cityArea;
        const serviceType = sanitizedLead.serviceType;
        const reportedIssue = sanitizedLead.reportedIssue;
        const urgency = sanitizedLead.urgency;
        const preferredAppointmentWindow = sanitizedLead.preferredAppointmentWindow;

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
            const session = mockStore.getSession(context.conversationId);
            const effectiveCityArea = cityArea || session.matchedArea || '';
            const effectiveStatus = preferredAppointmentWindow
              ? 'appointment_requested'
              : customerName && phone && (serviceAddress || effectiveCityArea)
              ? 'qualified'
              : 'new';

            const persistenceResult = await ContractorPersistenceService.persistLead(
              context.businessId!,
              {
                conversationId: context.conversationId,
                sourceCallId: context.conversationId,
                customerName,
                phone,
                serviceAddress,
                cityArea: effectiveCityArea || undefined,
                serviceType,
                reportedIssue,
                urgency,
                preferredAppointmentWindow: preferredAppointmentWindow || undefined,
                status: effectiveStatus,
                source: context.channel || 'web_chat',
              }
            );

            if (!persistenceResult.leadId) {
              throw new Error('Database persistence failed while recording service lead.');
            }

            session.leadId = persistenceResult.leadId;

            output = {
              success: true,
              leadId: persistenceResult.leadId,
              businessId: context.businessId,
              sourceCallId: context.conversationId,
              customerName,
              phone,
              serviceAddress,
              cityArea: effectiveCityArea || null,
              serviceType,
              reportedIssue,
              urgency,
              preferredAppointmentWindow: preferredAppointmentWindow || null,
              missingCustomerFields: sanitizedLead.missingCustomerFields,
              status: persistenceResult.lead?.status || effectiveStatus,
              isDuplicate: persistenceResult.isDuplicate,
              appointmentConfirmationMessage: preferredAppointmentWindow
                ? APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE
                : null,
              message: `Service lead created successfully${customerName ? ` for ${customerName}` : ''} (${config.name}).`,
            };

            ContractorPersistenceService.persistCallEvent(
              context.businessId!,
              context.conversationId,
              'tool_audit',
              {
                tool: 'create_lead',
                summary: `Lead created — ${persistenceResult.leadId}`,
                status: 'created',
                leadId: persistenceResult.leadId,
                isDuplicate: persistenceResult.isDuplicate,
              }
            ).catch(() => {});
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

        if (context.businessId && !isDemoMode) {
          const slots = (output as Record<string, unknown>)?.slots;
          const count = Array.isArray(slots) ? slots.length : 0;
          ContractorPersistenceService.persistCallEvent(
            context.businessId,
            context.conversationId,
            'tool_audit',
            {
              tool: 'get_available_slots',
              summary: `Availability checked — ${count} slots found`,
              status: 'retrieved',
              slotCount: count,
            }
          ).catch(() => {});
        }
        break;
      }

      case 'request_appointment': {
        const session = mockStore.getSession(context.conversationId);
        const leadId = String(sanitizedArgs.leadId || sanitizedArgs.lead_id || session.leadId || '');
        const rawSlot =
          sanitizedArgs.preferredSlot ||
          sanitizedArgs.preferred_slot ||
          sanitizedArgs.preferredAppointmentWindow ||
          sanitizedArgs.preferred_appointment_window ||
          sanitizedArgs.preferred_time_window ||
          '';
        const rawDate =
          sanitizedArgs.preferredDate || sanitizedArgs.preferred_date || '';
        const preferredSlot = String(
          rawSlot && rawDate && !String(rawSlot).includes(String(rawDate))
            ? `${rawDate} ${rawSlot}`
            : rawSlot || rawDate || ''
        ).trim();
        const customerName = sanitizeCustomerField(
          sanitizedArgs.customerName ?? sanitizedArgs.customer_name
        );
        const phone = sanitizeCustomerField(sanitizedArgs.phone ?? sanitizedArgs.customer_phone);
        const serviceAddress = sanitizeCustomerField(
          sanitizedArgs.serviceAddress ?? sanitizedArgs.service_address ?? sanitizedArgs.address
        );

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
                conversationId: context.conversationId,
                requestedSlot: preferredSlot,
                notes: `Requested via AERIS AI${customerName ? ` for ${customerName}` : ''}${serviceAddress ? ` at ${serviceAddress}` : ''}`,
              }
            );

            session.appointmentId = apptResult.appointmentId;
            if (apptResult.resolvedLeadId && !session.leadId) {
              session.leadId = apptResult.resolvedLeadId;
            }

            output = {
              success: true,
              appointmentId: apptResult.appointmentId,
              leadId: apptResult.resolvedLeadId || leadId,
              preferredSlot,
              status: 'requested', // STRICT INVARIANT: Always 'requested', never 'confirmed'
              confirmationRequired: true,
              confirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
              isDuplicate: apptResult.isDuplicate,
              appointmentRequestRules: config.appointmentRequestRules || null,
              callbackInstructions:
                config.callbackInstructions || config.transferInstructions || null,
              message: `${APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE} Requested window: ${preferredSlot}. A dispatcher from ${config.name} will follow up to confirm.`,
            };

            ContractorPersistenceService.persistCallEvent(
              context.businessId!,
              context.conversationId,
              'tool_audit',
              {
                tool: 'request_appointment',
                summary: `Appointment request — Requested for ${preferredSlot}`,
                status: 'requested',
                confirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
                appointmentId: apptResult.appointmentId,
                leadId: apptResult.resolvedLeadId || leadId,
              }
            ).catch(() => {});
          } catch (dbErr: unknown) {
            console.error('[ToolExecutor] Failed to persist contractor appointment:', dbErr);
            throw new Error('Database persistence failed while requesting appointment.');
          }
        }
        break;
      }

      case 'transfer_to_human': {
        const rawReason = String(sanitizedArgs.reason || '').trim();
        const rawSummary = String(sanitizedArgs.summary || '').trim();
        const reason = rawReason || rawSummary;
        if (!reason) {
          throw new Error('Transfer to human requires a valid reason.');
        }
        const urgency = (sanitizedArgs.urgency as UrgencyLevel) || 'normal';
        const summary = rawSummary || reason;

        if (isDemoMode) {
          output = mockStore.transferToHuman(context.conversationId, {
            reason,
            urgency,
            summary,
          });
        } else {
          const transferPhone = config.transferPhoneNumber || config.phone;
          const instructions =
            config.transferInstructions ||
            config.callbackInstructions ||
            'Connecting to dispatcher on duty.';
          const session = mockStore.getSession(context.conversationId);
          const isDuplicate = Boolean(session.transferId);
          const transferId = session.transferId || `TR-${Date.now().toString().slice(-4)}`;
          const liveTransferConnected = Boolean(
            process.env.LIVE_PSTN_TRANSFER_ENABLED === 'true' && context.channel === 'telephony'
          );

          const escalation = await ContractorPersistenceService.recordHumanEscalation(
            context.businessId!,
            {
              conversationId: context.conversationId,
              leadId: session.leadId || undefined,
              reason,
              urgency,
              summary,
              transferNumber: transferPhone,
              liveTransferConnected,
            }
          );

          session.transferId = transferId;

          output = {
            success: true,
            status: 'transferred',
            transferId,
            isDuplicate,
            transferred: liveTransferConnected,
            liveTransferConnected,
            callbackRequested: !liveTransferConnected,
            escalationType: escalation.escalationType,
            escalationMode: escalation.escalationMode,
            reason,
            urgency,
            summary,
            transferNumber: transferPhone,
            instructions,
            callbackInstructions: config.callbackInstructions || instructions,
            message: liveTransferConnected
              ? `Live call transfer connected to a human representative at ${transferPhone}.`
              : `Priority human callback request recorded for ${config.name} (${transferPhone}). Live call transfer is not connected; a human team member will call the customer back promptly.`,
          };

          if (context.businessId && !isDuplicate) {
            ContractorPersistenceService.persistCallEvent(
              context.businessId,
              context.conversationId,
              'tool_audit',
              {
                tool: 'transfer_to_human',
                summary: liveTransferConnected
                  ? `Human transfer — Connected for ${urgency} (${reason || 'Customer request'})`
                  : `Human callback requested — Priority escalation for ${urgency} (${reason || 'Customer request'})`,
                status: liveTransferConnected ? 'transferred' : 'callback_requested',
                liveTransferConnected,
                transferPhone,
              }
            ).catch(() => {});
          }
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

  const sanitizedArgs = stripUntrustedTenantIds(rawArgs);

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
            timezone: context.businessConfig.timezone || 'America/Chicago',
            requestedDay: day || 'General',
            operatingHours: specificDayHours,
            weekdayHours: hours.weekdays,
            saturdayHours: hours.saturday || 'Closed',
            sundayHours: hours.sunday || 'Closed',
            emergencyService: context.businessConfig.emergencyServiceEnabled
              ? context.businessConfig.afterHoursInstructions || '24/7 on-call emergency service is enabled.'
              : 'Emergency service is not currently available outside standard operating hours.',
            emergencyAvailable: context.businessConfig.emergencyServiceEnabled,
            afterHoursBehavior: context.businessConfig.afterHoursBehavior || 'emergency_dispatch',
            afterHoursInstructions: context.businessConfig.afterHoursInstructions || null,
            callbackInstructions:
              context.businessConfig.callbackInstructions ||
              context.businessConfig.transferInstructions ||
              null,
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

          const session = mockStore.getSession(context.conversationId);
          session.serviceAreaChecked = true;
          session.serviceAreaSupported = isSupported;
          session.matchedArea = matchedCity ? (city || null) : matchedZip ? (zip || null) : null;

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
        const sanitizedLead = sanitizeLeadCaptureInput({
          customerName: sanitizedArgs.customerName,
          phone: sanitizedArgs.phone,
          serviceAddress: sanitizedArgs.serviceAddress || sanitizedArgs.address || sanitizedArgs.serviceArea,
          serviceType: sanitizedArgs.serviceType || 'HVAC Service',
          reportedIssue: sanitizedArgs.reportedIssue || sanitizedArgs.problemDescription,
          urgency: sanitizedArgs.urgency,
          preferredAppointmentWindow:
            sanitizedArgs.preferredAppointmentWindow || sanitizedArgs.preferredSlot,
          sourceCallId: sanitizedArgs.sourceCallId || context.conversationId,
          status: sanitizedArgs.status,
          source: context.channel || 'web_chat',
        });

        const customerName = sanitizedLead.customerName;
        const phone = sanitizedLead.phone;
        const serviceAddress = sanitizedLead.serviceAddress;
        const serviceType = sanitizedLead.serviceType;
        const reportedIssue = sanitizedLead.reportedIssue;
        const urgency = sanitizedLead.urgency;

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
          const session = mockStore.getSession(context.conversationId);
          session.leadId = deterministicLeadId;
          const displayCustomer = customerName || phone || 'caller';
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
            preferredAppointmentWindow: sanitizedLead.preferredAppointmentWindow,
            sourceCallId: sanitizedLead.sourceCallId,
            missingCustomerFields: sanitizedLead.missingCustomerFields,
            status: 'qualified',
            message: `Service lead created successfully for ${displayCustomer} (${config.name}).`,
          };

          // Trigger asynchronous background persistence
          ContractorPersistenceService.persistLead(context.businessId!, {
            conversationId: context.conversationId,
            sourceCallId: sanitizedLead.sourceCallId || context.conversationId,
            customerName,
            phone,
            serviceAddress,
            serviceType,
            reportedIssue,
            urgency,
            preferredAppointmentWindow: sanitizedLead.preferredAppointmentWindow,
            status: 'qualified',
            source: context.channel || 'web_chat',
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
        const session = mockStore.getSession(context.conversationId);
        const leadId = String(sanitizedArgs.leadId || session.leadId || '');
        const preferredSlot = String(
          sanitizedArgs.preferredSlot || sanitizedArgs.preferredAppointmentWindow || ''
        ).trim();
        const customerName = sanitizeCustomerField(sanitizedArgs.customerName);
        const phone = sanitizeCustomerField(sanitizedArgs.phone);
        const serviceAddress = sanitizeCustomerField(
          sanitizedArgs.serviceAddress || sanitizedArgs.address
        );

        if (isDemoMode) {
          const demoOut = mockStore.requestAppointment(context.conversationId, {
            leadId,
            preferredSlot,
            customerName,
            phone,
            serviceAddress,
          });
          output = {
            ...demoOut,
            status: 'requested',
            confirmationRequired: true,
            confirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
          };
        } else {
          const appointmentId = `APT-${Date.now().toString().slice(-4)}`;
          session.appointmentId = appointmentId;
          output = {
            success: true,
            appointmentId,
            leadId,
            preferredSlot,
            status: 'requested',
            confirmationRequired: true,
            confirmationMessage: APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
            appointmentRequestRules: config.appointmentRequestRules || null,
            callbackInstructions:
              config.callbackInstructions || config.transferInstructions || null,
            message: `${APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE} Requested window: ${preferredSlot}. A dispatcher from ${config.name} will follow up to confirm.`,
          };

          // Trigger asynchronous background persistence
          ContractorPersistenceService.persistAppointment(context.businessId!, {
            leadId,
            conversationId: context.conversationId,
            requestedSlot: preferredSlot,
            notes: `Requested via AERIS AI${customerName ? ` for ${customerName}` : ''}${serviceAddress ? ` at ${serviceAddress}` : ''}`,
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
          const liveTransferConnected = sanitizedArgs.liveTransferConnected === true;
          const instructions =
            config.transferInstructions ||
            config.callbackInstructions ||
            'Connecting to dispatcher on duty.';
          const transferId = `TR-${Date.now().toString().slice(-4)}`;
          const session = mockStore.getSession(context.conversationId);
          session.transferId = transferId;

          ContractorPersistenceService.recordHumanEscalation(context.businessId!, {
            conversationId: context.conversationId,
            leadId: session.leadId || String(sanitizedArgs.leadId || '') || undefined,
            reason,
            urgency,
            summary,
            transferNumber: transferPhone,
            liveTransferConnected,
            callbackRequested: true,
          }).catch((err) => console.error('[ToolExecutor] Background human escalation error:', err));

          output = {
            success: true,
            status: liveTransferConnected ? 'transferred' : 'callback_requested',
            escalationMode: liveTransferConnected ? 'live_transfer' : 'callback_request',
            transferId,
            transferred: true,
            liveTransferConnected,
            callbackRequested: true,
            reason,
            urgency,
            summary,
            transferNumber: transferPhone,
            instructions,
            callbackInstructions: config.callbackInstructions || instructions,
            message: liveTransferConnected
              ? `Call is being transferred to a human representative at ${transferPhone}.`
              : `Human callback request logged for ${config.name} (${transferPhone}). ${config.callbackInstructions || instructions}`,
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
