import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient, getGeminiModel, formatGeminiError } from '@/lib/ai/gemini';
import { SUMMIT_HVAC_SYSTEM_INSTRUCTION } from '@/lib/ai/receptionistPrompt';
import {
  validateIntent,
  calculateLeadStatus,
  mergeCustomerInfo,
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

    // 2. Initialize Gemini Client
    const ai = getGeminiClient();
    const model = getGeminiModel();

    // 3. Format contents for multi-turn Gemini conversation
    // Map messages: 'user' -> 'user', 'model' -> 'model'
    const contents = messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content.trim() }],
    }));

    // 4. Call Gemini API with structured JSON output schema
    const response = await ai.models.generateContent({
      model,
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
    const extractedData: ExtractedCustomerData = parsedResult.extractedData || {};

    // 5. Compute lead status and merged customer information
    const currentCustomerInfo: CustomerInfo = {
      name: currentData?.name || '',
      phone: currentData?.phone || '',
      address: currentData?.address || '',
      serviceType: currentData?.serviceType || '',
      problemDescription: currentData?.problemDescription || '',
      urgency: currentData?.urgency || 'normal',
      preferredAppointmentTime: currentData?.preferredAppointmentTime || '',
    };

    const updatedCustomerInfo = mergeCustomerInfo(currentCustomerInfo, extractedData);
    const initialLeadStatus: LeadStatus = 'new';
    const computedLeadStatus = calculateLeadStatus(
      initialLeadStatus,
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
    const { message, status } = formatGeminiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
