/**
 * Canonical Pilot Configuration for ABC Cooling & Heating.
 */

export const PILOT_CONFIG = {
  name: 'ABC Cooling & Heating',
  slug: 'abc-cooling-heating',
  phone: '(972) 555-0199',
  address: '1400 Preston Rd, Suite 400',
  city: 'Plano',
  state: 'TX',
  postalCode: '75093',
  serviceAreas: ['Plano', 'Richardson'],
  services: [
    'AC Repair & Diagnostic',
    'HVAC Maintenance',
    'Heating & Furnace Repair',
    'Emergency Service',
  ],
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyService: true,
  afterHoursPolicy:
    'Emergency service available 24/7 for urgent heating and cooling failures. Non-emergency inquiries will be scheduled during regular business hours.',
  transferInstructions:
    'Transfer customer to the emergency dispatch line at (972) 555-0199 if customer explicitly requests a person or reports a severe heating/cooling breakdown during freezing or extreme heat conditions.',
};
