import { createAdminClient } from '@/lib/supabase/admin';
import { ConversationChannel, LeadUrgency, LeadStatus } from '@/lib/supabase/types';
import * as crypto from 'crypto';

/**
 * Normalizes an arbitrary conversation string (e.g., 'conv-17901234') into a valid deterministic UUID.
 */
export function normalizeToUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id;
  }
  const hash = crypto.createHash('sha256').update(id).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

export interface PersistLeadParams {
  conversationId?: string;
  customerName: string;
  phone: string;
  serviceAddress: string;
  cityArea?: string;
  serviceType: string;
  reportedIssue: string;
  urgency?: LeadUrgency;
  status?: LeadStatus;
  source?: ConversationChannel;
  metadata?: Record<string, unknown>;
}

export interface PersistAppointmentParams {
  leadId: string;
  requestedDate?: string;
  requestedSlot: string;
  notes?: string;
}

export class ContractorPersistenceService {
  /**
   * Ensures a conversation row exists in Supabase for the verified contractor.
   * Scoped strictly to verified business_id.
   */
  static async ensureConversation(
    businessId: string,
    rawConversationId: string,
    channel: ConversationChannel = 'web_chat',
    callerIdentifier?: string
  ): Promise<string> {
    if (!businessId) {
      throw new Error('ContractorPersistence: businessId is required for conversation persistence.');
    }

    const convUuid = normalizeToUuid(rawConversationId);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return convUuid;
    }

    const admin = createAdminClient();

    // Check if conversation already exists
    const { data: existing } = await admin
      .from('conversations')
      .select('id, business_id')
      .eq('id', convUuid)
      .maybeSingle();

    if (existing) {
      // Security guard: Ensure conversation belongs to this verified business
      if (existing.business_id !== businessId) {
        throw new Error('Security Violation: Conversation does not belong to verified business.');
      }
      return existing.id;
    }

    // Insert new conversation record
    const { data: inserted, error } = await admin
      .from('conversations')
      .insert({
        id: convUuid,
        business_id: businessId,
        channel,
        caller_identifier: callerIdentifier || null,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !inserted) {
      console.error('[ContractorPersistence] Failed to insert conversation:', error);
      throw new Error(error?.message || 'Failed to create conversation');
    }

    return inserted.id;
  }

  /**
   * Persists a transcript message to conversation_messages.
   * Strictly text only — ZERO audio streams are persisted.
   */
  static async persistMessage(
    businessId: string,
    rawConversationId: string,
    sender: 'customer' | 'ai' | 'system',
    text: string,
    extractedData?: Record<string, unknown>
  ): Promise<string | null> {
    if (!businessId) return null;

    try {
      const convUuid = await this.ensureConversation(businessId, rawConversationId);
      const admin = createAdminClient();

      const { data, error } = await admin
        .from('conversation_messages')
        .insert({
          conversation_id: convUuid,
          sender,
          text,
          extracted_data: extractedData ? JSON.parse(JSON.stringify(extractedData)) : null,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[ContractorPersistence] Failed to persist message:', error);
        return null;
      }

      return data?.id || null;
    } catch (err) {
      console.error('[ContractorPersistence] Message persistence error:', err);
      return null;
    }
  }

  /**
   * Persists a lead to the contractor's database with deterministic idempotency protection.
   * If a duplicate lead request is made within 2 hours for the same phone & serviceType,
   * it returns the existing lead instead of creating a duplicate.
   */
  static async persistLead(
    businessId: string,
    params: PersistLeadParams
  ): Promise<{ leadId: string; isDuplicate: boolean }> {
    if (!businessId) {
      throw new Error('ContractorPersistence: businessId is required to persist lead.');
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        leadId: `LEAD-${Date.now().toString().slice(-4)}`,
        isDuplicate: false,
      };
    }

    const admin = createAdminClient();
    const normalizedPhone = params.phone.replace(/\D/g, '');

    // 1. Idempotency Check: Look for matching lead created within the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: existingLeads } = await admin
      .from('leads')
      .select('id, phone, service_type, created_at')
      .eq('business_id', businessId)
      .eq('phone', params.phone)
      .eq('service_type', params.serviceType)
      .gte('created_at', twoHoursAgo)
      .limit(1);

    if (existingLeads && existingLeads.length > 0) {
      return {
        leadId: existingLeads[0].id,
        isDuplicate: true,
      };
    }

    // 2. Resolve or create conversation row if provided
    let convUuid: string | null = null;
    if (params.conversationId) {
      try {
        convUuid = await this.ensureConversation(
          businessId,
          params.conversationId,
          params.source || 'web_chat',
          params.phone
        );
      } catch (err) {
        console.warn('[ContractorPersistence] Could not link conversation to lead:', err);
      }
    }

    // 3. Insert Lead
    const urgency = params.urgency || 'normal';
    const status = params.status || 'qualified';
    const source = params.source || 'web_chat';

    const { data: newLead, error } = await admin
      .from('leads')
      .insert({
        business_id: businessId,
        conversation_id: convUuid,
        customer_name: params.customerName.trim(),
        phone: params.phone.trim(),
        service_address: params.serviceAddress.trim(),
        city_area: params.cityArea?.trim() || null,
        service_type: params.serviceType.trim(),
        reported_issue: params.reportedIssue.trim(),
        urgency,
        status,
        source,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : {},
      })
      .select('id')
      .single();

    if (error || !newLead) {
      console.error('[ContractorPersistence] Failed to insert lead:', error);
      throw new Error(error?.message || 'Failed to persist contractor lead');
    }

    // 4. Update conversation linkage if applicable
    if (convUuid) {
      await admin.from('conversations').update({ lead_id: newLead.id }).eq('id', convUuid);
    }

    return {
      leadId: newLead.id,
      isDuplicate: false,
    };
  }

  /**
   * Persists an appointment request for the contractor.
   * Status is strictly hardcoded to 'requested' — NEVER 'confirmed'.
   * Includes idempotency protection for retries.
   */
  static async persistAppointment(
    businessId: string,
    params: PersistAppointmentParams
  ): Promise<{ appointmentId: string; isDuplicate: boolean }> {
    if (!businessId) {
      throw new Error('ContractorPersistence: businessId is required to persist appointment.');
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        appointmentId: `APT-${Date.now().toString().slice(-4)}`,
        isDuplicate: false,
      };
    }

    const admin = createAdminClient();

    // 1. Verify that leadId belongs to this verified business
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id, business_id')
      .eq('id', params.leadId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (leadError || !lead) {
      throw new Error(
        `ContractorPersistence: Lead "${params.leadId}" not found or does not belong to verified business.`
      );
    }

    // 2. Idempotency Check: Existing appointment for this lead and requested slot
    const { data: existingAppts } = await admin
      .from('appointments')
      .select('id')
      .eq('business_id', businessId)
      .eq('lead_id', params.leadId)
      .eq('requested_slot', params.requestedSlot)
      .limit(1);

    if (existingAppts && existingAppts.length > 0) {
      return {
        appointmentId: existingAppts[0].id,
        isDuplicate: true,
      };
    }

    // 3. Extract or default requestedDate from requestedSlot
    const requestedDate =
      params.requestedDate ||
      (params.requestedSlot.includes(',')
        ? params.requestedSlot.split(',')[0].trim()
        : new Date().toISOString().split('T')[0]);

    // 4. Insert Appointment with status strictly 'requested'
    const { data: newAppt, error } = await admin
      .from('appointments')
      .insert({
        business_id: businessId,
        lead_id: params.leadId,
        requested_date: requestedDate,
        requested_slot: params.requestedSlot,
        status: 'requested', // STRICT INVARIANT: Always 'requested'
        notes: params.notes || null,
      })
      .select('id')
      .single();

    if (error || !newAppt) {
      console.error('[ContractorPersistence] Failed to insert appointment:', error);
      throw new Error(error?.message || 'Failed to persist appointment request');
    }

    // 5. Update lead status to appointment_requested
    await admin
      .from('leads')
      .update({ status: 'appointment_requested' })
      .eq('id', params.leadId)
      .eq('business_id', businessId);

    return {
      appointmentId: newAppt.id,
      isDuplicate: false,
    };
  }

  /**
   * Persists an audit/telemetry event to call_events.
   * Used for simplified tool event visibility in contractor mode.
   */
  static async persistCallEvent(
    businessId: string,
    rawConversationId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<string | null> {
    if (!businessId) return null;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return `EVT-${Date.now().toString().slice(-4)}`;
    }

    try {
      const convUuid = await this.ensureConversation(businessId, rawConversationId);
      const admin = createAdminClient();

      const { data, error } = await admin
        .from('call_events')
        .insert({
          conversation_id: convUuid,
          business_id: businessId,
          event_type: eventType,
          payload: JSON.parse(JSON.stringify(payload)),
        })
        .select('id')
        .single();

      if (error) {
        console.error('[ContractorPersistence] Failed to persist call event:', error);
        return null;
      }

      return data?.id || null;
    } catch (err) {
      console.error('[ContractorPersistence] Event persistence error:', err);
      return null;
    }
  }
}
