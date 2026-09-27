import { NextRequest, NextResponse } from 'next/server';
import {
  getGeminiClient,
  getGeminiModel,
  formatGeminiError,
  classifyGeminiError,
  FALLBACK_GEMINI_MODELS,
} from '@/lib/ai/gemini';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '@/lib/ai/receptionistPrompt';
import {
  validateIntent,
  calculateLeadStatus,
  mergeCustomerInfo,
  sanitizeExtractedString,
  sanitizeCustomerName,
  extractFallbackAddress,
  extractFallbackAppointmentTime,
  normalizeUrgency,
} from '@/lib/ai/extractConversationData';
import {
  ChatApiRequest,
  ChatApiResponse,
  CustomerInfo,
  ExtractedCustomerData,
  LeadStatus,
} from '@/types';

export async function POST(req: NextRequest) {
  try {
    let body: ChatApiRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected valid JSON.' },
        { status: 400 }
      );
    }

    const { messages, currentData } = body;

    // 1. Validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'A non-empty messages array is required.' },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
      return NextResponse.json(
        { error: 'Message cannot be empty or whitespace only.' },
        { status: 400 }
      );
    }

    // 2. Initialize Gemini Client and Candidate Models
    const ai = getGeminiClient();
    const primaryModel = getGeminiModel();
    const candidateModels = [
      primaryModel,
      ...FALLBACK_GEMINI_MODELS.filter((m) => m !== primaryModel),
    ];

    // 3. Format contents for multi-turn Gemini conversation
    // Normalize consecutive messages of the same role to maintain strict alternating conversation turns
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

    // Map to Google GenAI content structure
    const contents = normalizedTurns.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    // 4. Call Gemini API with structured JSON output schema (with exponential backoff and quota failover)
    let response;
    let finalError: unknown;

    modelLoop: for (const candidateModel of candidateModels) {
      const MAX_RETRIES = 1; // 1 retry per model before attempting fallback model
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: candidateModel,
            contents,
            config: {
              systemInstruction: SUMMIT_HVAC_SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'object',
                properties: {
                  reply: {
                    type: 'string',
                    description: 'The natural conversational text response from the receptionist to the customer.',
                  },
                  detectedIntent: {
                    type: 'string',
                    description: 'Detected customer intent category.',
                  },
                  extractedData: {
                    type: 'object',
                    properties: {
                      customerName: { type: 'string' },
                      phone: { type: 'string' },
                      serviceAddress: { type: 'string' },
                      address: { type: 'string' },
                      serviceType: { type: 'string' },
                      reportedIssue: { type: 'string' },
                      urgency: { type: 'string' },
                      preferredAppointmentTime: { type: 'string' },
                      isEmergencySafetyHazard: { type: 'boolean' },
                      hasCustomerRequestedAppointment: { type: 'boolean' },
                    },
                  },
                },
                required: ['reply', 'detectedIntent'],
              },
            },
          });
          break modelLoop; // Succeeded!
        } catch (err: unknown) {
          finalError = err;
          const classification = classifyGeminiError(err);

          // Server-side diagnostic log (sanitized: only status and category, zero credentials)
          console.warn(
            `[Gemini API] Model ${candidateModel} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ` +
            `category=${classification.category}, status=${classification.status}, ` +
            `isTransient=${classification.isTransient}`
          );

          // Do NOT retry permanent errors (e.g., 400, 401, 403, 404, or missing configuration)
          if (!classification.isTransient) {
            console.warn(`[Gemini API] Aborting retry for permanent error (${classification.category}).`);
            throw err;
          }

          // If rate limit / quota is exhausted on this model, switch immediately to next candidate model
          const isQuotaExhausted =
            classification.category === 'TRANSIENT_RATE_LIMIT' ||
            (classification.retryAfterMs && classification.retryAfterMs > 15000);

          if (isQuotaExhausted && candidateModel !== candidateModels[candidateModels.length - 1]) {
            console.warn(
              `[Gemini API] Model ${candidateModel} quota limit reached. Seamlessly switching to fallback model...`
            );
            break; // Try next candidate model
          }

          // If retry remains on this candidate model, wait with backoff
          if (attempt < MAX_RETRIES) {
            const baseDelay = 1000 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 200);
            const delayMs = classification.retryAfterMs ? Math.min(classification.retryAfterMs, 3000) : (baseDelay + jitter);

            console.warn(`[Gemini API] Retrying model ${candidateModel} in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }
      }
    }

    if (!response) {
      throw finalError || new Error('No response received from Gemini.');
    }

    const responseText = response.text?.trim() || '';

    let parsedResult: {
      reply?: string;
      detectedIntent?: string;
      extractedData?: ExtractedCustomerData;
    } = {};

    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      // Graceful fallback if JSON parsing fails
      parsedResult = {
        reply: responseText || "Thank you for calling Summit HVAC. How can I help you today?",
        detectedIntent: 'GENERAL_QUESTION',
        extractedData: {},
      };
    }

    const reply = parsedResult.reply || "Thank you for reaching out to Summit HVAC. How may I assist you?";
    const detectedIntent = validateIntent(parsedResult.detectedIntent);
    const rawData = parsedResult.extractedData || {};

    // Combine all user utterances for deterministic fallback extraction and urgency verification
    const allUserUtterances = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' ');

    // Current accumulated customer info from previous turns
    const currentCustomerInfo: CustomerInfo = {
      name: currentData?.name || '',
      phone: currentData?.phone || '',
      address: currentData?.address || currentData?.serviceAddress || '',
      serviceAddress: currentData?.serviceAddress || currentData?.address || '',
      serviceType: currentData?.serviceType || '',
      problemDescription: currentData?.problemDescription || '',
      urgency: currentData?.urgency || 'normal',
      preferredAppointmentTime: currentData?.preferredAppointmentTime || '',
    };

    // 1. Service Address Extraction: Model output, fallback from utterances, or preserved previous
    let resolvedAddress = sanitizeExtractedString(rawData.serviceAddress || rawData.address);
    if (!resolvedAddress) {
      const fallbackAddr = extractFallbackAddress(allUserUtterances);
      if (fallbackAddr) {
        resolvedAddress = fallbackAddr;
      } else if (currentCustomerInfo.serviceAddress || currentCustomerInfo.address) {
        resolvedAddress = currentCustomerInfo.serviceAddress || currentCustomerInfo.address;
      }
    }

    // 2. Customer Name: Reject ambiguous names like "John/Alex", preserve existing verified name
    let resolvedName = sanitizeCustomerName(rawData.customerName);
    if (!resolvedName && currentCustomerInfo.name) {
      resolvedName = currentCustomerInfo.name;
    }

    // 3. Phone: Extract or preserve
    let resolvedPhone = sanitizeExtractedString(rawData.phone);
    if (!resolvedPhone && currentCustomerInfo.phone) {
      resolvedPhone = currentCustomerInfo.phone;
    }

    // 4. Urgency: Default to normal unless explicit urgent request or safety hazard
    const resolvedUrgency = normalizeUrgency(rawData.urgency, allUserUtterances);

    // 5. Service Type: Infer from intent or preserve
    let resolvedServiceType = sanitizeExtractedString(rawData.serviceType);
    if (!resolvedServiceType && currentCustomerInfo.serviceType) {
      resolvedServiceType = currentCustomerInfo.serviceType;
    } else if (!resolvedServiceType) {
      if (detectedIntent === 'AC_COOLING_FAILURE') resolvedServiceType = 'AC Repair';
      else if (detectedIntent === 'HEATING_FAILURE') resolvedServiceType = 'Heating Repair';
      else if (detectedIntent === 'MAINTENANCE') resolvedServiceType = 'HVAC Maintenance';
      else if (detectedIntent === 'INSTALLATION') resolvedServiceType = 'AC Installation';
      else if (detectedIntent === 'EMERGENCY') resolvedServiceType = 'Emergency Inspection';
    }

    // 6. Reported Issue: Keep distinct, preserve across turns
    let resolvedIssue = sanitizeExtractedString(rawData.reportedIssue);
    if (!resolvedIssue && currentCustomerInfo.problemDescription) {
      resolvedIssue = currentCustomerInfo.problemDescription;
    } else if (!resolvedIssue && detectedIntent === 'AC_COOLING_FAILURE') {
      resolvedIssue = "AC isn't cooling";
    }

    // 7. Preferred Appointment Time: Model output, fallback schedule extractor, or preserved
    let resolvedApptTime = sanitizeExtractedString(rawData.preferredAppointmentTime);
    if (!resolvedApptTime) {
      const fallbackAppt = extractFallbackAppointmentTime(allUserUtterances);
      if (fallbackAppt) {
        resolvedApptTime = fallbackAppt;
      } else if (currentCustomerInfo.preferredAppointmentTime) {
        resolvedApptTime = currentCustomerInfo.preferredAppointmentTime;
      }
    }

    const hasAppointmentSignal =
      Boolean(rawData.hasCustomerRequestedAppointment) ||
      Boolean(resolvedApptTime) ||
      /\b(come|schedule|appointment|book|technician|visit)\b/i.test(allUserUtterances);

    const extractedData: ExtractedCustomerData = {
      customerName: resolvedName || null,
      phone: resolvedPhone || null,
      serviceAddress: resolvedAddress || null,
      address: resolvedAddress || null,
      serviceType: resolvedServiceType || null,
      reportedIssue: resolvedIssue || null,
      urgency: resolvedUrgency,
      preferredAppointmentTime: resolvedApptTime || null,
      isEmergencySafetyHazard: Boolean(rawData.isEmergencySafetyHazard) || resolvedUrgency === 'emergency',
      hasCustomerRequestedAppointment: hasAppointmentSignal,
    };

    const updatedCustomerInfo = mergeCustomerInfo(currentCustomerInfo, extractedData);
    const computedLeadStatus = calculateLeadStatus(
      'new',
      extractedData,
      updatedCustomerInfo
    );

    const apiResponse: ChatApiResponse = {
      message: reply,
      detectedIntent,
      extractedData,
      leadStatus: computedLeadStatus,
    };

    return NextResponse.json(apiResponse, { status: 200 });
  } catch (err: unknown) {
    const { message, status, category } = formatGeminiError(err);
    console.error(`[Gemini API] Error response sent to client: status=${status}, category=${category}`);
    return NextResponse.json({ error: message }, { status });
  }
}
