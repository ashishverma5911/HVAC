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

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
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
