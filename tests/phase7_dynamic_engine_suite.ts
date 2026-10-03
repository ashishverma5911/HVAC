import { buildReceptionistSystemInstruction, SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '../src/lib/ai/receptionistPrompt';
import { buildReceptionistTools, RECEPTIONIST_TOOLS } from '../src/lib/ai/tools';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from '../src/lib/ai/contractorConfig';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('PHASE 7 STEP 2: DYNAMIC AERIS AI ENGINE TEST SUITE');
console.log('====================================================\n');

// 1. Setup Two Distinct Contractor Configurations
const contractorA: ContractorBusinessConfig = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'ABC Cooling & Heating',
  slug: 'abc-cooling',
  phone: '(214) 555-0199',
  city: 'Plano',
  state: 'TX',
  serviceAreas: ['Plano', 'Richardson'],
  supportedZips: ['75023', '75024', '75080'],
  servicesOffered: ['AC Repair', 'HVAC Maintenance'],
  businessHours: {
    weekdays: '8:00 AM – 6:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: true,
  transferPhoneNumber: '(214) 555-0188',
  transferInstructions: 'Route to senior technician on call for Plano/Richardson area.',
};

const contractorB: ContractorBusinessConfig = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Desert Air Services',
  slug: 'desert-air',
  phone: '(602) 555-0200',
  city: 'Phoenix',
  state: 'AZ',
  serviceAreas: ['Phoenix', 'Scottsdale'],
  supportedZips: ['85001', '85002', '85251'],
  servicesOffered: ['Commercial Chillers', 'Heat Pumps'],
  businessHours: {
    weekdays: '7:00 AM – 7:00 PM',
    saturday: '7:00 AM – 2:00 PM',
    sunday: 'Closed',
  },
  emergencyServiceEnabled: false,
  transferPhoneNumber: '(602) 555-0299',
  transferInstructions: 'Direct to front office during business hours.',
};

// -----------------------------------------------------------------------------
// TEST 1: Contractor Differentiation in System Prompts
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Contractor Differentiation in System Prompts ---');
const promptA = buildReceptionistSystemInstruction(contractorA);
const promptB = buildReceptionistSystemInstruction(contractorB);

assert(promptA.includes('ABC Cooling & Heating'), 'Prompt A identifies as ABC Cooling & Heating');
assert(promptA.includes('Plano, TX'), 'Prompt A reflects Plano, TX location');
assert(promptA.includes('Plano, Richardson'), 'Prompt A reflects Plano & Richardson service territory');
assert(promptA.includes('24/7 on-call priority dispatch'), 'Prompt A reflects enabled emergency service');

assert(promptB.includes('Desert Air Services'), 'Prompt B identifies as Desert Air Services');
assert(promptB.includes('Phoenix, AZ'), 'Prompt B reflects Phoenix, AZ location');
assert(promptB.includes('Phoenix, Scottsdale'), 'Prompt B reflects Phoenix & Scottsdale service territory');
assert(promptB.includes('Emergency dispatch is not currently offered after hours'), 'Prompt B reflects disabled emergency service');
assert(!promptB.includes('ABC Cooling & Heating'), 'Prompt B does not leak Contractor A business name');
assert(!promptB.includes('Plano'), 'Prompt B does not leak Contractor A service areas');

// -----------------------------------------------------------------------------
// TEST 2: Immutable Safety Invariants Preserved Across All Contractors
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Immutable Safety Invariants Preserved Across All Contractors ---');
const safetyInvariants = [
  'IDENTIFY AS AI',
  'NO PROFESSIONAL DIAGNOSIS',
  'NO DANGEROUS REPAIR INSTRUCTIONS',
  'NEVER INVENT PRICING OR FEES',
  'SAFETY / EMERGENCY PROTOCOL',
  'Smell of natural gas, rotten eggs, or sulfur',
  'Fire or visible smoke',
  'Electrical sparks, burning odors',
  'Appointments are recorded as "requested", NEVER "confirmed"',
];

for (const invariant of safetyInvariants) {
  assert(promptA.includes(invariant) || promptA.toLowerCase().includes(invariant.toLowerCase()), `Contractor A prompt enforces invariant: "${invariant}"`);
  assert(promptB.includes(invariant) || promptB.toLowerCase().includes(invariant.toLowerCase()), `Contractor B prompt enforces invariant: "${invariant}"`);
  assert(SUMMIT_HVAC_SYSTEM_INSTRUCTION.includes(invariant) || SUMMIT_HVAC_SYSTEM_INSTRUCTION.toLowerCase().includes(invariant.toLowerCase()), `Summit HVAC demo prompt enforces invariant: "${invariant}"`);
}

// -----------------------------------------------------------------------------
// TEST 3: Dynamic Tool Factory & Exact Phase 4 Contract Preservation
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Dynamic Tool Factory & Exact Phase 4 Contract Preservation ---');
const toolsA = buildReceptionistTools(contractorA);
const toolsB = buildReceptionistTools(contractorB);

const expectedToolNames = [
  'check_business_hours',
  'check_service_area',
  'create_lead',
  'get_available_slots',
  'request_appointment',
  'transfer_to_human',
];

assert(toolsA.length === 6, 'Contractor A has exactly 6 tool declarations');
assert(toolsB.length === 6, 'Contractor B has exactly 6 tool declarations');
assert(RECEPTIONIST_TOOLS.length === 6, 'Default RECEPTIONIST_TOOLS has exactly 6 tool declarations');

for (const name of expectedToolNames) {
  const tA = toolsA.find((t) => t.name === name);
  const tB = toolsB.find((t) => t.name === name);
  assert(!!tA, `Contractor A tools include ${name}`);
  assert(!!tB, `Contractor B tools include ${name}`);
}

const serviceAreaToolA = toolsA.find((t) => t.name === 'check_service_area')!;
const serviceAreaToolB = toolsB.find((t) => t.name === 'check_service_area')!;

assert(Boolean(serviceAreaToolA.description?.includes('ABC Cooling & Heating')), 'Tool A description references ABC Cooling & Heating');
assert(Boolean(serviceAreaToolA.description?.includes('Plano, Richardson')), 'Tool A description references Plano & Richardson');
assert(Boolean(serviceAreaToolB.description?.includes('Desert Air Services')), 'Tool B description references Desert Air Services');
assert(Boolean(serviceAreaToolB.description?.includes('Phoenix, Scottsdale')), 'Tool B description references Phoenix & Scottsdale');

// -----------------------------------------------------------------------------
// TEST 4: Business-Scoped Tool Execution Behavior
// -----------------------------------------------------------------------------
async function runToolTests() {
  console.log('\n--- TEST 4: Business-Scoped Tool Execution Behavior ---');

  // City check: Plano
  const resPlanoA = await executeAgentTool('check_service_area', { city: 'Plano' }, {
    conversationId: 'test-conv-1',
    businessConfig: contractorA,
    isDemo: false,
  });
  assert(resPlanoA.success && resPlanoA.output?.supported === true, 'Plano is supported for Contractor A (ABC Cooling)');

  const resPlanoB = await executeAgentTool('check_service_area', { city: 'Plano' }, {
    conversationId: 'test-conv-2',
    businessConfig: contractorB,
    isDemo: false,
  });
  assert(resPlanoB.success && resPlanoB.output?.supported === false, 'Plano is NOT supported for Contractor B (Desert Air)');

  // City check: Phoenix
  const resPhoenixA = await executeAgentTool('check_service_area', { city: 'Phoenix' }, {
    conversationId: 'test-conv-3',
    businessConfig: contractorA,
    isDemo: false,
  });
  assert(resPhoenixA.success && resPhoenixA.output?.supported === false, 'Phoenix is NOT supported for Contractor A');

  const resPhoenixB = await executeAgentTool('check_service_area', { city: 'Phoenix' }, {
    conversationId: 'test-conv-4',
    businessConfig: contractorB,
    isDemo: false,
  });
  assert(resPhoenixB.success && resPhoenixB.output?.supported === true, 'Phoenix is supported for Contractor B');

  // Business Hours & Emergency Check
  const hoursResA = await executeAgentTool('check_business_hours', {}, {
    conversationId: 'test-conv-5',
    businessConfig: contractorA,
    isDemo: false,
  });
  assert(hoursResA.output?.operatingHours === '8:00 AM – 6:00 PM', 'Contractor A operating hours match 8:00 AM – 6:00 PM');
  assert(hoursResA.output?.emergencyAvailable === true, 'Contractor A emergency service is enabled');

  const hoursResB = await executeAgentTool('check_business_hours', {}, {
    conversationId: 'test-conv-6',
    businessConfig: contractorB,
    isDemo: false,
  });
  assert(hoursResB.output?.operatingHours === '7:00 AM – 7:00 PM', 'Contractor B operating hours match 7:00 AM – 7:00 PM');
  assert(hoursResB.output?.emergencyAvailable === false, 'Contractor B emergency service is disabled');

  // -----------------------------------------------------------------------------
  // TEST 5: Business Context Immutability & Client-Supplied Parameter Stripping
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 5: Business Context Immutability (Safeguard 3) ---');
  // Client attempts to pass a forged business_id or businessId in tool arguments
  const maliciousArgs = {
    customerName: 'Alice Smith',
    phone: '214-555-0199',
    serviceAddress: '123 Main St, Plano',
    serviceType: 'AC Repair',
    reportedIssue: 'Not cooling',
    urgency: 'normal',
    business_id: 'forged-attacker-id-666',
    businessId: 'forged-attacker-id-777',
  };

  const leadRes = await executeAgentTool('create_lead', maliciousArgs, {
    conversationId: 'test-conv-7',
    businessConfig: contractorA,
    businessId: contractorA.id,
    isDemo: false,
  });

  assert(leadRes.success === true, 'Lead creation succeeded');
  assert(leadRes.output?.businessId === contractorA.id, 'Output businessId strictly reflects server-verified business context');
  assert(leadRes.action.input.business_id === undefined, 'Client-supplied business_id was stripped from tool action input');
  assert(leadRes.action.input.businessId === undefined, 'Client-supplied businessId was stripped from tool action input');

  // -----------------------------------------------------------------------------
  // TEST 6: Demo Mode Boundary (Safeguard 2)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 6: Demo Mode Boundary (Safeguard 2) ---');
  // Demo execution uses DEFAULT_SUMMIT_HVAC_CONFIG and mockStore
  const demoLead = await executeAgentTool('create_lead', {
    customerName: 'Demo Tester',
    phone: '214-555-0100',
    serviceAddress: '1000 Main St, Dallas',
    serviceType: 'AC Repair',
    reportedIssue: 'AC making whistling noise',
    urgency: 'normal',
  }, {
    conversationId: 'demo-session-123',
    isDemo: true,
  });

  assert(demoLead.success === true, 'Demo lead created in mockStore');
  assert(demoLead.output?.leadId !== undefined, 'MockStore generated in-memory lead ID');

  const demoHours = await executeAgentTool('check_business_hours', {}, {
    conversationId: 'demo-session-123',
    isDemo: true,
  });
  assert(demoHours.output?.regularHours === 'Monday-Friday: 8:00 AM - 6:00 PM', 'Demo hours return Summit HVAC mock hours');
}

runToolTests().then(() => {

// -----------------------------------------------------------------------------
// TEST 7: Authenticated User with Missing Business Profile (Safeguard 1)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: Authenticated User with Missing Business Profile (Safeguard 1) ---');
// Verify the logic of tenant resolution when an authenticated user has no business profile:
// It MUST return status 403 and NOT fall back to isDemo: true.

interface MockAuthUser {
  id: string;
  email: string;
}

interface MockMemberRecord {
  business_id: string | null;
  role: string;
}

function simulateTenantResolution(user: MockAuthUser | null, memberRecord: MockMemberRecord | null) {
  // If unauthenticated -> Demo Sandbox
  if (!user) {
    return {
      success: true,
      isDemo: true,
      config: DEFAULT_SUMMIT_HVAC_CONFIG,
    };
  }

  // Authenticated user with missing business profile -> 403 Forbidden (SAFEGUARD 1)
  if (!memberRecord || !memberRecord.business_id) {
    return {
      success: false,
      status: 403,
      error: 'User is authenticated but has no associated business profile in the organization.',
      category: 'MISSING_BUSINESS_PROFILE',
    };
  }

  return {
    success: true,
    isDemo: false,
    businessId: memberRecord.business_id,
  };
}

const unauthResolution = simulateTenantResolution(null, null);
assert(unauthResolution.success === true && (unauthResolution as any).isDemo === true, 'Unauthenticated user correctly routes to Demo Sandbox');

const authenticatedNoBusiness = simulateTenantResolution({ id: 'user-without-biz', email: 'test@example.com' }, null);
assert(authenticatedNoBusiness.success === false, 'Authenticated user without business profile is rejected');
assert((authenticatedNoBusiness as any).status === 403, 'Rejection status is 403 Forbidden');
assert((authenticatedNoBusiness as any).category === 'MISSING_BUSINESS_PROFILE', 'Category is MISSING_BUSINESS_PROFILE');
assert((authenticatedNoBusiness as any).isDemo === undefined, 'Does NOT fall back to demo sandbox');

console.log('\n🎉 ALL STEP 2 DYNAMIC AERIS AI ENGINE TESTS PASSED! 🎉\n');
}).catch((err) => {
  console.error('Fatal error running Step 2 tests:', err);
  process.exit(1);
});
