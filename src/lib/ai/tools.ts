import { FunctionDeclaration, Type } from '@google/genai';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from './contractorConfig';

/**
 * Builds the exact 6 Phase 4 receptionist tool declarations dynamically
 * for a specific contractor's business configuration.
 *
 * CRITICAL TOOL CONTRACT PRESERVATION:
 * - check_business_hours
 * - check_service_area
 * - create_lead
 * - get_available_slots
 * - request_appointment
 * - transfer_to_human
 * All parameter types, required fields, and tool names remain strictly intact.
 */
export function buildReceptionistTools(config: ContractorBusinessConfig): FunctionDeclaration[] {
  const serviceAreaDesc =
    config.serviceAreas.length > 0
      ? config.serviceAreas.join(', ')
      : 'contractor service territory';

  return [
    {
      name: 'check_business_hours',
      description: `Retrieve ${config.name} regular operating hours, weekend policy, and emergency dispatch availability.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          day: {
            type: Type.STRING,
            description: 'Optional specific day of the week to check (e.g. Monday, Saturday, Sunday).',
          },
        },
      },
    },
    {
      name: 'check_service_area',
      description: `Check whether a customer city or zip code is within ${config.name} primary service area (${serviceAreaDesc}).`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          city: {
            type: Type.STRING,
            description: 'The city name provided by the customer (e.g. Plano, Dallas).',
          },
          zip: {
            type: Type.STRING,
            description: 'The 5-digit postal zip code provided by the customer.',
          },
        },
      },
    },
    {
      name: 'create_lead',
      description:
        'Create a formal CRM service lead once all required customer information is verified. Required info: non-ambiguous customer name, contact phone, complete service address, service type, and reported issue.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          customerName: {
            type: Type.STRING,
            description: 'Customer full name (must not be ambiguous like John/Alex).',
          },
          phone: {
            type: Type.STRING,
            description: 'Valid customer phone number with area code.',
          },
          serviceAddress: {
            type: Type.STRING,
            description: 'Full street address and city where service is needed.',
          },
          serviceType: {
            type: Type.STRING,
            description: 'Type of service requested (e.g. AC Repair, Heating Repair, HVAC Maintenance, AC Installation).',
          },
          reportedIssue: {
            type: Type.STRING,
            description: 'Description of the problem reported by the customer.',
          },
          urgency: {
            type: Type.STRING,
            description: 'Urgency level: normal, urgent, or emergency.',
          },
        },
        required: [
          'customerName',
          'phone',
          'serviceAddress',
          'serviceType',
          'reportedIssue',
          'urgency',
        ],
      },
    },
    {
      name: 'get_available_slots',
      description:
        'Retrieve valid upcoming technician inspection slots. Must be called before discussing or accepting any appointment time.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          serviceType: {
            type: Type.STRING,
            description: 'Service type to check availability for.',
          },
          urgency: {
            type: Type.STRING,
            description: 'Urgency classification (normal, urgent, emergency).',
          },
          preferredDate: {
            type: Type.STRING,
            description: 'Optional date or day preferred by the customer.',
          },
        },
      },
    },
    {
      name: 'request_appointment',
      description:
        'Record an appointment request linked to an existing valid leadId. The slot must be one of the slots returned by get_available_slots. Status will be recorded as requested (never confirmed).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          leadId: {
            type: Type.STRING,
            description: 'The valid lead ID returned by create_lead (e.g. LEAD-0001).',
          },
          preferredSlot: {
            type: Type.STRING,
            description: 'One of the exact valid slots previously retrieved from get_available_slots.',
          },
          customerName: {
            type: Type.STRING,
            description: 'Customer name matching the lead.',
          },
          phone: {
            type: Type.STRING,
            description: 'Customer phone matching the lead.',
          },
          serviceAddress: {
            type: Type.STRING,
            description: 'Customer service address matching the lead.',
          },
        },
        required: ['leadId', 'preferredSlot', 'customerName', 'phone', 'serviceAddress'],
      },
    },
    {
      name: 'transfer_to_human',
      description:
        'Escalate or transfer the call to a human dispatcher when safety emergency occurs, customer explicitly demands a human/manager, or the issue is outside service bounds.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: {
            type: Type.STRING,
            description: 'Specific reason for the transfer.',
          },
          urgency: {
            type: Type.STRING,
            description: 'Urgency level (normal, urgent, emergency).',
          },
          summary: {
            type: Type.STRING,
            description: 'Brief summary of the customer situation for the human dispatcher.',
          },
        },
        required: ['reason', 'urgency', 'summary'],
      },
    },
  ];
}

/**
 * Backward compatibility export: Default Phase 4 tool definitions for Summit HVAC demo.
 */
export const RECEPTIONIST_TOOLS = buildReceptionistTools(DEFAULT_SUMMIT_HVAC_CONFIG);
