export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContractorIndustry =
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'roofing'
  | 'general_contractor';

export type LeadUrgency = 'normal' | 'urgent' | 'emergency';
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_requested'
  | 'transferred'
  | 'converted'
  | 'completed'
  | 'closed_not_proceeding';
export type AppointmentStatus = 'requested';
export type ConversationChannel = 'web_voice' | 'web_chat' | 'telephony';
export type ConversationStatus = 'active' | 'ended' | 'transferred';
export type MessageSender = 'customer' | 'ai' | 'system';
export type UserRole = 'owner' | 'admin' | 'dispatcher' | 'technician' | 'viewer';
export type PhoneProvider = 'twilio' | 'sip' | 'simulator';

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry?: ContractorIndustry;
          phone: string;
          address: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          timezone?: string;
          is_active?: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          industry?: ContractorIndustry;
          phone: string;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          timezone?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          industry?: ContractorIndustry;
          phone?: string;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          timezone?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          business_id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          business_id: string;
          email: string;
          full_name?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          email?: string;
          full_name?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      contractor_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          email: string;
          full_name?: string | null;
          role?: UserRole;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          email?: string;
          full_name?: string | null;
          role?: UserRole;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contractor_members_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      business_settings: {
        Row: {
          id: string;
          business_id: string;
          service_areas: string[];
          supported_zips: string[];
          services_offered: string[];
          business_hours: Json;
          emergency_service_enabled: boolean;
          after_hours_instructions: string | null;
          transfer_phone_number: string | null;
          transfer_instructions: string | null;
          custom_greeting: string | null;
          ai_voice_name?: string;
          industry_config?: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          service_areas?: string[];
          supported_zips?: string[];
          services_offered?: string[];
          business_hours?: Json;
          emergency_service_enabled?: boolean;
          after_hours_instructions?: string | null;
          transfer_phone_number?: string | null;
          transfer_instructions?: string | null;
          custom_greeting?: string | null;
          ai_voice_name?: string;
          industry_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          service_areas?: string[];
          supported_zips?: string[];
          services_offered?: string[];
          business_hours?: Json;
          emergency_service_enabled?: boolean;
          after_hours_instructions?: string | null;
          transfer_phone_number?: string | null;
          transfer_instructions?: string | null;
          custom_greeting?: string | null;
          ai_voice_name?: string;
          industry_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_settings_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      phone_numbers: {
        Row: {
          id: string;
          business_id: string;
          phone_number: string;
          normalized_digits: string;
          label: string;
          provider: PhoneProvider;
          twilio_sid: string | null;
          is_active: boolean;
          capabilities: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          phone_number: string;
          normalized_digits: string;
          label?: string;
          provider?: PhoneProvider;
          twilio_sid?: string | null;
          is_active?: boolean;
          capabilities?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          phone_number?: string;
          normalized_digits?: string;
          label?: string;
          provider?: PhoneProvider;
          twilio_sid?: string | null;
          is_active?: boolean;
          capabilities?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'phone_numbers_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      services: {
        Row: {
          id: string;
          business_id: string;
          industry: ContractorIndustry;
          name: string;
          category: string;
          description: string | null;
          is_emergency_eligible: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          industry?: ContractorIndustry;
          name: string;
          category?: string;
          description?: string | null;
          is_emergency_eligible?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          industry?: ContractorIndustry;
          name?: string;
          category?: string;
          description?: string | null;
          is_emergency_eligible?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'services_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      leads: {
        Row: {
          id: string;
          business_id: string;
          conversation_id: string | null;
          industry?: ContractorIndustry;
          customer_name: string;
          phone: string;
          service_address: string;
          city_area: string | null;
          service_type: string;
          reported_issue: string;
          urgency: LeadUrgency;
          status: LeadStatus;
          source: ConversationChannel;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          conversation_id?: string | null;
          industry?: ContractorIndustry;
          customer_name: string;
          phone: string;
          service_address: string;
          city_area?: string | null;
          service_type: string;
          reported_issue: string;
          urgency?: LeadUrgency;
          status?: LeadStatus;
          source?: ConversationChannel;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          conversation_id?: string | null;
          industry?: ContractorIndustry;
          customer_name?: string;
          phone?: string;
          service_address?: string;
          city_area?: string | null;
          service_type?: string;
          reported_issue?: string;
          urgency?: LeadUrgency;
          status?: LeadStatus;
          source?: ConversationChannel;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leads_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      appointments: {
        Row: {
          id: string;
          business_id: string;
          lead_id: string;
          conversation_id?: string | null;
          requested_date: string;
          requested_slot: string;
          status: AppointmentStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          lead_id: string;
          conversation_id?: string | null;
          requested_date: string;
          requested_slot: string;
          status?: AppointmentStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          lead_id?: string;
          conversation_id?: string | null;
          requested_date?: string;
          requested_slot?: string;
          status?: AppointmentStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'appointments_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_lead_id_fkey';
            columns: ['lead_id'];
            referencedRelation: 'leads';
            referencedColumns: ['id'];
          }
        ];
      };
      conversations: {
        Row: {
          id: string;
          business_id: string;
          lead_id: string | null;
          channel: ConversationChannel;
          caller_identifier: string | null;
          called_number?: string | null;
          external_call_sid?: string | null;
          detected_intent: string | null;
          status: ConversationStatus;
          duration_seconds?: number | null;
          summary?: string | null;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          lead_id?: string | null;
          channel: ConversationChannel;
          caller_identifier?: string | null;
          called_number?: string | null;
          external_call_sid?: string | null;
          detected_intent?: string | null;
          status?: ConversationStatus;
          duration_seconds?: number | null;
          summary?: string | null;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          lead_id?: string | null;
          channel?: ConversationChannel;
          caller_identifier?: string | null;
          called_number?: string | null;
          external_call_sid?: string | null;
          detected_intent?: string | null;
          status?: ConversationStatus;
          duration_seconds?: number | null;
          summary?: string | null;
          started_at?: string;
          ended_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender: MessageSender;
          text: string;
          extracted_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender: MessageSender;
          text: string;
          extracted_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender?: MessageSender;
          text?: string;
          extracted_data?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          }
        ];
      };
      call_events: {
        Row: {
          id: string;
          conversation_id: string;
          business_id: string;
          event_type: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          business_id: string;
          event_type: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          business_id?: string;
          event_type?: string;
          payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'call_events_business_id_fkey';
            columns: ['business_id'];
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_events_conversation_id_fkey';
            columns: ['conversation_id'];
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Canonical SaaS Domain Entity Aliases
export type ContractorRow = Database['public']['Tables']['businesses']['Row'];
export type ContractorMemberRow = Database['public']['Tables']['contractor_members']['Row'];
export type ContractorSettingsRow = Database['public']['Tables']['business_settings']['Row'];
export type PhoneNumberRow = Database['public']['Tables']['phone_numbers']['Row'];
export type ServiceRow = Database['public']['Tables']['services']['Row'];
export type CallRow = Database['public']['Tables']['conversations']['Row'];
export type CallEventRow = Database['public']['Tables']['call_events']['Row'];
export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type AppointmentRequestRow = Database['public']['Tables']['appointments']['Row'];
