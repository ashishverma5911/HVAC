import { mockStore, AVAILABLE_APPOINTMENT_SLOTS } from '../src/lib/mock/store';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runPhase4Tests() {
  console.log('\n--- STARTING PHASE 4 VERIFICATION TESTS ---\n');

  // TEST 1: Check service area - supported city (Plano) -> success
  {
    mockStore.resetStore();
    const res = executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: 'test-c1' });
    assert(res.success === true, 'Test 1.1: check_service_area for Plano succeeds');
    assert(res.output?.supported === true, 'Test 1.2: Plano output indicates supported: true');
    assert(res.output?.matchedArea === 'Plano', 'Test 1.3: Plano is matchedArea');
    assert(res.action.status === 'success', 'Test 1.4: Action status is success');
  }

  // TEST 2: Check service area - unsupported city (Houston) -> unsupported response
  {
    mockStore.resetStore();
    const res = executeAgentTool('check_service_area', { city: 'Houston' }, { conversationId: 'test-c2' });
    assert(res.success === true, 'Test 2.1: Tool executes without crashing');
    assert(res.output?.supported === false, 'Test 2.2: Houston returns supported: false');
    assert(res.output?.matchedArea === null, 'Test 2.3: matchedArea is null');
    assert(typeof res.output?.message === 'string', 'Test 2.4: Friendly explanation message returned');
  }

  // TEST 3: Create lead - valid details -> leadId generated
  {
    mockStore.resetStore();
    const res = executeAgentTool(
      'create_lead',
      {
        customerName: 'Alex Miller',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
        serviceType: 'AC Repair',
        reportedIssue: 'AC blowing warm air',
        urgency: 'normal',
      },
      { conversationId: 'test-c3' }
    );
    assert(res.success === true, 'Test 3.1: Valid lead creation succeeds');
    assert(res.output?.status === 'created', 'Test 3.2: Status is created');
    assert(typeof res.output?.leadId === 'string' && res.output.leadId.startsWith('LEAD-'), 'Test 3.3: leadId formatted as LEAD-xxxx');
    assert(res.action.status === 'success', 'Test 3.4: Action status recorded as success');
  }

  // TEST 4: Create lead - duplicate call -> same leadId returned (Idempotency)
  {
    mockStore.resetStore();
    const leadArgs = {
      customerName: 'Alex Miller',
      phone: '214-555-0199',
      serviceAddress: '456 Oak Street, Plano',
      serviceType: 'AC Repair',
      reportedIssue: 'AC blowing warm air',
      urgency: 'normal' as const,
    };
    const first = executeAgentTool('create_lead', leadArgs, { conversationId: 'test-c4' });
    const leadId1 = first.output?.leadId;

    // Second call in same conversation
    const second = executeAgentTool('create_lead', leadArgs, { conversationId: 'test-c4' });
    const leadId2 = second.output?.leadId;

    assert(leadId1 === leadId2, 'Test 4.1: Duplicate call returns existing leadId');
    assert(second.output?.isDuplicate === true, 'Test 4.2: isDuplicate flag is true');
  }

  // TEST 5: Get available slots -> returns list of valid slots
  {
    mockStore.resetStore();
    const res = executeAgentTool('get_available_slots', {}, { conversationId: 'test-c5' });
    const slots = (res.output?.slots as string[]) || [];
    assert(res.success === true, 'Test 5.1: get_available_slots succeeds');
    assert(Array.isArray(res.output?.slots), 'Test 5.2: slots is an array');
    assert(slots.length === 8, 'Test 5.3: exactly 8 available slots returned');
    assert(slots[0] === 'Monday 10:00 AM', 'Test 5.4: first slot is Monday 10:00 AM');
  }

  // TEST 6: Request appointment - valid slot -> appointmentId generated, status "requested"
  {
    mockStore.resetStore();
    const convId = 'test-c6';

    // Prerequisite 1: check_service_area
    executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: convId });

    // Prerequisite 2: create_lead
    const leadRes = executeAgentTool(
      'create_lead',
      {
        customerName: 'Sarah Jenkins',
        phone: '469-555-8833',
        serviceAddress: '1201 Commerce St, Dallas',
        serviceType: 'Heating Repair',
        reportedIssue: 'Furnace making rattling sound',
        urgency: 'normal',
      },
      { conversationId: convId }
    );
    const leadId = leadRes.output?.leadId as string;

    // Prerequisite 3: get_available_slots
    executeAgentTool('get_available_slots', {}, { conversationId: convId });

    // Execute request_appointment with valid slot
    const apptRes = executeAgentTool(
      'request_appointment',
      {
        leadId,
        preferredSlot: 'Tuesday 9:00 AM',
        customerName: 'Sarah Jenkins',
        phone: '469-555-8833',
        serviceAddress: '1201 Commerce St, Dallas',
      },
      { conversationId: convId }
    );

    assert(apptRes.success === true, 'Test 6.1: request_appointment succeeds with valid slot');
    assert(apptRes.output?.status === 'requested', 'Test 6.2: Appointment status is STRICTLY "requested" (never confirmed)');
    assert(typeof apptRes.output?.appointmentId === 'string' && apptRes.output.appointmentId.startsWith('APT-'), 'Test 6.3: appointmentId is APT-xxxx');
    assert(apptRes.output?.slot === 'Tuesday 9:00 AM', 'Test 6.4: slot matches requested slot');
  }

  // TEST 7: Request appointment - invalid slot -> validation error
  {
    mockStore.resetStore();
    const convId = 'test-c7';

    executeAgentTool('check_service_area', { city: 'Dallas' }, { conversationId: convId });
    const leadRes = executeAgentTool(
      'create_lead',
      {
        customerName: 'David Lee',
        phone: '972-555-4321',
        serviceAddress: '789 Main St, Dallas',
        serviceType: 'AC Repair',
        reportedIssue: 'AC stopped cooling',
        urgency: 'normal',
      },
      { conversationId: convId }
    );
    executeAgentTool('get_available_slots', {}, { conversationId: convId });

    const invalidAppt = executeAgentTool(
      'request_appointment',
      {
        leadId: leadRes.output?.leadId as string,
        preferredSlot: 'Sunday 3:00 AM Midnight', // INVALID SLOT
        customerName: 'David Lee',
        phone: '972-555-4321',
        serviceAddress: '789 Main St, Dallas',
      },
      { conversationId: convId }
    );

    assert(invalidAppt.success === false, 'Test 7.1: Invalid slot is rejected by server');
    assert(invalidAppt.action.status === 'failed', 'Test 7.2: Action marked as failed');
    assert(Boolean(invalidAppt.error?.includes('Invalid appointment slot')), 'Test 7.3: Error message describes invalid slot');
  }

  // TEST 8: Transfer to human - emergency or user request -> transferId generated
  {
    mockStore.resetStore();
    const res = executeAgentTool(
      'transfer_to_human',
      {
        reason: 'Customer reported strong smell of natural gas near furnace',
        urgency: 'emergency',
        summary: 'Emergency gas leak escalation. Caller advised to evacuate.',
      },
      { conversationId: 'test-c8' }
    );

    assert(res.success === true, 'Test 8.1: transfer_to_human succeeds');
    assert(res.output?.status === 'transferred', 'Test 8.2: Status is transferred');
    assert(typeof res.output?.transferId === 'string' && res.output.transferId.startsWith('TR-'), 'Test 8.3: transferId generated (TR-xxxx)');
    assert(res.action.status === 'success', 'Test 8.4: Action recorded as success');
  }

  // TEST 9: Sequencing Dependency Rules (Strict Application State Enforcement)
  {
    console.log('\n--- TESTING SEQUENCING & PREREQUISITE RULES ---\n');

    // Rule 1: check_service_area must succeed before request_appointment can execute
    mockStore.resetStore();
    const seqConv1 = 'seq-conv-1';
    // Create lead without checking service area
    const l1 = executeAgentTool(
      'create_lead',
      {
        customerName: 'John Doe',
        phone: '214-555-1212',
        serviceAddress: '100 Elm St, Dallas',
        serviceType: 'AC Repair',
        reportedIssue: 'Fan stopped',
        urgency: 'normal',
      },
      { conversationId: seqConv1 }
    );
    executeAgentTool('get_available_slots', {}, { conversationId: seqConv1 });

    const failedRule1 = executeAgentTool(
      'request_appointment',
      {
        leadId: l1.output?.leadId as string,
        preferredSlot: 'Monday 10:00 AM',
        customerName: 'John Doe',
        phone: '214-555-1212',
        serviceAddress: '100 Elm St, Dallas',
      },
      { conversationId: seqConv1 }
    );
    assert(failedRule1.success === false, 'Rule 1: request_appointment rejected when service area not checked');
    assert(Boolean(failedRule1.error?.includes('Service area check must succeed')), 'Rule 1 error message matches');

    // Rule 2: Required customer information must exist before create_lead
    mockStore.resetStore();
    const failedAmbiguousName = executeAgentTool(
      'create_lead',
      {
        customerName: 'John/Alex', // AMBIGUOUS NAME
        phone: '214-555-1212',
        serviceAddress: '100 Elm St, Dallas',
        serviceType: 'AC Repair',
        reportedIssue: 'Fan stopped',
        urgency: 'normal',
      },
      { conversationId: 'seq-conv-2' }
    );
    assert(failedAmbiguousName.success === false, 'Rule 2.1: Ambiguous name rejected for create_lead');

    const failedEmptyPhone = executeAgentTool(
      'create_lead',
      {
        customerName: 'Valid Name',
        phone: '', // MISSING PHONE
        serviceAddress: '100 Elm St, Dallas',
        serviceType: 'AC Repair',
        reportedIssue: 'Fan stopped',
        urgency: 'normal',
      },
      { conversationId: 'seq-conv-2' }
    );
    assert(failedEmptyPhone.success === false, 'Rule 2.2: Missing phone rejected for create_lead');

    const failedEmptyAddress = executeAgentTool(
      'create_lead',
      {
        customerName: 'Valid Name',
        phone: '214-555-1212',
        serviceAddress: '', // MISSING ADDRESS
        serviceType: 'AC Repair',
        reportedIssue: 'Fan stopped',
        urgency: 'normal',
      },
      { conversationId: 'seq-conv-2' }
    );
    assert(failedEmptyAddress.success === false, 'Rule 2.3: Missing address rejected for create_lead');

    // Rule 3: Valid lead must exist before request_appointment
    mockStore.resetStore();
    const seqConv3 = 'seq-conv-3';
    executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: seqConv3 });
    executeAgentTool('get_available_slots', {}, { conversationId: seqConv3 });

    const failedNoLead = executeAgentTool(
      'request_appointment',
      {
        leadId: 'LEAD-9999', // NON-EXISTENT LEAD
        preferredSlot: 'Monday 10:00 AM',
        customerName: 'Someone',
        phone: '214-555-9999',
        serviceAddress: '456 Oak St, Plano',
      },
      { conversationId: seqConv3 }
    );
    assert(failedNoLead.success === false, 'Rule 3: request_appointment rejected when leadId does not exist');

    // Rule 4: get_available_slots must be called before accepting appointment
    mockStore.resetStore();
    const seqConv4 = 'seq-conv-4';
    executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: seqConv4 });
    const l4 = executeAgentTool(
      'create_lead',
      {
        customerName: 'Valid Name',
        phone: '214-555-1212',
        serviceAddress: '456 Oak St, Plano',
        serviceType: 'AC Repair',
        reportedIssue: 'AC warm',
        urgency: 'normal',
      },
      { conversationId: seqConv4 }
    );
    // Did NOT call get_available_slots
    const failedNoSlots = executeAgentTool(
      'request_appointment',
      {
        leadId: l4.output?.leadId as string,
        preferredSlot: 'Monday 10:00 AM',
        customerName: 'Valid Name',
        phone: '214-555-1212',
        serviceAddress: '456 Oak St, Plano',
      },
      { conversationId: seqConv4 }
    );
    assert(failedNoSlots.success === false, 'Rule 4: request_appointment rejected when get_available_slots was not called');

    // Rule 6: transfer_to_human may execute independently
    mockStore.resetStore();
    const independentTransfer = executeAgentTool(
      'transfer_to_human',
      {
        reason: 'Customer requested human supervisor',
        urgency: 'normal',
        summary: 'Supervisor call transfer',
      },
      { conversationId: 'seq-conv-6' }
    );
    assert(independentTransfer.success === true, 'Rule 6: transfer_to_human executes independently');
  }

  // TEST 10: Full conversation workflow verification
  {
    console.log('\n--- TEST 10: FULL CONVERSATION FLOW ---\n');
    mockStore.resetStore();
    const flowConvId = 'full-flow-10';

    // Step 1: Check service area
    const a1 = executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: flowConvId });
    assert(a1.success && a1.output?.supported === true, 'Flow Step 1: Service area Plano verified');

    // Step 2: Create lead with customer info
    const a2 = executeAgentTool(
      'create_lead',
      {
        customerName: 'Alex Miller',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
        serviceType: 'AC Repair',
        reportedIssue: 'AC blowing warm air',
        urgency: 'normal',
      },
      { conversationId: flowConvId }
    );
    assert(a2.success && a2.output?.leadId === 'LEAD-0001', 'Flow Step 2: Lead LEAD-0001 created');

    // Step 3: Fetch available slots
    const a3 = executeAgentTool('get_available_slots', {}, { conversationId: flowConvId });
    const a3Slots = (a3.output?.slots as string[]) || [];
    assert(a3.success && a3Slots.length > 0, 'Flow Step 3: Available slots retrieved');

    // Step 4: Request appointment
    const chosenSlot = a3Slots[1]; // 'Monday 2:00 PM'
    const a4 = executeAgentTool(
      'request_appointment',
      {
        leadId: a2.output?.leadId as string,
        preferredSlot: chosenSlot,
        customerName: 'Alex Miller',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
      },
      { conversationId: flowConvId }
    );
    assert(a4.success && a4.output?.status === 'requested', 'Flow Step 4: Appointment APT-0001 requested');

    const sessionState = mockStore.getSession(flowConvId);
    assert(sessionState.serviceAreaSupported === true, 'Final Session State: serviceAreaSupported is true');
    assert(sessionState.leadId === 'LEAD-0001', 'Final Session State: leadId is LEAD-0001');
    assert(sessionState.appointmentId === 'APT-0001', 'Final Session State: appointmentId is APT-0001');
  }

  console.log('\n🎉 ALL 10 TESTS AND SEQUENCING DEPENDENCY RULES PASSED SUCCESSFULLY!\n');
}

runPhase4Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
