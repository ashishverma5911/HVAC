-- ==============================================================================
-- Migration: 20261003_phase7_pilot_schema.sql
-- Description: Phase 7 AERIS AI Multi-Business Schema with Row Level Security (RLS)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CORE BUSINESSES TABLE
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. USERS / CONTRACTOR PROFILE TABLE
-- Maps 1:1 with auth.users for pilot, linked via business_id.
-- Modular design: Future multi-user per business memberships can easily link here.
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'dispatcher', 'technician')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. BUSINESS SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.business_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    service_areas TEXT[] NOT NULL DEFAULT '{}',
    supported_zips TEXT[] NOT NULL DEFAULT '{}',
    services_offered TEXT[] NOT NULL DEFAULT '{}',
    business_hours JSONB NOT NULL DEFAULT '{"weekdays": "8:00 AM - 6:00 PM"}'::jsonb,
    emergency_service_enabled BOOLEAN NOT NULL DEFAULT true,
    after_hours_instructions TEXT,
    transfer_phone_number TEXT,
    transfer_instructions TEXT,
    custom_greeting TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. LEADS TABLE
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    conversation_id UUID,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service_address TEXT NOT NULL,
    city_area TEXT,
    service_type TEXT NOT NULL,
    reported_issue TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'emergency')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'appointment_requested', 'transferred', 'completed')),
    source TEXT NOT NULL DEFAULT 'web_chat' CHECK (source IN ('web_voice', 'web_chat', 'telephony')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    requested_date TEXT NOT NULL,
    requested_slot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'web_chat' CHECK (channel IN ('web_voice', 'web_chat', 'telephony')),
    caller_identifier TEXT,
    detected_intent TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'transferred')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ
);

-- 8. CONVERSATION MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('customer', 'ai', 'system')),
    text TEXT NOT NULL,
    extracted_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. CALL EVENTS TABLE (AUDIT / TELEMETRY)
CREATE TABLE IF NOT EXISTS public.call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. INDEXES FOR PERFORMANCE & TENANT LOOKUP
CREATE INDEX IF NOT EXISTS idx_users_business_id ON public.users(business_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_business_id ON public.business_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_business_created ON public.leads(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business_status ON public.leads(business_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_business_id ON public.appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON public.conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_convo ON public.conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_call_events_business_id ON public.call_events(business_id);

-- 11. HELPER FUNCTION TO RESOLVE AUTHENTICATED USER'S BUSINESS_ID
-- Resolves ownership from auth.uid() rather than trusting client-supplied business_id.
CREATE OR REPLACE FUNCTION public.get_auth_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- 12. REVOKE PUBLIC & ANONYMOUS GRANTS (DEFENSE IN DEPTH)
REVOKE ALL ON TABLE public.businesses FROM anon, public;
REVOKE ALL ON TABLE public.users FROM anon, public;
REVOKE ALL ON TABLE public.business_settings FROM anon, public;
REVOKE ALL ON TABLE public.leads FROM anon, public;
REVOKE ALL ON TABLE public.appointments FROM anon, public;
REVOKE ALL ON TABLE public.conversations FROM anon, public;
REVOKE ALL ON TABLE public.conversation_messages FROM anon, public;
REVOKE ALL ON TABLE public.call_events FROM anon, public;

-- Grant minimal necessary rights to authenticated users
GRANT SELECT, UPDATE ON TABLE public.businesses TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.appointments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.conversation_messages TO authenticated;
GRANT SELECT, INSERT ON TABLE public.call_events TO authenticated;

-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

-- Policy: businesses
CREATE POLICY "users_select_own_business" ON public.businesses
    FOR SELECT TO authenticated
    USING (id = public.get_auth_business_id());

CREATE POLICY "owners_update_own_business" ON public.businesses
    FOR UPDATE TO authenticated
    USING (id = public.get_auth_business_id())
    WITH CHECK (id = public.get_auth_business_id());

-- Policy: users
CREATE POLICY "users_select_same_business_users" ON public.users
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

CREATE POLICY "users_update_own_profile" ON public.users
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Policy: business_settings
CREATE POLICY "users_select_own_settings" ON public.business_settings
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

CREATE POLICY "owners_manage_own_settings" ON public.business_settings
    FOR ALL TO authenticated
    USING (business_id = public.get_auth_business_id())
    WITH CHECK (business_id = public.get_auth_business_id());

-- Policy: leads
CREATE POLICY "users_select_own_leads" ON public.leads
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

CREATE POLICY "users_insert_own_leads" ON public.leads
    FOR INSERT TO authenticated
    WITH CHECK (business_id = public.get_auth_business_id());

CREATE POLICY "users_update_own_leads" ON public.leads
    FOR UPDATE TO authenticated
    USING (business_id = public.get_auth_business_id())
    WITH CHECK (business_id = public.get_auth_business_id());

-- Policy: appointments
CREATE POLICY "users_select_own_appointments" ON public.appointments
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

CREATE POLICY "users_insert_own_appointments" ON public.appointments
    FOR INSERT TO authenticated
    WITH CHECK (business_id = public.get_auth_business_id());

CREATE POLICY "users_update_own_appointments" ON public.appointments
    FOR UPDATE TO authenticated
    USING (business_id = public.get_auth_business_id())
    WITH CHECK (business_id = public.get_auth_business_id());

-- Policy: conversations
CREATE POLICY "users_select_own_conversations" ON public.conversations
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

CREATE POLICY "users_insert_own_conversations" ON public.conversations
    FOR INSERT TO authenticated
    WITH CHECK (business_id = public.get_auth_business_id());

-- Policy: conversation_messages
CREATE POLICY "users_select_own_messages" ON public.conversation_messages
    FOR SELECT TO authenticated
    USING (conversation_id IN (
        SELECT id FROM public.conversations WHERE business_id = public.get_auth_business_id()
    ));

CREATE POLICY "users_insert_own_messages" ON public.conversation_messages
    FOR INSERT TO authenticated
    WITH CHECK (conversation_id IN (
        SELECT id FROM public.conversations WHERE business_id = public.get_auth_business_id()
    ));

-- Policy: call_events
CREATE POLICY "users_select_own_call_events" ON public.call_events
    FOR SELECT TO authenticated
    USING (business_id = public.get_auth_business_id());

-- 14. SEED DEMO BUSINESS (SUMMIT HVAC)
-- Deterministic seed for demo/reference mode.
INSERT INTO public.businesses (id, name, slug, phone, address, city, state, postal_code)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Summit HVAC',
    'summit-hvac',
    '(214) 555-0100',
    '1000 Main Street',
    'Dallas',
    'TX',
    '75201'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_settings (
    business_id,
    service_areas,
    supported_zips,
    services_offered,
    business_hours,
    emergency_service_enabled,
    after_hours_instructions,
    transfer_phone_number,
    transfer_instructions
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    ARRAY['Dallas', 'Plano', 'Irving', 'Garland', 'Richardson', 'Carrollton'],
    ARRAY['75001', '75023', '75024', '75025', '75075', '75080', '75081', '75082', '75201', '75202', '75204', '75205'],
    ARRAY['AC Repair', 'AC Installation', 'Heating & Furnace Repair', 'HVAC Seasonal Maintenance & Tune-ups', '24/7 Emergency Service'],
    '{"weekdays": "8:00 AM - 6:00 PM", "saturday": "On-Call Emergency", "sunday": "On-Call Emergency"}'::jsonb,
    true,
    'Immediate dispatch for emergency cooling, heating loss, or gas/safety hazards.',
    '(214) 555-0199',
    'Transfer to human dispatcher on duty when safety hazard is detected or customer requests manager.'
)
ON CONFLICT (business_id) DO NOTHING;
