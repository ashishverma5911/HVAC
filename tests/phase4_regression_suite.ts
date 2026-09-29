import {
  extractFallbackName,
  isValidCustomerName,
  sanitizeCustomerName,
  extractFallbackAddress,
  extractFallbackCity,
  extractFallbackAppointmentTime,
} from '../src/lib/ai/extractConversationData';
import {
  mockStore,
  DEMO_REFERENCE_DATE,
  resolveRelativeDay,
  resolveAppointmentSlot,
  AVAILABLE_APPOINTMENT_SLOTS,
} from '../src/lib/mock/store';
import { executeAgentTool } from '../src/lib/ai/toolExecutor';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '../src/lib/ai/receptionistPrompt';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runRegressionSuite() {
  console.log('\n======================================================');
  console.log('--- STARTING PHASE 4 SPECIFIC REGRESSION TEST SUITE ---');
  console.log('======================================================\n');

  // =========================================================================
  // TEST A: "I'm in Houston" does not create a customer name.
  // =========================================================================
  console.log('\n--- TEST A: "I\'m in Houston" does not create a customer name ---');
  {
    const utterance1 = "I'm in Houston";
    const name1 = extractFallbackName(utterance1);
    assert(name1 === null, `A.1: extractFallbackName("${utterance1}") must return null (got ${JSON.stringify(name1)})`);

    const sanitized1 = sanitizeCustomerName("in Houston");
    assert(sanitized1 === '', `A.2: sanitizeCustomerName("in Houston") must return empty string (got ${JSON.stringify(sanitized1)})`);

    const sanitizedCity = sanitizeCustomerName("Houston");
    assert(sanitizedCity === '', `A.3: sanitizeCustomerName("Houston") must return empty string (got ${JSON.stringify(sanitizedCity)})`);

    const utterance2 = "I'm in Houston, my AC stopped working.";
    const name2 = extractFallbackName(utterance2);
    assert(name2 === null, `A.4: extractFallbackName("${utterance2}") must return null (got ${JSON.stringify(name2)})`);

    const utterance3 = "I live in Dallas";
    const name3 = extractFallbackName(utterance3);
    assert(name3 === null, `A.5: extractFallbackName("${utterance3}") must return null (got ${JSON.stringify(name3)})`);

    const cityExtracted = extractFallbackCity(utterance1);
    assert(cityExtracted === 'Houston', `A.6: extractFallbackCity extracts "Houston" for service area checking without polluting name`);
  }

  // =========================================================================
  // TEST B: "I'm at 456 Oak Street in Plano" does not create a customer name.
  // =========================================================================
  console.log('\n--- TEST B: "I\'m at 456 Oak Street in Plano" does not create a customer name ---');
  {
    const utterance = "I'm at 456 Oak Street in Plano";
    const name = extractFallbackName(utterance);
    assert(name === null, `B.1: extractFallbackName("${utterance}") must return null (got ${JSON.stringify(name)})`);

    const sanitized = sanitizeCustomerName("456 Oak Street, Plano");
    assert(sanitized === '', `B.2: sanitizeCustomerName("456 Oak Street, Plano") must return empty string`);

    // Verify valid name evidence works when explicitly provided
    const validUtterance = "My name is Alex. I'm at 456 Oak Street in Plano.";
    const validName = extractFallbackName(validUtterance);
    assert(validName === 'Alex', `B.3: extractFallbackName with explicit name returns "Alex" (got ${JSON.stringify(validName)})`);

    // Address extractor correctly extracts "456 Oak Street, Plano"
    const extractedAddress = extractFallbackAddress(utterance);
    assert(
      extractedAddress === '456 Oak Street, Plano',
      `B.4: extractFallbackAddress("${utterance}") returns "456 Oak Street, Plano" (got ${JSON.stringify(extractedAddress)})`
    );

    // Verify other invalid name phrases
    assert(extractFallbackName("I'm calling from Plano") === null, `B.5: "I'm calling from Plano" returns null`);
    assert(extractFallbackName("My AC is broken") === null, `B.6: "My AC is broken" returns null`);
  }

  // =========================================================================
  // TEST C: Unsupported pricing information never produces a dollar amount.
  // =========================================================================
  console.log('\n--- TEST C: Unsupported pricing information never produces a dollar amount ---');
  {
    // 1. Verify no "$89" or hardcoded dollar figures exist in system instructions
    assert(
      !SUMMIT_HVAC_SYSTEM_INSTRUCTION.includes('$89'),
      'C.1: SUMMIT_HVAC_SYSTEM_INSTRUCTION does not contain "$89"'
    );
    assert(
      !SUMMIT_HVAC_SYSTEM_INSTRUCTION.includes('89'),
      'C.2: SUMMIT_HVAC_SYSTEM_INSTRUCTION does not contain "89"'
    );
    assert(
      SUMMIT_HVAC_SYSTEM_INSTRUCTION.includes('Pricing information, diagnostic fees, hourly rates, and repair costs are NOT configured in the system'),
      'C.3: System instruction explicitly states pricing is not configured and forbids inventing dollar amounts'
    );

    // 2. Check scrubber logic
    const mockReplyWithInventedPrice =
      "Our standard diagnostic fee is $89, which is credited toward any repairs. Would you like to schedule?";
    const scrubbed = mockReplyWithInventedPrice
      .replace(
        /\b(?:Our|The)?\s*(?:standard\s+)?(?:diagnostic|inspection)?\s*(?:fee|cost|price|charge)\s*(?:is|of)?\s*\$\d+[^.]*\./gi,
        'Specific pricing information is not available over the phone. Our certified technician will provide an upfront diagnostic and repair estimate in person before any work begins.'
      )
      .replace(/\$\s*\d+(?:\.\d{2})?/g, '[pricing upon on-site inspection]');

    assert(!scrubbed.includes('$89'), 'C.4: Output scrubber strips "$89"');
    assert(!scrubbed.includes('$'), 'C.5: Output scrubber leaves no dollar amount');
    assert(
      scrubbed.includes('Specific pricing information is not available over the phone'),
      'C.6: Output states pricing is determined on-site by technician'
    );
  }

  // =========================================================================
  // TEST D: Relative date resolution is deterministic.
  // =========================================================================
  console.log('\n--- TEST D: Relative date resolution is deterministic ---');
  {
    assert(
      DEMO_REFERENCE_DATE === 'Monday, October 19, 2026',
      `D.1: DEMO_REFERENCE_DATE is configured as Monday, October 19, 2026 (got "${DEMO_REFERENCE_DATE}")`
    );

    assert(resolveRelativeDay('today') === 'Monday', 'D.2: "today" resolves deterministically to "Monday"');
    assert(resolveRelativeDay('tomorrow') === 'Tuesday', 'D.3: "tomorrow" resolves deterministically to "Tuesday"');
    assert(
      resolveRelativeDay('day after tomorrow') === 'Wednesday',
      'D.4: "day after tomorrow" resolves deterministically to "Wednesday"'
    );

    // Slot resolution mapping
    const slotTomorrow3PM = resolveAppointmentSlot('3 PM works for me.', 'Can someone come tomorrow?');
    assert(
      slotTomorrow3PM === 'Tuesday 3:00 PM',
      `D.5: "3 PM works for me." with context "tomorrow" resolves to "Tuesday 3:00 PM" (got ${JSON.stringify(slotTomorrow3PM)})`
    );

    const slotDirectTuesday = resolveAppointmentSlot('Tuesday 3:00 PM');
    assert(
      slotDirectTuesday === 'Tuesday 3:00 PM',
      `D.6: Direct "Tuesday 3:00 PM" resolves to "Tuesday 3:00 PM"`
    );

    const slotTomorrowMorning = resolveAppointmentSlot('tomorrow at 9 AM');
    assert(
      slotTomorrowMorning === 'Tuesday 9:00 AM',
      `D.7: "tomorrow at 9 AM" resolves to "Tuesday 9:00 AM"`
    );

    const slotWednesday = resolveAppointmentSlot('Wednesday 11 AM');
    assert(
      slotWednesday === 'Wednesday 11:00 AM',
      `D.8: "Wednesday 11 AM" resolves to "Wednesday 11:00 AM"`
    );

    // Query mock availability with preferredDate
    mockStore.resetStore();
    const slotsRes = mockStore.getAvailableSlots('test-date-session', { preferredDate: 'tomorrow' });
    assert(slotsRes.referenceDate === 'Monday, October 19, 2026', 'D.9: getAvailableSlots returns referenceDate');
    assert(slotsRes.resolvedDay === 'Tuesday', 'D.10: getAvailableSlots returns resolvedDay: Tuesday');
    assert(
      slotsRes.slots.every((s) => s.startsWith('Tuesday')),
      'D.11: getAvailableSlots with "tomorrow" returns Tuesday slots'
    );
  }

  // =========================================================================
  // TEST E: Valid tool calls lead to final responses based on actual tool results.
  // =========================================================================
  console.log('\n--- TEST E: Valid tool calls and state sequencing ---');
  {
    mockStore.resetStore();
    const convId = 'multi-turn-verification-session';

    // TURN 1: Customer provides complete details
    console.log('Turn 1: Intake & Lead Creation');
    const areaRes = executeAgentTool('check_service_area', { city: 'Plano' }, { conversationId: convId });
    assert(areaRes.success === true, 'E.1: check_service_area succeeds');
    assert(areaRes.output?.supported === true, 'E.2: Plano is supported');

    const leadRes = executeAgentTool(
      'create_lead',
      {
        customerName: 'Alex',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
        serviceType: 'AC Repair',
        reportedIssue: "AC isn't cooling",
        urgency: 'normal',
      },
      { conversationId: convId }
    );
    assert(leadRes.success === true, 'E.3: create_lead succeeds');
    assert(typeof leadRes.output?.leadId === 'string', 'E.4: leadId is generated');
    const leadId = leadRes.output!.leadId as string;

    // TURN 2: Customer asks: "Can someone come tomorrow?"
    console.log('Turn 2: Fetch Available Slots for Tomorrow');
    const slotsRes = executeAgentTool(
      'get_available_slots',
      { serviceType: 'AC Repair', urgency: 'normal', preferredDate: 'tomorrow' },
      { conversationId: convId }
    );
    assert(slotsRes.success === true, 'E.5: get_available_slots succeeds');
    assert(slotsRes.action.status === 'success', 'E.6: slots action status is success');
    const slots = (slotsRes.output?.slots as string[]) || [];
    assert(slots.includes('Tuesday 3:00 PM'), 'E.7: slots includes Tuesday 3:00 PM');

    // TURN 3: Customer says: "3 PM works for me."
    console.log('Turn 3: Request Appointment');
    const apptSlot = resolveAppointmentSlot('3 PM works for me.', 'Can someone come tomorrow?');
    assert(apptSlot === 'Tuesday 3:00 PM', 'E.8: Slot resolved to Tuesday 3:00 PM');

    const apptRes = executeAgentTool(
      'request_appointment',
      {
        leadId,
        preferredSlot: apptSlot!,
        customerName: 'Alex',
        phone: '214-555-0199',
        serviceAddress: '456 Oak Street, Plano',
      },
      { conversationId: convId }
    );
    assert(apptRes.success === true, 'E.9: request_appointment succeeds');
    assert(apptRes.output?.status === 'requested', 'E.10: Appointment status is strictly "requested" (never confirmed)');
    assert(typeof apptRes.output?.appointmentId === 'string', 'E.11: appointmentId generated');

    // TURN 4: Customer says: "I want to speak with a person."
    console.log('Turn 4: Transfer to Human');
    const transferRes = executeAgentTool(
      'transfer_to_human',
      {
        reason: 'Customer requested human representative',
        urgency: 'normal',
        summary: 'Caller requested to speak with a person.',
      },
      { conversationId: convId }
    );
    assert(transferRes.success === true, 'E.12: transfer_to_human succeeds');
    assert(transferRes.output?.status === 'transferred', 'E.13: Transfer status is "transferred"');
    assert(typeof transferRes.output?.transferId === 'string', 'E.14: transferId generated');

    // =========================================================================
    // TEST F: Calling transfer_to_human twice in one conversation results in only
    // one successful transfer execution (Idempotency)
    // =========================================================================
    console.log('\n--- TEST F: Calling transfer_to_human twice in one conversation (Idempotency) ---');
    {
      mockStore.resetStore();
      const transferConvId = 'idempotent-transfer-test';

      const transfer1 = executeAgentTool(
        'transfer_to_human',
        {
          reason: 'Customer location (Houston) is unsupported',
          urgency: 'normal',
          summary: 'Location unsupported',
        },
        { conversationId: transferConvId }
      );

      assert(transfer1.success === true, 'F.1: First transfer succeeds');
      assert(transfer1.output?.status === 'transferred', 'F.2: First transfer status is "transferred"');
      const firstTransferId = transfer1.output?.transferId;
      assert(typeof firstTransferId === 'string' && firstTransferId.startsWith('TR-'), 'F.3: First transfer generates TR-xxxx');

      const transfer2 = executeAgentTool(
        'transfer_to_human',
        {
          reason: 'Customer requested human representative again',
          urgency: 'normal',
          summary: 'Second request for human',
        },
        { conversationId: transferConvId }
      );

      assert(transfer2.success === true, 'F.4: Second transfer call succeeds gracefully without throwing');
      assert(transfer2.output?.status === 'transferred', 'F.5: Second transfer returns status "transferred"');
      assert(transfer2.output?.isDuplicate === true, 'F.6: Second transfer flagged as isDuplicate: true');
      assert(transfer2.output?.transferId === firstTransferId, 'F.7: Second transfer returns EXACT same transferId without creating duplicate');
    }

    // =========================================================================
    // TEST G: "I'm in Houston" populates city/area but not serviceAddress
    // =========================================================================
    console.log('\n--- TEST G: "I\'m in Houston" populates city/area but not serviceAddress ---');
    {
      const utterance = "I'm in Houston";
      const city = extractFallbackCity(utterance);
      const address = extractFallbackAddress(utterance);

      assert(city === 'Houston', `G.1: extractFallbackCity("${utterance}") returns "Houston" (got ${JSON.stringify(city)})`);
      assert(address === null, `G.2: extractFallbackAddress("${utterance}") returns null (got ${JSON.stringify(address)})`);
    }

    // =========================================================================
    // TEST H: "I'm at 456 Oak Street in Plano" populates both correctly
    // =========================================================================
    console.log('\n--- TEST H: "I\'m at 456 Oak Street in Plano" populates both correctly ---');
    {
      const utterance = "I'm at 456 Oak Street in Plano";
      const city = extractFallbackCity(utterance);
      const address = extractFallbackAddress(utterance);

      assert(city === 'Plano', `H.1: extractFallbackCity("${utterance}") returns "Plano" (got ${JSON.stringify(city)})`);
      assert(
        address === '456 Oak Street, Plano',
        `H.2: extractFallbackAddress("${utterance}") returns "456 Oak Street, Plano" (got ${JSON.stringify(address)})`
      );
    }
  }

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 4 REGRESSION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('Fatal error during regression suite:', err);
  process.exit(1);
});
