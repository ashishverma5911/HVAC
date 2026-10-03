export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type LeadUrgency = 'normal' | 'urgent' | 'emergency';
export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'appointment_requested'
  | 'transferred'
  | 'completed';
export type AppointmentStatus = 'requested';
export type ConversationChannel = 'web_voice' | 'web_chat' | 'telephony';
export type ConversationStatus = 'active' | 'ended' | 'transferred';
export type MessageSender = 'customer' | 'ai' | 'system';
export type UserRole = 'owner' | 'dispatcher' | 'technician';

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          slug: string;
          phone: string;
          address: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          phone: string;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          phone?: string;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
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
      leads: {
        Row: {
          id: string;
          business_id: string;
          conversation_id: string | null;
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
          detected_intent: string | null;
          status: ConversationStatus;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          lead_id?: string | null;
          channel: ConversationChannel;
          caller_identifier?: string | null;
          detected_intent?: string | null;
          status?: ConversationStatus;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          lead_id?: string | null;
          channel?: ConversationChannel;
          caller_identifier?: string | null;
          detected_intent?: string | null;
          status?: ConversationStatus;
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
