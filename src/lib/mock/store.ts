import { UrgencyLevel } from '@/types';

export const SUPPORTED_SERVICE_AREAS = [
  'Dallas',
  'Plano',
  'Irving',
  'Garland',
  'Richardson',
  'Carrollton',
] as const;

export const DEMO_REFERENCE_DATE = 'Monday, October 19, 2026';
export const DEMO_REFERENCE_DAY = 'Monday';

export const AVAILABLE_APPOINTMENT_SLOTS = [
  'Monday 10:00 AM',
  'Monday 2:00 PM',
  'Monday 4:00 PM',
  'Tuesday 9:00 AM',
  'Tuesday 1:00 PM',
  'Tuesday 3:00 PM',
  'Wednesday 11:00 AM',
  'Wednesday 2:00 PM',
] as const;

/**
 * Resolves relative date references (e.g. "today", "tomorrow", "day after tomorrow")
 * deterministically against DEMO_REFERENCE_DATE ('Monday, October 19, 2026').
 */
export function resolveRelativeDay(text?: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  if (lower.includes('day after tomorrow')) return 'Wednesday';
  if (lower.includes('tomorrow')) return 'Tuesday';
  if (lower.includes('today')) return 'Monday';
  if (lower.includes('monday')) return 'Monday';
  if (lower.includes('tuesday')) return 'Tuesday';
  if (lower.includes('wednesday')) return 'Wednesday';
  return null;
}

/**
 * Resolves a customer's requested slot utterance against available slots.
 * Maps:
 * - "3 PM works for me" -> "Tuesday 3:00 PM"
 * - "tomorrow at 9 AM" -> "Tuesday 9:00 AM"
 * - "Monday 10 AM" -> "Monday 10:00 AM"
 */
export function resolveAppointmentSlot(
  utterance: string,
  contextHistory: string = '',
  availableSlots: readonly string[] = AVAILABLE_APPOINTMENT_SLOTS
): string | null {
  if (!utterance || typeof utterance !== 'string') return null;
  const lowerUtterance = utterance.toLowerCase();

  // 1. Direct exact or substring match with an available slot
  for (const slot of availableSlots) {
    if (lowerUtterance.includes(slot.toLowerCase())) {
      return slot;
    }
  }

  // 2. Extract time portion from utterance: e.g. "3 PM", "3:00 PM", "3pm", "10 AM", "10am", "9:00 AM"
  const timeMatch = lowerUtterance.match(/\b([1-9]|1[0-2])(?::([0-5][0-9]))?\s*(am|pm)\b/i);
  if (!timeMatch) return null;

  const hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const ampm = timeMatch[3].toUpperCase();
  const normalizedTimeStr = `${minute > 0 ? `${hour}:${String(minute).padStart(2, '0')}` : `${hour}:00`} ${ampm}`;

  // Find candidate slots matching this time string
  const matchingSlots = availableSlots.filter((slot) => slot.endsWith(normalizedTimeStr));
  if (matchingSlots.length === 1) {
    return matchingSlots[0];
  }

  if (matchingSlots.length > 1) {
    // Check if utterance or context specifies a day (e.g. "tomorrow", "today", "Tuesday", "Wednesday")
    const dayFromUtterance = resolveRelativeDay(utterance);
    const dayFromContext = dayFromUtterance || resolveRelativeDay(contextHistory);
    if (dayFromContext) {
      const matchWithDay = matchingSlots.find((slot) =>
        slot.toLowerCase().startsWith(dayFromContext.toLowerCase())
      );
      if (matchWithDay) return matchWithDay;
    }
    // Default to the first matching slot if ambiguous
    return matchingSlots[0];
  }

  return null;
}

export interface LeadRecord {
  id: string;
  conversationId: string;
  customerName: string;
  phone: string;
  serviceAddress: string;
  serviceType: string;
  reportedIssue: string;
  urgency: UrgencyLevel;
  createdAt: string;
}

export interface AppointmentRecord {
  id: string;
  conversationId: string;
  leadId: string;
  slot: string;
  customerName: string;
  phone: string;
  serviceAddress: string;
  status: 'requested'; // Strictly 'requested', never 'confirmed'
  createdAt: string;
}

export interface TransferRecord {
  id: string;
  conversationId: string;
  reason: string;
  urgency: UrgencyLevel;
  summary: string;
  status: 'transferred';
  createdAt: string;
}

export interface ConversationSessionState {
  conversationId: string;
  serviceAreaChecked: boolean;
  serviceAreaSupported: boolean;
  matchedArea: string | null;
  slotsChecked: boolean;
  availableSlots: string[];
  leadId: string | null;
  appointmentId: string | null;
  transferId: string | null;
}

class MockReceptionistStore {
  private leads: Map<string, LeadRecord> = new Map();
  private appointments: Map<string, AppointmentRecord> = new Map();
  private transfers: Map<string, TransferRecord> = new Map();
  private sessions: Map<string, ConversationSessionState> = new Map();

  private leadCounter = 1;
  private appointmentCounter = 1;
  private transferCounter = 1;

  public getSession(conversationId: string): ConversationSessionState {
    if (!this.sessions.has(conversationId)) {
      this.sessions.set(conversationId, {
        conversationId,
        serviceAreaChecked: false,
        serviceAreaSupported: false,
        matchedArea: null,
        slotsChecked: false,
        availableSlots: [],
        leadId: null,
        appointmentId: null,
        transferId: null,
      });
    }
    return this.sessions.get(conversationId)!;
  }

  public checkBusinessHours(day?: string) {
    return {
      regularHours: 'Monday-Friday: 8:00 AM - 6:00 PM',
      saturday: 'By appointment only',
      sunday: 'Emergency service only',
      emergencyService:
        '24/7 emergency dispatch available for gas hazards, severe leaks, or active heating/cooling failure during extreme weather.',
      requestedDay: day || 'General schedule',
    };
  }

  public checkServiceArea(conversationId: string, city?: string, zip?: string) {
    const session = this.getSession(conversationId);
    session.serviceAreaChecked = true;

    const query = (city || zip || '').trim().toLowerCase();
    const matched = SUPPORTED_SERVICE_AREAS.find((area) =>
      query.includes(area.toLowerCase())
    );

    if (matched) {
      session.serviceAreaSupported = true;
      session.matchedArea = matched;
      return {
        supported: true,
        matchedArea: matched,
        message: `${matched} is within Summit HVAC's primary service area. Standard dispatch and emergency response are available.`,
      };
    }

    session.serviceAreaSupported = false;
    session.matchedArea = null;
    return {
      supported: false,
      matchedArea: null,
      message: `The requested location "${city || zip || 'unknown'}" is outside our standard service area. We serve Dallas, Plano, Irving, Garland, Richardson, and Carrollton. Our team can evaluate special dispatch or refer you to a trusted partner.`,
    };
  }

  public createLead(
    conversationId: string,
    data: {
      customerName: string;
      phone: string;
      serviceAddress: string;
      serviceType: string;
      reportedIssue: string;
      urgency: UrgencyLevel;
    }
  ) {
    const session = this.getSession(conversationId);

    // Rule 2 validation: Required customer info must exist and be valid
    const name = (data.customerName || '').trim();
    if (!name || name.includes('/') || /\bor\b/i.test(name) || name.toLowerCase() === 'unknown') {
      throw new Error(
        'Cannot create lead: Customer name is ambiguous or missing. Please clarify the customer name.'
      );
    }

    const phone = (data.phone || '').trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone || phoneDigits.length < 7) {
      throw new Error('Cannot create lead: A valid contact phone number is required.');
    }

    const serviceAddress = (data.serviceAddress || '').trim();
    if (!serviceAddress) {
      throw new Error('Cannot create lead: A valid service address is required.');
    }

    const serviceType = (data.serviceType || '').trim();
    if (!serviceType) {
      throw new Error('Cannot create lead: Service type is required.');
    }

    const reportedIssue = (data.reportedIssue || '').trim();
    if (!reportedIssue) {
      throw new Error('Cannot create lead: Problem description/reported issue is required.');
    }

    const urgency = data.urgency || 'normal';
    if (!['normal', 'urgent', 'emergency'].includes(urgency)) {
      throw new Error('Cannot create lead: Urgency must be normal, urgent, or emergency.');
    }

    // Duplicate protection / Idempotency check:
    // If this session already created a lead, or a lead exists with same phone + address
    if (session.leadId && this.leads.has(session.leadId)) {
      const existing = this.leads.get(session.leadId)!;
      return {
        leadId: existing.id,
        status: 'created',
        isDuplicate: true,
        message: `Existing lead ${existing.id} retrieved. Duplicate prevented for this session.`,
      };
    }

    // Check existing leads for phone match
    for (const existing of this.leads.values()) {
      if (existing.phone.replace(/\D/g, '') === phoneDigits && existing.customerName.toLowerCase() === name.toLowerCase()) {
        session.leadId = existing.id;
        return {
          leadId: existing.id,
          status: 'created',
          isDuplicate: true,
          message: `Existing lead ${existing.id} retrieved. Duplicate prevented for matching customer.`,
        };
      }
    }

    const leadId = `LEAD-${String(this.leadCounter++).padStart(4, '0')}`;
    const newRecord: LeadRecord = {
      id: leadId,
      conversationId,
      customerName: name,
      phone,
      serviceAddress,
      serviceType,
      reportedIssue,
      urgency,
      createdAt: new Date().toISOString(),
    };

    this.leads.set(leadId, newRecord);
    session.leadId = leadId;

    return {
      leadId,
      status: 'created',
      isDuplicate: false,
      message: 'Lead successfully created in CRM queue.',
    };
  }

  public getAvailableSlots(
    conversationId: string,
    params?: { serviceType?: string; urgency?: UrgencyLevel; preferredDate?: string }
  ) {
    const session = this.getSession(conversationId);
    session.slotsChecked = true;
    session.availableSlots = [...AVAILABLE_APPOINTMENT_SLOTS];

    const resolvedDay = resolveRelativeDay(params?.preferredDate);
    let matchedSlots = [...session.availableSlots];
    if (resolvedDay) {
      const filtered = session.availableSlots.filter((slot) =>
        slot.toLowerCase().startsWith(resolvedDay.toLowerCase())
      );
      if (filtered.length > 0) {
        matchedSlots = filtered;
      }
    }

    return {
      referenceDate: DEMO_REFERENCE_DATE,
      resolvedDay: resolvedDay || 'All upcoming days',
      slots: matchedSlots,
      allAvailableSlots: session.availableSlots,
      serviceType: params?.serviceType || 'HVAC Service',
      urgency: params?.urgency || 'normal',
      message: `Retrieved ${matchedSlots.length} available technician inspection windows for ${resolvedDay || 'upcoming schedule'}.`,
    };
  }

  public requestAppointment(
    conversationId: string,
    data: {
      leadId: string;
      preferredSlot: string;
      customerName: string;
      phone: string;
      serviceAddress: string;
    }
  ) {
    const session = this.getSession(conversationId);

    // Idempotency: Return existing appointment if already requested for this session
    if (session.appointmentId && this.appointments.has(session.appointmentId)) {
      const existing = this.appointments.get(session.appointmentId)!;
      return {
        appointmentId: existing.id,
        status: 'requested',
        slot: existing.slot,
        message:
          'Appointment request recorded for dispatch review. A dispatcher will contact you to confirm the appointment.',
      };
    }

    // Rule 1: check_service_area must succeed before request_appointment can execute
    if (!session.serviceAreaChecked || !session.serviceAreaSupported) {
      throw new Error(
        'Cannot request appointment: Service area check must succeed before scheduling an appointment.'
      );
    }

    // Rule 3: A valid lead must exist before request_appointment
    if (!data.leadId || !this.leads.has(data.leadId)) {
      throw new Error(
        `Cannot request appointment: Valid lead not found (${data.leadId || 'none provided'}). Create a lead first.`
      );
    }

    const lead = this.leads.get(data.leadId)!;

    // Rule 4: get_available_slots must be called before accepting an appointment time
    if (!session.slotsChecked || session.availableSlots.length === 0) {
      throw new Error(
        'Cannot request appointment: Available appointment slots must be retrieved before requesting a slot.'
      );
    }

    // Rule 5: request_appointment must reject any slot that was not returned by get_available_slots
    const requestedSlot = (data.preferredSlot || '').trim();
    const matchedSlot = session.availableSlots.find(
      (slot) => slot.toLowerCase() === requestedSlot.toLowerCase()
    );

    if (!matchedSlot) {
      throw new Error(
        `Invalid appointment slot "${requestedSlot}". Must be one of the available slots: ${session.availableSlots.join(', ')}.`
      );
    }

    // Customer details validation against lead
    const reqPhone = (data.phone || '').replace(/\D/g, '');
    const leadPhone = lead.phone.replace(/\D/g, '');
    if (reqPhone && leadPhone && reqPhone !== leadPhone) {
      throw new Error('Customer phone number does not match the associated lead.');
    }

    const appointmentId = `APT-${String(this.appointmentCounter++).padStart(4, '0')}`;
    const record: AppointmentRecord = {
      id: appointmentId,
      conversationId,
      leadId: data.leadId,
      slot: matchedSlot,
      customerName: data.customerName || lead.customerName,
      phone: data.phone || lead.phone,
      serviceAddress: data.serviceAddress || lead.serviceAddress,
      status: 'requested', // Explicitly requested, never confirmed!
      createdAt: new Date().toISOString(),
    };

    this.appointments.set(appointmentId, record);
    session.appointmentId = appointmentId;

    return {
      appointmentId,
      status: 'requested',
      slot: matchedSlot,
      message:
        'Appointment request recorded for dispatch review. A dispatcher will contact you to confirm the appointment.',
    };
  }

  public transferToHuman(
    conversationId: string,
    data: {
      reason: string;
      urgency: UrgencyLevel;
      summary: string;
    }
  ) {
    const session = this.getSession(conversationId);

    // Idempotency: Return existing transfer record if already transferred
    if (session.transferId && this.transfers.has(session.transferId)) {
      const existing = this.transfers.get(session.transferId)!;
      return {
        transferId: existing.id,
        status: 'transferred',
        isDuplicate: true,
        message: 'This conversation has already been transferred to human dispatch. A representative is currently connecting.',
      };
    }

    const reason = (data.reason || '').trim();
    if (!reason) {
      throw new Error('Transfer to human requires a valid reason.');
    }

    const transferId = `TR-${String(this.transferCounter++).padStart(4, '0')}`;
    const record: TransferRecord = {
      id: transferId,
      conversationId,
      reason,
      urgency: data.urgency || 'normal',
      summary: data.summary || reason,
      status: 'transferred',
      createdAt: new Date().toISOString(),
    };

    this.transfers.set(transferId, record);
    session.transferId = transferId;

    return {
      transferId,
      status: 'transferred',
      isDuplicate: false,
      message: 'Transferred to human dispatcher. A human representative will follow up immediately.',
    };
  }

  public getLead(leadId: string): LeadRecord | undefined {
    return this.leads.get(leadId);
  }

  public getAppointment(aptId: string): AppointmentRecord | undefined {
    return this.appointments.get(aptId);
  }

  public getTransfer(trId: string): TransferRecord | undefined {
    return this.transfers.get(trId);
  }

  public resetStore(): void {
    this.leads.clear();
    this.appointments.clear();
    this.transfers.clear();
    this.sessions.clear();
    this.leadCounter = 1;
    this.appointmentCounter = 1;
    this.transferCounter = 1;
  }
}

// Global singleton instance for server runtime
export const mockStore = new MockReceptionistStore();
