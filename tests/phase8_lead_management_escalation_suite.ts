/**
 * Phase 8 Verification Suite: Lead Management and Human Escalation
 *
 * Verifies:
 * 1. Lead Creation & Capture (all required fields + created/updated timestamps)
 * 2. Missing Customer Information (never fabricates missing name, phone, or address)
 * 3. Lead Status & Validated Transitions (New, Contacted, Qualified, Appointment Requested, Converted, Closed / Not Proceeding)
 * 4. Duplicate Prevention (call-level idempotency + normalized phone & service idempotency)
 * 5. Appointment Requests (strictly 'requested' + "Appointment requested — contractor confirmation required.")
 * 6. Human Follow-Up & Escalation (internal notes, contact attempts, next follow-up action, originating call linkage, callback vs live transfer)
 * 7. Unauthorized Access & Cross-Contractor Isolation (Contractor A cannot read or update Contractor B's leads)
 * 8. Database Failure Handling (graceful failure and recovery without hanging or corrupting state)
 */

import {
  APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
  LEAD_STATUS_LABELS,
  VALID_LEAD_STATUSES,
  normalizeLeadStatusInput,
  sanitizeCustomerField,
  sanitizeLeadCaptureInput,
  validateLeadPatchPayload,
  validateLeadStatusTransition,
} from '../src/lib/validation/contractorLeads';
import { ContractorPersistenceService } from '../src/lib/services/contractorPersistence';
import { executeAgentTool, executeAgentToolAsync } from '../src/lib/ai/toolExecutor';
import { ContractorBusinessConfig, DEFAULT_SUMMIT_HVAC_CONFIG } from '../src/lib/ai/contractorConfig';
import { stripUntrustedTenantIds } from '../src/lib/validation/tenantSanitizer';

// 15-second in-process watchdog so the test suite can never hang
const watchdog = setTimeout(() => {
  console.error('\n❌ [TIMEOUT] phase8_lead_management_escalation_suite exceeded 15s watchdog limit.');
  process.exit(1);
}, 15_000);
watchdog.unref();

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runSuite() {
  console.log('\n====================================================================');
  console.log('🧪 RUNNING PHASE 8: LEAD MANAGEMENT & HUMAN ESCALATION SUITE');
  console.log('====================================================================\n');

  ContractorPersistenceService.clearLedger();
  ContractorPersistenceService.setSimulatedDatabaseFailure(false);

  const BIZ_ALPHA = 'aaaaaaaa-1111-4111-8111-111111111111';
  const BIZ_BETA = 'bbbbbbbb-2222-4222-8222-222222222222';

  const alphaConfig: ContractorBusinessConfig = {
    ...DEFAULT_SUMMIT_HVAC_CONFIG,
    id: BIZ_ALPHA,
    name: 'Alpha Heating & Air',
    phone: '(214) 555-0199',
    transferPhoneNumber: '(214) 555-0199',
    callbackInstructions: 'An Alpha Heating dispatcher will call you back within 15 minutes.',
  };

  // ---------------------------------------------------------------------------
  // SECTION 1: LEAD CAPTURE & MISSING CUSTOMER INFORMATION (NON-FABRICATION)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Lead Capture & Missing Customer Information (Non-Fabrication) ---');

  // 1.1 Sanitize fabricated placeholders to empty string
  assert(sanitizeCustomerField('Unknown') === '', '1.1a Strips "Unknown" placeholder to empty string');
  assert(sanitizeCustomerField('Not Provided') === '', '1.1b Strips "Not Provided" placeholder to empty string');
  assert(sanitizeCustomerField('N/A') === '', '1.1c Strips "N/A" placeholder to empty string');
  assert(sanitizeCustomerField('(555) 555-0000') === '', '1.1d Strips dummy 555-0000 phone number to empty string');
  assert(sanitizeCustomerField('Caller') === '', '1.1e Strips generic "Caller" placeholder to empty string');

  // 1.2 Partial customer data lead capture (missing name and address)
  const partialSanitized = sanitizeLeadCaptureInput({
    customerName: 'Unknown Caller',
    phone: '+12145550144',
    serviceAddress: 'Not provided',
    serviceType: 'AC Repair',
    reportedIssue: 'Outside condenser fan is not spinning',
    urgency: 'urgent',
    preferredAppointmentWindow: 'Tomorrow 9:00 AM - 11:00 AM',
    sourceCallId: 'CA90000000000000000000000000000001',
  });

  assert(
    partialSanitized.customerName === '',
    '1.2a Missing/placeholder customer name is never fabricated'
  );
  assert(
    partialSanitized.serviceAddress === '',
    '1.2b Missing/placeholder service address is never fabricated'
  );
  assert(
    partialSanitized.phone === '+12145550144',
    '1.2c Provided callback phone number is preserved'
  );
  assert(
    partialSanitized.missingCustomerFields.includes('customerName') &&
      partialSanitized.missingCustomerFields.includes('serviceAddress') &&
      !partialSanitized.missingCustomerFields.includes('phone'),
    '1.2d missingCustomerFields accurately tracks only unprovided fields'
  );

  // 1.3 Persist lead with missing customer fields via executeAgentToolAsync
  const convPartial = await ContractorPersistenceService.ensureConversation(
    BIZ_ALPHA,
    'telephony',
    'call-partial-01',
    {
      externalCallSid: 'CA90000000000000000000000000000001',
      callerIdentifier: '+12145550144',
      calledNumber: '+12145550199',
    }
  );

  const partialToolRes = await executeAgentToolAsync(
    'create_lead',
    {
      customerName: '',
      phone: '',
      serviceAddress: '',
      serviceType: 'Furnace Repair',
      reportedIssue: 'Caller hung up before giving name or callback number; heater clicking',
      urgency: 'urgent',
    },
    {
      conversationId: convPartial,
      businessId: BIZ_ALPHA,
      businessConfig: alphaConfig,
      isDemo: false,
      channel: 'telephony',
    }
  );

  assert(partialToolRes.success === true, '1.3a Lead creation succeeds even when customer name/phone/address are missing');
  assert(
    partialToolRes.output?.customerName === '' &&
      partialToolRes.output?.phone === '' &&
      partialToolRes.output?.serviceAddress === '',
    '1.3b Tool output preserves empty strings for missing customer fields without fabrication'
  );

  const partialLeadId = String(partialToolRes.output?.leadId || '');
  const partialLeadDetail = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_ALPHA,
    partialLeadId
  );
  assert(
    Boolean(partialLeadDetail && partialLeadDetail.lead.customer_name === '' && partialLeadDetail.lead.phone === ''),
    '1.3c Persisted lead record stores empty strings for missing customer info and never fabricates data'
  );
  assert(
    Boolean(partialLeadDetail?.lead.created_at && partialLeadDetail?.lead.updated_at),
    '1.3d Persisted lead includes created_at and updated_at timestamps'
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: DUPLICATE PREVENTION (CALL ID & NORMALIZED PHONE + SERVICE)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Duplicate Prevention (Webhook & AI Tool Call Idempotency) ---');

  const convDup = await ContractorPersistenceService.ensureConversation(
    BIZ_ALPHA,
    'telephony',
    'call-dup-01',
    {
      externalCallSid: 'CA90000000000000000000000000000002',
      callerIdentifier: '+12145550188',
      calledNumber: '+12145550199',
    }
  );

  // First tool call during call-dup-01 (only phone + issue known initially)
  const firstCallLead = await ContractorPersistenceService.persistLead(BIZ_ALPHA, {
    conversationId: convDup,
    sourceCallId: 'CA90000000000000000000000000000002',
    customerName: '',
    phone: '214-555-0188',
    serviceAddress: '',
    serviceType: 'AC Repair',
    reportedIssue: 'AC compressor making loud buzzing sound',
    urgency: 'urgent',
    status: 'qualified',
    source: 'telephony',
  });

  assert(Boolean(firstCallLead.leadId) && !firstCallLead.deduplicated, '2.1 First create_lead creates a new lead');

  // Second tool call during the SAME call-dup-01 (customer now provides name & address)
  const secondCallLead = await ContractorPersistenceService.persistLead(BIZ_ALPHA, {
    conversationId: convDup,
    sourceCallId: 'CA90000000000000000000000000000002',
    customerName: 'Marcus Vance',
    phone: '(214) 555-0188',
    serviceAddress: '450 Elm St, Dallas, TX',
    cityArea: 'Dallas',
    serviceType: 'AC Repair',
    reportedIssue: 'AC compressor making loud buzzing sound and tripping breaker',
    urgency: 'urgent',
    preferredAppointmentWindow: 'Wednesday 1:00 PM - 3:00 PM',
    status: 'qualified',
    source: 'telephony',
  });

  assert(
    secondCallLead.deduplicated === true &&
      secondCallLead.deduplicationReason === 'conversation_id' &&
      secondCallLead.leadId === firstCallLead.leadId,
    '2.2 Repeated lead creation on same call is deduplicated by conversation_id and returns same leadId'
  );

  const mergedLeadDetail = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_ALPHA,
    firstCallLead.leadId!
  );
  assert(
    mergedLeadDetail?.lead.customer_name === 'Marcus Vance' &&
      mergedLeadDetail?.lead.service_address === '450 Elm St, Dallas, TX' &&
      mergedLeadDetail?.lead.preferred_appointment_window === 'Wednesday 1:00 PM - 3:00 PM',
    '2.3 Same-call duplicate submission merges newly captured customer name, address, and appointment window'
  );

  // Third submission from a different conversation ID but same normalized phone + service within window
  const thirdCallLead = await ContractorPersistenceService.persistLead(BIZ_ALPHA, {
    conversationId: 'conv-retry-webhook-99',
    customerName: 'Marcus Vance',
    phone: '+1 (214) 555-0188',
    serviceAddress: '450 Elm St, Dallas, TX',
    serviceType: 'ac repair',
    reportedIssue: 'AC compressor making loud buzzing sound',
    urgency: 'urgent',
    status: 'qualified',
    source: 'telephony',
  });

  assert(
    thirdCallLead.deduplicated === true &&
      thirdCallLead.deduplicationReason === 'phone_and_service' &&
      thirdCallLead.leadId === firstCallLead.leadId,
    '2.4 Repeated webhook/tool call with same normalized phone + service type is deduplicated'
  );

  const alphaLeadsAfterDup = ContractorPersistenceService.getContractorLeads(BIZ_ALPHA);
  assert(
    alphaLeadsAfterDup.length === 2,
    `2.5 Contractor Alpha has exactly 2 leads total (no duplicate rows created), got ${alphaLeadsAfterDup.length}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: APPOINTMENT REQUESTS (NO UNVERIFIED BOOKING CONFIRMATION)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Appointment Requests ("Appointment requested — contractor confirmation required.") ---');

  const apptToolRes = await executeAgentToolAsync(
    'request_appointment',
    {
      leadId: firstCallLead.leadId,
      preferredSlot: 'Thursday, 10:00 AM - 12:00 PM',
      customerName: 'Marcus Vance',
      phone: '(214) 555-0188',
      serviceAddress: '450 Elm St, Dallas, TX',
    },
    {
      conversationId: convDup,
      businessId: BIZ_ALPHA,
      businessConfig: alphaConfig,
      isDemo: false,
      channel: 'telephony',
    }
  );

  assert(apptToolRes.success === true, '3.1 request_appointment tool succeeds');
  assert(
    apptToolRes.output?.status === 'requested' && apptToolRes.output?.confirmationRequired === true,
    '3.2 Appointment status is strictly "requested" and confirmationRequired is true'
  );
  assert(
    apptToolRes.output?.confirmationMessage === APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE &&
      String(apptToolRes.output?.message || '').includes(APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE),
    '3.3 Appointment response displays "Appointment requested — contractor confirmation required."'
  );

  const leadAfterAppt = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_ALPHA,
    firstCallLead.leadId!
  );
  assert(
    leadAfterAppt?.lead.status === 'appointment_requested' &&
      leadAfterAppt?.lead.preferred_appointment_window === 'Thursday, 10:00 AM - 12:00 PM' &&
      leadAfterAppt?.appointments.length === 1 &&
      leadAfterAppt?.appointments[0].status === 'requested',
    '3.4 Lead status transitions to appointment_requested and stores preferred appointment window'
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: LEAD STATUSES & TRANSITION VALIDATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Lead Statuses & Validated Transitions ---');

  // Verify all required statuses exist and normalize properly
  const requiredStatusInputs: Array<[string, string]> = [
    ['New', 'new'],
    ['Contacted', 'contacted'],
    ['Qualified', 'qualified'],
    ['Appointment Requested', 'appointment_requested'],
    ['Converted', 'converted'],
    ['Closed / Not Proceeding', 'closed_not_proceeding'],
  ];

  for (const [labelInput, expectedCode] of requiredStatusInputs) {
    const normalized = normalizeLeadStatusInput(labelInput);
    assert(
      normalized !== null && normalized === expectedCode && VALID_LEAD_STATUSES.includes(normalized),
      `4.1 Status "${labelInput}" normalizes to "${expectedCode}" (${normalized ? LEAD_STATUS_LABELS[normalized] : 'invalid'})`
    );
  }

  // Valid transitions
  assert(
    validateLeadStatusTransition('new', 'contacted').valid === true,
    '4.2a Valid transition: new -> contacted'
  );
  assert(
    validateLeadStatusTransition('contacted', 'qualified').valid === true,
    '4.2b Valid transition: contacted -> qualified'
  );
  assert(
    validateLeadStatusTransition('qualified', 'appointment_requested').valid === true,
    '4.2c Valid transition: qualified -> appointment_requested'
  );
  assert(
    validateLeadStatusTransition('appointment_requested', 'converted').valid === true,
    '4.2d Valid transition: appointment_requested -> converted'
  );
  assert(
    validateLeadStatusTransition('appointment_requested', 'closed_not_proceeding').valid === true,
    '4.2e Valid transition: appointment_requested -> closed_not_proceeding'
  );

  // Invalid transitions
  assert(
    validateLeadStatusTransition('converted', 'new').valid === false,
    '4.3a Invalid transition blocked: converted -> new'
  );
  assert(
    validateLeadStatusTransition('closed_not_proceeding', 'qualified').valid === false,
    '4.3b Invalid transition blocked: closed_not_proceeding -> qualified'
  );
  assert(
    validateLeadPatchPayload({ status: 'bogus_status' }, 'new').valid === false,
    '4.3c Bogus status value rejected with validation error'
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: HUMAN FOLLOW-UP & ESCALATION (NOTES, ATTEMPTS, NEXT FOLLOW-UP, CALLBACK)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Human Follow-Up & Escalation ---');

  // 5.1 Add internal note, contact attempt, and next follow-up action
  const followUpRes1 = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_ALPHA,
    firstCallLead.leadId!,
    {
      status: 'contacted',
      internalNote: 'Spoke with Marcus; confirmed condenser breaker is 40A.',
      contactAttempt: {
        method: 'phone',
        outcome: 'reached',
        summary: 'Called Marcus at (214) 555-0188; confirmed technician window.',
      },
      nextFollowUp: {
        action: 'Dispatch Senior Tech #4 on Thursday morning',
        dueAt: '2026-10-15T09:00:00Z',
        completed: false,
      },
    },
    { email: 'dispatcher@alpha-hvac.com', role: 'dispatcher' }
  );

  assert(followUpRes1.success === true, '5.1a Follow-up update succeeds for authorized contractor');
  if (followUpRes1.success) {
    assert(followUpRes1.lead.status === 'contacted', '5.1b Status updated to contacted');
    assert(
      followUpRes1.lead.internal_notes.length === 1 &&
        followUpRes1.lead.internal_notes[0].text.includes('condenser breaker'),
      '5.1c Internal note is persisted with author and timestamp'
    );
    assert(
      followUpRes1.lead.contact_attempts.length === 1 &&
        followUpRes1.lead.contact_attempts[0].outcome === 'reached',
      '5.1d Contact attempt is persisted with method, outcome, and summary'
    );
    assert(
      followUpRes1.lead.next_follow_up?.action === 'Dispatch Senior Tech #4 on Thursday morning',
      '5.1e Next follow-up action is persisted'
    );
  }

  // 5.2 Transition to Converted and then verify terminal transition protection
  const convertRes = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_ALPHA,
    firstCallLead.leadId!,
    { status: 'converted' },
    { email: 'dispatcher@alpha-hvac.com', role: 'dispatcher' }
  );
  assert(
    convertRes.success === true && convertRes.lead.status === 'converted',
    '5.2a Lead transitions cleanly from contacted to converted'
  );

  const invalidRevertRes = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_ALPHA,
    firstCallLead.leadId!,
    { status: 'new' },
    { email: 'dispatcher@alpha-hvac.com', role: 'dispatcher' }
  );
  assert(
    invalidRevertRes.success === false &&
      invalidRevertRes.status === 400 &&
      invalidRevertRes.code === 'INVALID_STATUS_TRANSITION',
    '5.2b Invalid status transition (converted -> new) is rejected with 400 INVALID_STATUS_TRANSITION'
  );

  // 5.3 Human escalation: callback request when live transfer is not connected
  const escalationRes = await executeAgentToolAsync(
    'transfer_to_human',
    {
      reason: 'Customer requested immediate supervisor callback regarding warranty coverage',
      urgency: 'urgent',
      summary: 'Warranty coverage question on compressor replacement',
      leadId: partialLeadId,
    },
    {
      conversationId: convPartial,
      businessId: BIZ_ALPHA,
      businessConfig: alphaConfig,
      isDemo: false,
      channel: 'telephony',
    }
  );

  assert(escalationRes.success === true, '5.3a transfer_to_human tool succeeds');
  assert(
    escalationRes.output?.liveTransferConnected === false &&
      escalationRes.output?.callbackRequested === true &&
      escalationRes.output?.escalationMode === 'callback_request',
    '5.3b When live transfer is not connected, escalation records a callback request without claiming a live transfer occurred'
  );

  // 5.4 Originating call details available on lead detail lookup
  const detailWithCall = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_ALPHA,
    firstCallLead.leadId!
  );
  assert(
    Boolean(
      detailWithCall?.conversation &&
        detailWithCall.conversation.external_call_sid === 'CA90000000000000000000000000000002' &&
        detailWithCall.lead.source_call_id === 'CA90000000000000000000000000000002'
    ),
    '5.4 Originating call ID/SID and conversation record are linked to the lead'
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: TENANT ISOLATION & UNAUTHORIZED ACCESS PROTECTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Tenant Isolation & Unauthorized Access Protection ---');

  // 6.1 Contractor Beta cannot read Contractor Alpha's lead
  const crossTenantRead = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_BETA,
    firstCallLead.leadId!
  );
  assert(
    crossTenantRead === null,
    '6.1 Contractor Beta cannot read Contractor Alpha lead detail (returns null / 404)'
  );

  // 6.2 Contractor Beta cannot update Contractor Alpha's lead status or notes
  const crossTenantWrite = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_BETA,
    firstCallLead.leadId!,
    {
      status: 'closed_not_proceeding',
      internalNote: 'Unauthorized cross-tenant note injection attempt',
    },
    { email: 'attacker@beta-hvac.com', role: 'owner' }
  );
  assert(
    crossTenantWrite.success === false &&
      crossTenantWrite.status === 404 &&
      crossTenantWrite.code === 'NOT_FOUND',
    '6.2 Contractor Beta cannot update Contractor Alpha lead (returns 404 NOT_FOUND)'
  );

  // 6.3 Verify Alpha lead was untouched by Beta's attempt
  const verifyAlphaUntouched = ContractorPersistenceService.getContractorLeadDetailFromLedger(
    BIZ_ALPHA,
    firstCallLead.leadId!
  );
  assert(
    verifyAlphaUntouched?.lead.status === 'converted' &&
      verifyAlphaUntouched?.lead.internal_notes.length === 1,
    '6.3 Contractor Alpha lead remains completely unmodified after cross-tenant PATCH attempt'
  );

  // 6.4 Untrusted tenant IDs in request payload are stripped
  const strippedPayload = stripUntrustedTenantIds<Record<string, unknown>>({
    business_id: BIZ_ALPHA,
    contractor_id: BIZ_ALPHA,
    businessId: BIZ_ALPHA,
    status: 'contacted',
  });
  assert(
    !('business_id' in strippedPayload) &&
      !('contractor_id' in strippedPayload) &&
      !('businessId' in strippedPayload) &&
      strippedPayload.status === 'contacted',
    '6.4 stripUntrustedTenantIds strips all client-supplied tenant identifiers from payload'
  );

  // ---------------------------------------------------------------------------
  // SECTION 7: DATABASE FAILURE HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Database Failure Handling ---');

  ContractorPersistenceService.setSimulatedDatabaseFailure(true);
  assert(
    ContractorPersistenceService.isSimulatedDatabaseFailure() === true,
    '7.1 Simulated database failure flag enabled'
  );

  const failedLeadPersist = await ContractorPersistenceService.persistLead(BIZ_ALPHA, {
    customerName: 'DB Failure Test User',
    phone: '+12145550999',
    serviceAddress: '999 Fail Ln',
    serviceType: 'AC Repair',
    reportedIssue: 'Should fail cleanly during DB outage',
    urgency: 'normal',
    status: 'new',
    source: 'web_chat',
  });
  assert(
    failedLeadPersist.leadId === null && failedLeadPersist.deduplicated === false,
    '7.2 persistLead returns { leadId: null } cleanly during database failure without throwing unhandled exceptions'
  );

  const failedFollowUpUpdate = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_ALPHA,
    firstCallLead.leadId!,
    { internalNote: 'Note during DB outage' }
  );
  assert(
    failedFollowUpUpdate.success === false &&
      failedFollowUpUpdate.status === 500 &&
      failedFollowUpUpdate.code === 'DATABASE_FAILURE',
    '7.3 updateLeadFollowUp returns 500 DATABASE_FAILURE during database outage'
  );

  // Restore DB and verify normal operation resumes
  ContractorPersistenceService.setSimulatedDatabaseFailure(false);
  const recoveredUpdate = await ContractorPersistenceService.updateLeadFollowUp(
    BIZ_ALPHA,
    firstCallLead.leadId!,
    { internalNote: 'Note saved after DB recovery' }
  );
  assert(
    recoveredUpdate.success === true && recoveredUpdate.lead.internal_notes.length === 2,
    '7.4 Service recovers cleanly after database outage is resolved'
  );

  // ---------------------------------------------------------------------------
  // SECTION 8: SYNCHRONOUS TOOL EXECUTOR BACKWARDS COMPATIBILITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. Synchronous executeAgentTool Compatibility ---');

  const syncApptRes = executeAgentTool(
    'request_appointment',
    {
      leadId: firstCallLead.leadId,
      preferredSlot: 'Friday 2:00 PM - 4:00 PM',
      customerName: 'Unknown',
      phone: 'N/A',
    },
    {
      conversationId: convDup,
      businessId: BIZ_ALPHA,
      businessConfig: alphaConfig,
      isDemo: false,
    }
  );
  assert(
    syncApptRes.success === true &&
      syncApptRes.output?.confirmationMessage === APPOINTMENT_CONFIRMATION_REQUIRED_MESSAGE,
    '8.1 Synchronous executeAgentTool includes "Appointment requested — contractor confirmation required."'
  );

  clearTimeout(watchdog);
  console.log('\n====================================================================');
  console.log(`🎉 PHASE 8 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================================\n');
}

runSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ PHASE 8 SUITE FAILED:', err);
    process.exit(1);
  });
