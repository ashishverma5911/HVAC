import { ContractorBusinessConfig } from '../ai/contractorConfig';
import { normalizeUsPhoneDigits } from './tenantPhoneMapping';

/**
 * Escapes special characters for safe inclusion in TwiML XML attributes and text nodes.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

export interface InboundStreamTwimlParams {
  wsUrl: string;
  callerPhone: string;
  calledPhone: string;
  callSid: string;
  businessId: string;
  correlationToken: string;
  forwardedFrom?: string;
  businessConfig?: ContractorBusinessConfig;
}

/**
 * Builds the TwiML `<Connect><Stream>` response for a verified contractor inbound call,
 * including a post-`<Connect>` fallback `<Say>` so that if the Media Stream WebSocket
 * disconnects unexpectedly or cannot initialize, the caller hears an honest fallback message.
 */
export function buildInboundStreamTwiml(params: InboundStreamTwimlParams): string {
  const businessName = params.businessConfig?.name || 'our office';
  const postStreamFallbackText = `Thank you for calling ${businessName}. If your request was not completed, our dispatch team has your caller information and will follow up shortly. Goodbye.`;

  const forwardedParam = params.forwardedFrom
    ? `\n      <Parameter name="forwardedFrom" value="${escapeXml(params.forwardedFrom)}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(params.wsUrl)}">
      <Parameter name="callerPhone" value="${escapeXml(params.callerPhone)}" />
      <Parameter name="calledPhone" value="${escapeXml(params.calledPhone)}" />
      <Parameter name="callSid" value="${escapeXml(params.callSid)}" />
      <Parameter name="businessId" value="${escapeXml(params.businessId)}" />
      <Parameter name="correlationToken" value="${escapeXml(params.correlationToken)}" />${forwardedParam}
    </Stream>
  </Connect>
  <Say voice="Polly.Joanna">${escapeXml(postStreamFallbackText)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Builds a safe TwiML rejection response when an inbound call arrives for an unknown
 * or unassigned destination phone number. Never connects an unauthorized AI session.
 */
export function buildUnknownDestinationTwiml(calledPhone?: string): string {
  const numberLabel = calledPhone && calledPhone.trim() ? 'this destination number' : 'this number';
  const message = `Thank you for calling. Unfortunately, ${numberLabel} is not currently assigned to an active contractor on AERIS. Please check the number you dialed and try again. Goodbye.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Builds a safe fallback TwiML response when the AI receptionist session cannot start
 * or the telephony bridge is unavailable.
 * Never pretends a transfer occurred if it failed.
 */
export function buildCallFailureFallbackTwiml(
  businessConfig?: ContractorBusinessConfig | null,
  options?: {
    calledPhone?: string;
    enableDirectFallbackDial?: boolean;
    failureReason?: string;
  }
): string {
  const businessName = businessConfig?.name || 'our service team';
  const transferPhone = businessConfig?.transferPhoneNumber || businessConfig?.phone || '';
  const transferDigits = normalizeUsPhoneDigits(transferPhone);
  const calledDigits = normalizeUsPhoneDigits(options?.calledPhone);

  // Only attempt a fallback <Dial> if explicitly enabled AND the target number is valid
  // AND distinct from the inbound destination number (preventing infinite forwarding loops).
  if (
    options?.enableDirectFallbackDial &&
    transferDigits.length === 10 &&
    transferDigits !== calledDigits
  ) {
    const dialNotice = `Thank you for calling ${businessName}. Our automated receptionist is temporarily unavailable. Please hold while we attempt to connect you to our office line.`;
    const postDialFallback = `We were unable to reach the office line directly. Please call back shortly or reach out to ${businessName}. Goodbye.`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(dialNotice)}</Say>
  <Dial timeout="20">+1${escapeXml(transferDigits)}</Dial>
  <Say voice="Polly.Joanna">${escapeXml(postDialFallback)}</Say>
  <Hangup/>
</Response>`;
  }

  const fallbackMessage = `Thank you for calling ${businessName}. Our automated receptionist is temporarily unavailable, and we could not connect your call at this moment. We have logged your missed call and a team member will follow up with you as soon as possible. Goodbye.`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(fallbackMessage)}</Say>
  <Hangup/>
</Response>`;
}
