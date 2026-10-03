export interface ContractorBusinessHours {
  weekdays: string;
  saturday?: string;
  sunday?: string;
}

export interface ContractorBusinessConfig {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  serviceAreas: string[];
  supportedZips?: string[];
  servicesOffered: string[];
  businessHours: ContractorBusinessHours;
  emergencyServiceEnabled: boolean;
  afterHoursInstructions?: string;
  transferPhoneNumber?: string;
  transferInstructions?: string;
  customGreeting?: string;
}

/**
 * Default reference configuration for the anonymous Summit HVAC demonstration sandbox.
 * Used exclusively for unauthenticated demo visitors on the landing page simulator.
 */
export const DEFAULT_SUMMIT_HVAC_CONFIG: ContractorBusinessConfig = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Summit HVAC',
  slug: 'summit-hvac',
  phone: '(214) 555-0100',
  address: '1000 Main Street',
  city: 'Dallas',
  state: 'TX',
  serviceAreas: ['Dallas', 'Plano', 'Irving', 'Garland', 'Richardson', 'Carrollton'],
  supportedZips: [
    '75001',
    '75023',
    '75024',
    '75025',
    '75075',
    '75080',
    '75081',
    '75082',
    '75201',
    '75202',
    '75204',
    '75205',
  ],
  servicesOffered: [
    'AC Repair',
    'AC Installation',
    'Heating & Furnace Repair',
    'HVAC Seasonal Maintenance & Tune-ups',
    '24/7 Emergency Service',
  ],
  businessHours: {
    weekdays: '8:00 AM – 6:00 PM',
    saturday: 'On-Call Emergency',
    sunday: 'On-Call Emergency',
  },
  emergencyServiceEnabled: true,
  afterHoursInstructions:
    'Immediate dispatch for emergency cooling, heating loss, or gas/safety hazards.',
  transferPhoneNumber: '(214) 555-0199',
  transferInstructions:
    'Transfer to human dispatcher on duty when safety hazard is detected or customer requests manager.',
  customGreeting:
    "Hi, you've reached Summit HVAC. I'm AERIS, your AI receptionist. How can I help you today?",
};
