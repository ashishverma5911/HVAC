import { ContractorIndustry } from '@/lib/supabase/types';

export interface IndustryTemplate {
  industry: ContractorIndustry;
  displayName: string;
  contractorDescription: string;
  systemDomainPhrase: string;
  defaultServices: string[];
  intakeIssueExamples: string;
  noDangerousRepairRule: string;
  emergencyPolicyEnabledDesc: string;
  serviceTypeExamples: string;
}

export const INDUSTRY_TEMPLATES: Record<ContractorIndustry, IndustryTemplate> = {
  hvac: {
    industry: 'hvac',
    displayName: 'HVAC (Heating, Ventilation & Air Conditioning)',
    contractorDescription: 'residential and commercial heating and air conditioning contractor',
    systemDomainPhrase: 'heating or cooling system',
    defaultServices: [
      'AC Repair',
      'Heating Repair',
      'HVAC Maintenance',
    ],
    intakeIssueExamples: 'AC blowing warm air, furnace whistling, annual tune-up',
    noDangerousRepairRule:
      'Never tell callers to open electrical panels, touch capacitors, bypass switches, or handle refrigerant.',
    emergencyPolicyEnabledDesc:
      '24/7 on-call priority dispatch for urgent cooling and heating failures or safety hazards.',
    serviceTypeExamples: 'AC Repair, Heating Repair, HVAC Maintenance, AC Installation',
  },
  plumbing: {
    industry: 'plumbing',
    displayName: 'Plumbing & Drain Services',
    contractorDescription: 'residential and commercial plumbing and drain contractor',
    systemDomainPhrase: 'plumbing or water system',
    defaultServices: [
      'Emergency Leak & Burst Pipe Repair',
      'Drain Cleaning & Hydro-Jetting',
      'Water Heater Repair & Replacement',
      'Sewer Line Inspection',
    ],
    intakeIssueExamples: 'burst pipe, water heater leaking, main drain backup',
    noDangerousRepairRule:
      'Never tell callers to disassemble pressurized gas water heater valves, enter flooded electrical areas, or perform hazardous pipe repairs.',
    emergencyPolicyEnabledDesc:
      '24/7 on-call priority dispatch for active water leaks, burst pipes, sewer backups, or safety hazards.',
    serviceTypeExamples: 'Leak Repair, Drain Cleaning, Water Heater Repair, Sewer Inspection',
  },
  electrical: {
    industry: 'electrical',
    displayName: 'Electrical Services',
    contractorDescription: 'licensed residential and commercial electrical contractor',
    systemDomainPhrase: 'electrical system',
    defaultServices: [
      'Breaker Panel Repair & Upgrade',
      'Electrical Troubleshooting & Outages',
      'EV Charger Installation',
      'Generator Service & Installation',
    ],
    intakeIssueExamples: 'tripping breaker, partial power outage, flickering lights',
    noDangerousRepairRule:
      'Never tell callers to open live breaker panels, touch exposed wiring, bypass breakers, or handle high-voltage equipment.',
    emergencyPolicyEnabledDesc:
      '24/7 on-call priority dispatch for power outages, sparking panels, or electrical safety hazards.',
    serviceTypeExamples: 'Panel Repair, Electrical Troubleshooting, Outlet Repair, Generator Service',
  },
  roofing: {
    industry: 'roofing',
    displayName: 'Roofing & Exterior Services',
    contractorDescription: 'residential and commercial roofing and storm restoration contractor',
    systemDomainPhrase: 'roof or exterior system',
    defaultServices: [
      'Roof Leak Repair',
      'Storm & Hail Damage Inspection',
      'Emergency Roof Tarping',
      'Full Roof Replacement',
    ],
    intakeIssueExamples: 'active roof leak, missing shingles after storm, ceiling water stain',
    noDangerousRepairRule:
      'Never tell callers to climb onto roofs, walk on wet or damaged decking, or work near overhead power lines.',
    emergencyPolicyEnabledDesc:
      '24/7 on-call priority dispatch for active roof leaks, storm damage tarping, or structural hazards.',
    serviceTypeExamples: 'Roof Leak Repair, Storm Inspection, Emergency Tarping, Roof Replacement',
  },
  general_contractor: {
    industry: 'general_contractor',
    displayName: 'General Contracting & Property Maintenance',
    contractorDescription: 'residential and commercial property service contractor',
    systemDomainPhrase: 'property or building system',
    defaultServices: [
      'General Repair & Diagnostic',
      'Emergency Property Make-Safe',
      'Preventive Maintenance',
      'Remodeling & Installations',
    ],
    intakeIssueExamples: 'urgent property repair, water intrusion, scheduled maintenance',
    noDangerousRepairRule:
      'Never tell callers to open electrical panels, touch capacitors, bypass switches, handle refrigerant, or perform hazardous structural/utility repairs.',
    emergencyPolicyEnabledDesc:
      '24/7 on-call priority dispatch for urgent property failures or safety hazards.',
    serviceTypeExamples: 'General Repair, Emergency Service, Maintenance, Installation',
  },
};

export const VALID_CONTRACTOR_INDUSTRIES: ContractorIndustry[] = [
  'hvac',
  'plumbing',
  'electrical',
  'roofing',
  'general_contractor',
];

export const SUPPORTED_INDUSTRIES = VALID_CONTRACTOR_INDUSTRIES;

export function normalizeIndustry(industry?: string | null): ContractorIndustry {
  if (industry && (VALID_CONTRACTOR_INDUSTRIES as string[]).includes(industry)) {
    return industry as ContractorIndustry;
  }
  return 'hvac';
}

export function getIndustryTemplate(industry?: string | null): IndustryTemplate {
  return INDUSTRY_TEMPLATES[normalizeIndustry(industry)];
}
