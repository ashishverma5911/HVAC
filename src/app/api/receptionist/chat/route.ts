import { NextRequest, NextResponse } from 'next/server';
import {
  getGeminiClient,
  getGeminiModel,
  formatGeminiError,
  classifyGeminiError,
  FALLBACK_GEMINI_MODELS,
} from '@/lib/ai/gemini';
import { buildReceptionistSystemInstruction } from '@/lib/ai/receptionistPrompt';
import { buildReceptionistTools } from '@/lib/ai/tools';
import { executeAgentTool } from '@/lib/ai/toolExecutor';
import { resolveTenantContext } from '@/lib/auth/tenant';
import { mockStore, resolveAppointmentSlot } from '@/lib/mock/store';
import {
  validateIntent,
  inferIntent,
  calculateLeadStatus,
  mergeCustomerInfo,
  sanitizeExtractedString,
  sanitizeCustomerName,
  extractFallbackName,
  extractFallbackPhone,
  extractFallbackAddress,
  extractFallbackCity,
  extractFallbackServiceType,
  extractFallbackReportedIssue,
  extractFallbackAppointmentTime,
  normalizeUrgency,
} from '@/lib/ai/extractConversationData';
import {
  ChatApiRequest,
  ChatApiResponse,
  CustomerInfo,
  ExtractedCustomerData,
  LeadStatus,
  AgentAction,
} from '@/types';

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve server-side tenant context
    // SAFEGUARD 1: Authenticated user with missing business returns 403 (does NOT fall back to demo)
    const tenant = await resolveTenantContext();
    if (!tenant.success) {
      return NextResponse.json(
        { error: tenant.error, category: tenant.category },
        { status: tenant.status }
      );
    }

    let body: ChatApiRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected valid JSON.' },
        { status: 400 }
      );
    }

    const { messages, currentData, conversationId: reqConvId, leadId: reqLeadId } = body;

    // 1. Validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'A non-empty messages array is required.' },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (
      !lastMessage ||
      !lastMessage.content ||
      typeof lastMessage.content !== 'string' ||
      !lastMessage.content.trim()
    ) {
      return NextResponse.json(
        { error: 'Message cannot be empty or whitespace only.' },
        { status: 400 }
      );
    }

    const conversationId = reqConvId || 'default-session';
    const session = mockStore.getSession(conversationId);
    if (reqLeadId && !session.leadId) {
      session.leadId = reqLeadId;
    }

    // 2. Extract conversation utterances and run deterministic information extraction
    const allUserUtterances = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');

    console.log(`[Receptionist API] Session: ${conversationId} | Total messages: ${messages.length}`);

    // Robust deterministic extractions
    const candidateName =
      extractFallbackName(allUserUtterances) ||
      sanitizeCustomerName(currentData?.name);

    const candidatePhone =
      extractFallbackPhone(allUserUtterances) ||
      sanitizeExtractedString(currentData?.phone);

    const candidateStreet =
      extractFallbackAddress(allUserUtterances) ||
      (currentData?.serviceAddress && /\d+\s+[A-Za-z]/.test(currentData.serviceAddress)
        ? currentData.serviceAddress
        : null);

    const candidateCity =
      extractFallbackCity(allUserUtterances) ||
      currentData?.city ||
      (currentData as any)?.cityOrArea ||
      null;

    const candidateServiceType =
      extractFallbackServiceType(allUserUtterances) ||
      sanitizeExtractedString(currentData?.serviceType);

    const candidateIssue =
      extractFallbackReportedIssue(allUserUtterances) ||
      sanitizeExtractedString(currentData?.problemDescription);

    const candidateAppt =
      extractFallbackAppointmentTime(allUserUtterances) ||
      sanitizeExtractedString(currentData?.preferredAppointmentTime);

    const candidateUrgency = normalizeUrgency(currentData?.urgency, allUserUtterances);

    const executedActions: AgentAction[] = [];

    // Helper to run action if not already in session/executedActions
    const runServerAction = (toolName: string, args: Record<string, unknown>) => {
      const res = executeAgentTool(toolName, args, {
        conversationId,
        businessConfig: tenant.config,
        businessId: tenant.businessId,
        isDemo: tenant.isDemo,
      });
      const existingIdx = executedActions.findIndex((a) => a.toolName === toolName);
      if (existingIdx >= 0) {
        executedActions[existingIdx] = res.action;
      } else {
        executedActions.push(res.action);
      }
      return res;
    };

    // 3. Application State Rules & Prerequisites Evaluation
    // Check service area if city or street address mentions an area
    const areaToCheck = candidateCity || candidateStreet;
    if (areaToCheck && !session.serviceAreaChecked) {
      runServerAction('check_service_area', { city: areaToCheck });
    }

    // If service area check completed and location is unsupported, trigger transfer_to_human immediately
    if (session.serviceAreaChecked && !session.serviceAreaSupported && !session.transferId) {
      runServerAction('transfer_to_human', {
        reason: `Customer location (${candidateCity || areaToCheck || 'unsupported location'}) is outside ${tenant.config.name} service area`,
        urgency: candidateUrgency,
        summary: `Caller is in unsupported location (${candidateCity || areaToCheck}). Transferred to human dispatch for referral or special dispatch evaluation.`,
      });
    }

    // Create lead if all 5 required customer details exist (requires physical street address!)
    if (
      candidateName &&
      candidatePhone &&
      candidateStreet &&
      candidateServiceType &&
      candidateIssue &&
      !session.leadId
    ) {
      // Ensure service area checked first
      if (!session.serviceAreaChecked) {
        runServerAction('check_service_area', { city: candidateStreet });
      }
      runServerAction('create_lead', {
        customerName: candidateName,
        phone: candidatePhone,
        serviceAddress: candidateStreet,
        serviceType: candidateServiceType,
        reportedIssue: candidateIssue,
        urgency: candidateUrgency,
      });
    }

    // Fetch slots if customer is inquiring about appointment
    const isAppointmentInquiry =
      Boolean(candidateAppt) ||
      /\b(come|schedule|appointment|book|slot|slots|tomorrow|today|available times|when can|visit)\b/i.test(
        lastMessage.content
      );

    if (isAppointmentInquiry && !session.slotsChecked) {
      runServerAction('get_available_slots', {
        serviceType: candidateServiceType || 'AC Repair',
        urgency: candidateUrgency,
        preferredDate: candidateAppt || undefined,
      });
    }

    // Confirm appointment slot if customer confirms or requests a specific available slot
    const matchedSlot = resolveAppointmentSlot(
      lastMessage.content,
      allUserUtterances,
      session.availableSlots.length > 0 ? session.availableSlots : undefined
    );

    if (matchedSlot && session.leadId && session.slotsChecked && !session.appointmentId) {
      const lead = mockStore.getLead(session.leadId);
      if (lead) {
        runServerAction('request_appointment', {
          leadId: lead.id,
          preferredSlot: matchedSlot,
          customerName: lead.customerName,
          phone: lead.phone,
          serviceAddress: lead.serviceAddress,
        });
      }
    }

    // Human transfer request
    const isTransferRequest =
      /\b(speak with a (?:person|human|representative|agent|manager|dispatcher)|talk to a (?:person|human|representative|agent|manager|dispatcher)|transfer me|human please|talk to someone|speak to someone)\b/i.test(
        lastMessage.content
      );

    if (isTransferRequest && !session.transferId) {
      runServerAction('transfer_to_human', {
        reason: 'Customer requested human representative',
        urgency: candidateUrgency,
        summary: `Caller requested human transfer. Prior problem: ${candidateIssue || 'HVAC inquiry'}.`,
      });
    }

    // 4. Multi-turn Gemini Tool Calling Loop
    const ai = getGeminiClient();
    const primaryModel = getGeminiModel();
    const candidateModels = [
      primaryModel,
      ...FALLBACK_GEMINI_MODELS.filter((m) => m !== primaryModel),
    ];

    // Normalize messages for strict alternating turns
    const normalizedTurns: { role: 'user' | 'model'; content: string }[] = [];
    for (const m of messages) {
      const role: 'user' | 'model' = m.role === 'model' ? 'model' : 'user';
      const text = m.content?.trim();
      if (!text) continue;

      const last = normalizedTurns[normalizedTurns.length - 1];
      if (last && last.role === role) {
        last.content += `\n${text}`;
      } else {
        normalizedTurns.push({ role, content: text });
      }
    }

    let currentContents: Array<{ role: 'user' | 'model' | 'tool'; parts: any[] }> =
      normalizedTurns.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

    let finalReply = '';
    let finalError: unknown;

    modelLoop: for (const candidateModel of candidateModels) {
      const MAX_RETRIES = 1;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          let loopCount = 0;
          const MAX_TOOL_LOOPS = 4;

          toolLoop: while (loopCount < MAX_TOOL_LOOPS) {
            loopCount++;
            const genResponse: any = await ai.models.generateContent({
              model: candidateModel,
              contents: currentContents,
              config: {
                systemInstruction: buildReceptionistSystemInstruction(tenant.config),
                tools: [{ functionDeclarations: buildReceptionistTools(tenant.config) }],
              },
            });

            const functionCalls = genResponse.functionCalls || [];

            if (functionCalls.length > 0) {
              const toolResponseParts: any[] = [];

              for (const fc of functionCalls) {
                const toolName = fc.name || '';

                if (toolName === 'transfer_to_human' && session.transferId) {
                  toolResponseParts.push({
                    functionResponse: {
                      name: toolName,
                      response: {
                        output: {
                          status: 'already_transferred',
                          transferId: session.transferId,
                          message:
                            'This conversation has already been transferred to human dispatch. Please assure the caller that they are already being connected to a human representative.',
                        },
                      },
                      id: fc.id,
                    },
                  });
                  continue;
                }

                const execResult = runServerAction(
                  toolName,
                  (fc.args || {}) as Record<string, unknown>
                );

                toolResponseParts.push({
                  functionResponse: {
                    name: toolName,
                    response: execResult.success
                      ? { output: execResult.output }
                      : { error: execResult.error },
                    id: fc.id,
                  },
                });
              }

              const candidateParts = genResponse.candidates?.[0]?.content?.parts || [];
              currentContents = [
                ...currentContents,
                {
                  role: 'model' as const,
                  parts:
                    candidateParts.length > 0
                      ? candidateParts
                      : functionCalls.map((fc: any) => ({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                        })),
                },
                {
                  role: 'tool' as const,
                  parts: toolResponseParts,
                },
              ];

              continue toolLoop;
            }

            // Model produced natural text response
            finalReply = genResponse.text?.trim() || '';
            break toolLoop;
          }

          break modelLoop; // Succeeded!
        } catch (err: unknown) {
          finalError = err;
          const classification = classifyGeminiError(err);

          console.warn(
            `[Gemini API] Model ${candidateModel} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ` +
              `category=${classification.category}, status=${classification.status}, ` +
              `isTransient=${classification.isTransient}`
          );

          if (!classification.isTransient) {
            console.warn(`[Gemini API] Aborting retry for permanent error (${classification.category}).`);
            throw err;
          }

          const isQuotaExhausted =
            classification.category === 'TRANSIENT_RATE_LIMIT' ||
            (classification.retryAfterMs && classification.retryAfterMs > 15000);

          if (isQuotaExhausted && candidateModel !== candidateModels[candidateModels.length - 1]) {
            console.warn(
              `[Gemini API] Model ${candidateModel} quota limit reached. Switching to fallback model...`
            );
            break;
          }

          if (attempt < MAX_RETRIES) {
            const baseDelay = 1000 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 200);
            const delayMs = classification.retryAfterMs
              ? Math.min(classification.retryAfterMs, 3000)
              : baseDelay + jitter;

            console.warn(`[Gemini API] Retrying model ${candidateModel} in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }
      }
    }

    // 5. Intelligent Fallback Response Construction & Safeguards
    // Scrub any invented dollar amounts or fee claims from finalReply
    if (/\$\s*\d+|\b\d+\s*dollars\b/i.test(finalReply)) {
      console.warn('[Receptionist API] Scrubbing invented price or fee claim from finalReply');
      finalReply = finalReply.replace(
        /\b(?:Our|The)?\s*(?:standard\s+)?(?:diagnostic|inspection)?\s*(?:fee|cost|price|charge)\s*(?:is|of)?\s*\$\d+[^.]*\./gi,
        'Specific pricing information is not available over the phone. Our certified technician will provide an upfront diagnostic and repair estimate in person before any work begins.'
      );
      finalReply = finalReply.replace(/\$\s*\d+(?:\.\d{2})?/g, '[pricing upon on-site inspection]');
    }

    const isRepeatedGreeting =
      messages.length > 1 &&
      /^(?:Hi|Hello|Thank you for reaching out to Summit HVAC|Thanks for contacting)/i.test(finalReply);

    if (session.transferId && (isTransferRequest || !finalReply || isRepeatedGreeting)) {
      finalReply =
        'Your conversation has already been routed to our human dispatch team. A team member is actively being connected to assist you. Please hold on for just a moment.';
    } else if (!finalReply || isRepeatedGreeting) {
      if (session.appointmentId) {
        const apt = mockStore.getAppointment(session.appointmentId);
        finalReply = `I have submitted your appointment request for ${apt?.slot || 'your selected window'}. Our dispatch team will review the schedule and contact you shortly to confirm the appointment.`;
      } else if (session.slotsChecked) {
        finalReply = `We have technician appointment windows available on Monday at 10:00 AM, 2:00 PM, and 4:00 PM; Tuesday at 9:00 AM, 1:00 PM, and 3:00 PM; or Wednesday at 11:00 AM and 2:00 PM. Would any of those times work best for you?`;
      } else if (session.leadId) {
        const lead = mockStore.getLead(session.leadId);
        finalReply = `Thank you, ${lead?.customerName || 'Alex'}. I have recorded your service request for your ${lead?.serviceType || 'AC'} at ${lead?.serviceAddress || 'your address'}. Would you like to check our available times to schedule a technician?`;
      } else if (messages.length > 2) {
        finalReply =
          'I have recorded your details. How else can I assist you with your heating or cooling system today?';
      } else {
        finalReply =
          'Thank you for reaching out to Summit HVAC. How can I assist you with your heating or cooling system today?';
      }
    }

    // 6. Extracted Data Assembly
    const executedToolNames = executedActions.map((a) => a.toolName);

    const extractedData: ExtractedCustomerData = {
      customerName: candidateName || null,
      phone: candidatePhone || null,
      serviceAddress: candidateStreet || null,
      address: candidateStreet || null,
      city: candidateCity || null,
      cityOrArea: candidateCity || null,
      serviceType: candidateServiceType || null,
      reportedIssue: candidateIssue || null,
      urgency: candidateUrgency,
      preferredAppointmentTime:
        candidateAppt ||
        (session.appointmentId ? mockStore.getAppointment(session.appointmentId)?.slot : null) ||
        null,
      isEmergencySafetyHazard:
        candidateUrgency === 'emergency' || Boolean(session.transferId),
      hasCustomerRequestedAppointment:
        Boolean(session.slotsChecked) ||
        Boolean(session.appointmentId) ||
        Boolean(candidateAppt),
    };

    // Determine intent
    const detectedIntent = inferIntent(null, allUserUtterances, executedToolNames);

    // Determine leadStatus according to verified application state:
    // Escalation/transfer takes top priority over scheduled requests
    let computedLeadStatus: LeadStatus;
    if (session.transferId) {
      computedLeadStatus = 'transferred';
    } else if (session.appointmentId) {
      computedLeadStatus = 'appointment_requested';
    } else if (session.leadId) {
      computedLeadStatus = 'qualified';
    } else {
      const currentCustomerInfo: CustomerInfo = {
        name: currentData?.name || '',
        phone: currentData?.phone || '',
        address: currentData?.serviceAddress || currentData?.address || '',
        serviceAddress: currentData?.serviceAddress || '',
        city: currentData?.city || (currentData as any)?.cityOrArea || '',
        cityOrArea: currentData?.city || (currentData as any)?.cityOrArea || '',
        serviceType: currentData?.serviceType || '',
        problemDescription: currentData?.problemDescription || '',
        urgency: currentData?.urgency || 'normal',
        preferredAppointmentTime: currentData?.preferredAppointmentTime || '',
      };
      const updatedCustomerInfo = mergeCustomerInfo(currentCustomerInfo, extractedData);
      computedLeadStatus = calculateLeadStatus('new', extractedData, updatedCustomerInfo);
    }

    console.log('[Receptionist API] State Summary:', {
      leadId: session.leadId,
      appointmentId: session.appointmentId,
      slotsChecked: session.slotsChecked,
      actionsCount: executedActions.length,
      leadStatus: computedLeadStatus,
      detectedIntent,
    });

    const apiResponse: ChatApiResponse = {
      message: finalReply,
      detectedIntent,
      extractedData,
      leadStatus: computedLeadStatus,
      leadId: session.leadId || undefined,
      appointmentId: session.appointmentId || undefined,
      executedActions,
    };

    return NextResponse.json(apiResponse, { status: 200 });
  } catch (err: unknown) {
    const { message, status, category } = formatGeminiError(err);
    console.error(
      `[Gemini API] Error response sent to client: status=${status}, category=${category}`
    );
    return NextResponse.json({ error: message }, { status });
  }
}
