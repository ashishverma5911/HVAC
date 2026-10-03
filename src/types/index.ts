export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'appointment_requested'
  | 'transferred'
  | 'completed';

export type UrgencyLevel = 'normal' | 'urgent' | 'emergency';

export type ServiceType =
  | 'AC Repair'
  | 'AC Installation'
  | 'Heating Repair'
  | 'HVAC Maintenance'
  | 'Emergency Inspection'
  | 'General Inquiry';

export type AllowedIntent =
  | 'AC_COOLING_FAILURE'
  | 'HEATING_FAILURE'
  | 'MAINTENANCE'
  | 'INSTALLATION'
  | 'PRICING'
  | 'APPOINTMENT'
  | 'SERVICE_AREA'
  | 'EMERGENCY'
  | 'GENERAL_QUESTION'
  | 'UNKNOWN';

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  serviceAddress?: string;
  city?: string;
  cityOrArea?: string;
  serviceType: string;
  problemDescription: string;
  urgency: UrgencyLevel;
  preferredAppointmentTime: string;
}

export interface ConversationMessage {
  id: string;
  sender: 'ai' | 'customer' | 'system';
  text: string;
  timestamp: string;
  extractedDetails?: Partial<CustomerInfo>;
}

export interface ExtractedCustomerData {
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  serviceAddress?: string | null;
  city?: string | null;
  cityOrArea?: string | null;
  serviceType?: string | null;
  reportedIssue?: string | null;
  urgency?: UrgencyLevel | null;
  preferredAppointmentTime?: string | null;
  isEmergencySafetyHazard?: boolean;
  hasCustomerRequestedAppointment?: boolean;
}

export type ActionStatus = 'pending' | 'success' | 'failed';

export type ToolName =
  | 'check_business_hours'
  | 'check_service_area'
  | 'create_lead'
  | 'get_available_slots'
  | 'request_appointment'
  | 'transfer_to_human';

export interface AgentAction {
  id: string;
  toolName: ToolName;
  displayName: string;
  status: ActionStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

export interface CheckBusinessHoursArgs {
  day?: string;
}

export interface CheckServiceAreaArgs {
  city?: string;
  zip?: string;
}

export interface CreateLeadArgs {
  customerName: string;
  phone: string;
  serviceAddress: string;
  serviceType: string;
  reportedIssue: string;
  urgency: UrgencyLevel;
}

export interface GetAvailableSlotsArgs {
  serviceType?: string;
  urgency?: UrgencyLevel;
  preferredDate?: string;
}

export interface RequestAppointmentArgs {
  leadId: string;
  preferredSlot: string;
  customerName: string;
  phone: string;
  serviceAddress: string;
}

export interface TransferToHumanArgs {
  reason: string;
  urgency: UrgencyLevel;
  summary: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatApiRequest {
  messages: ChatHistoryMessage[];
  currentData?: Partial<CustomerInfo>;
  conversationId?: string;
  leadId?: string;
}

export interface ChatApiResponse {
  message: string;
  detectedIntent: AllowedIntent;
  extractedData: ExtractedCustomerData;
  leadStatus: LeadStatus;
  leadId?: string;
  appointmentId?: string;
  executedActions?: AgentAction[];
}

export interface ConversationState {
  messages: ConversationMessage[];
  customerName: string;
  phone: string;
  address: string;
  serviceType: string;
  reportedIssue: string;
  urgency: UrgencyLevel;
  preferredAppointmentTime: string;
  leadStatus: LeadStatus;
  detectedIntent: AllowedIntent;
}

export interface BusinessProfile {
  name: string;
  tagline: string;
  location: string;
  serviceArea: string[];
  services: string[];
  businessHours: string;
  emergencyService: string;
  phoneDisplay: string;
}

export * from '@/lib/ai/contractorConfig';

export interface DemoScenario {
  id: string;
  title: string;
  category:
    | 'ac_not_cooling'
    | 'emergency_gas'
    | 'pricing'
    | 'appointment'
    | 'service_area'
    | 'after_hours';
  description: string;
  badgeText: string;
  detectedIntent: string;
  messages: Array<{
    sender: 'ai' | 'customer';
    text: string;
    extractedInfo?: Partial<CustomerInfo>;
    status?: LeadStatus;
  }>;
  finalInfo: CustomerInfo;
  finalStatus: LeadStatus;
}

export interface DashboardLead {
  id: string;
  customerName: string;
  service: string;
  city: string;
  urgency: UrgencyLevel;
  status: LeadStatus;
  timeReceived: string;
  phone: string;
  notes: string;
}

export interface DashboardMetrics {
  callsToday: number;
  leads: number;
  appointments: number;
  urgentRequests: number;
}
