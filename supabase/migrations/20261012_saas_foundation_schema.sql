-- ==============================================================================
-- Migration: 20261012_saas_foundation_schema.sql
-- Description: Multi-Tenant SaaS Foundation & Multi-Industry Extensibility for AERIS
--              Adapts and extends the Phase 7 schema with:
--              1. Multi-industry support on businesses & leads ('hvac' default)
--              2. contractor_members (multi-user per contractor membership & roles)
--              3. phone_numbers (inbound PSTN/Twilio routing per contractor)
--              4. services (structured service catalog per contractor)
--              5. Enriched call tracking on conversations & appointments
--              6. Domain views (contractors, contractor_settings, calls, appointment_requests)
--              7. Comprehensive Row Level Security (RLS) policies & updated onboarding RPC
-- ==============================================================================

-- 1. EXTEND public.businesses FOR MULTI-INDUSTRY SAAS
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'hvac'
        CHECK (industry IN ('hvac', 'plumbing', 'electrical', 'roofing', 'general_contractor')),
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. EXTEND public.business_settings FOR VOICE & INDUSTRY CONFIGURATION
ALTER TABLE public.business_settings
    ADD COLUMN IF NOT EXISTS ai_voice_name TEXT NOT NULL DEFAULT 'Aoede',
    ADD COLUMN IF NOT EXISTS industry_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. CONTRACTOR MEMBERS TABLE (Multi-User Organization Memberships)
CREATE TABLE IF NOT EXISTS public.contractor_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'owner'
        CHECK (role IN ('owner', 'admin', 'dispatcher', 'technician', 'viewer')),
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (business_id, user_id)
);

-- Backfill contractor_members from existing public.users rows
INSERT INTO public.contractor_members (business_id, user_id, email, full_name, role, is_primary, created_at, updated_at)
SELECT business_id, id, email, full_name, role, true, created_at, updated_at
FROM public.users
ON CONFLICT (business_id, user_id) DO NOTHING;

-- 4. PHONE NUMBERS TABLE (Dedicated Tenant Phone Routing)
CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL UNIQUE,
    normalized_digits TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Primary Receptionist Line',
    provider TEXT NOT NULL DEFAULT 'twilio'
        CHECK (provider IN ('twilio', 'sip', 'simulator')),
    twilio_sid TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    capabilities JSONB NOT NULL DEFAULT '{"voice": true, "sms": false}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Backfill phone_numbers from existing businesses
INSERT INTO public.phone_numbers (business_id, phone_number, normalized_digits, label, provider, is_active)
SELECT
    id,
    phone,
    RIGHT(regexp_replace(phone, '\D', '', 'g'), 10),
    'Primary Receptionist Line',
    'twilio',
    true
FROM public.businesses
WHERE length(regexp_replace(phone, '\D', '', 'g')) >= 10
ON CONFLICT (phone_number) DO NOTHING;

-- 5. SERVICES TABLE (Structured Contractor Service Catalog)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    industry TEXT NOT NULL DEFAULT 'hvac',
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    is_emergency_eligible BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (business_id, name)
);

-- Backfill services from business_settings.services_offered
INSERT INTO public.services (business_id, industry, name, is_emergency_eligible)
SELECT
    bs.business_id,
    COALESCE(b.industry, 'hvac'),
    unnest(bs.services_offered),
    bs.emergency_service_enabled
FROM public.business_settings bs
JOIN public.businesses b ON b.id = bs.business_id
ON CONFLICT (business_id, name) DO NOTHING;

-- 6. EXTEND CONVERSATIONS (CALLS), LEADS, AND APPOINTMENTS
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS called_number TEXT,
    ADD COLUMN IF NOT EXISTS external_call_sid TEXT,
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'hvac',
    ADD COLUMN IF NOT EXISTS preferred_appointment_window TEXT;

ALTER TABLE public.leads
    ALTER COLUMN customer_name SET DEFAULT '',
    ALTER COLUMN phone SET DEFAULT '',
    ALTER COLUMN service_address SET DEFAULT '';

ALTER TABLE public.leads
    DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
    ADD CONSTRAINT leads_status_check CHECK (
        status IN (
            'new',
            'contacted',
            'qualified',
            'appointment_requested',
            'transferred',
            'converted',
            'completed',
            'closed_not_proceeding'
        )
    );

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

-- 7. INDEXES FOR MULTI-TENANT QUERIES, PHONE ROUTING & LEAD IDEMPOTENCY
CREATE INDEX IF NOT EXISTS idx_contractor_members_user_id ON public.contractor_members(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_members_business_id ON public.contractor_members(business_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_business_id ON public.phone_numbers(business_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_digits_active ON public.phone_numbers(normalized_digits) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_services_business_id ON public.services(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_external_sid ON public.conversations(external_call_sid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_business_conversation_unique
    ON public.leads(business_id, conversation_id)
    WHERE conversation_id IS NOT NULL;

-- 8. TENANT AUTHORIZATION FUNCTIONS (RLS HELPERS)
CREATE OR REPLACE FUNCTION public.get_auth_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT business_id FROM public.users WHERE id = auth.uid() LIMIT 1),
    (SELECT business_id FROM public.contractor_members WHERE user_id = auth.uid() ORDER BY is_primary DESC, created_at ASC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1),
    (SELECT role FROM public.contractor_members WHERE user_id = auth.uid() ORDER BY is_primary DESC, created_at ASC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_business_access(target_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND business_id = target_business_id
    UNION ALL
    SELECT 1 FROM public.contractor_members WHERE user_id = auth.uid() AND business_id = target_business_id
  );
$$;

-- 9. GRANTS & ROW LEVEL SECURITY FOR NEW & EXISTING TABLES
REVOKE ALL ON TABLE public.contractor_members FROM anon, public;
REVOKE ALL ON TABLE public.phone_numbers FROM anon, public;
REVOKE ALL ON TABLE public.services FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;
GRANT UPDATE ON TABLE public.conversations TO authenticated;

ALTER TABLE public.contractor_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Policies for contractor_members
DROP POLICY IF EXISTS "members_select_own_or_same_business" ON public.contractor_members;
CREATE POLICY "members_select_own_or_same_business" ON public.contractor_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.user_has_business_access(business_id));

DROP POLICY IF EXISTS "owners_manage_contractor_members" ON public.contractor_members;
CREATE POLICY "owners_manage_contractor_members" ON public.contractor_members
    FOR ALL TO authenticated
    USING (public.user_has_business_access(business_id))
    WITH CHECK (public.user_has_business_access(business_id));

-- Policies for phone_numbers
DROP POLICY IF EXISTS "users_select_own_phone_numbers" ON public.phone_numbers;
CREATE POLICY "users_select_own_phone_numbers" ON public.phone_numbers
    FOR SELECT TO authenticated
    USING (public.user_has_business_access(business_id));

DROP POLICY IF EXISTS "owners_manage_own_phone_numbers" ON public.phone_numbers;
CREATE POLICY "owners_manage_own_phone_numbers" ON public.phone_numbers
    FOR ALL TO authenticated
    USING (public.user_has_business_access(business_id))
    WITH CHECK (public.user_has_business_access(business_id));

-- Policies for services
DROP POLICY IF EXISTS "users_select_own_services" ON public.services;
CREATE POLICY "users_select_own_services" ON public.services
    FOR SELECT TO authenticated
    USING (public.user_has_business_access(business_id));

DROP POLICY IF EXISTS "owners_manage_own_services" ON public.services;
CREATE POLICY "owners_manage_own_services" ON public.services
    FOR ALL TO authenticated
    USING (public.user_has_business_access(business_id))
    WITH CHECK (public.user_has_business_access(business_id));

-- Add missing INSERT policy on call_events & UPDATE policy on conversations
DROP POLICY IF EXISTS "users_insert_own_call_events" ON public.call_events;
CREATE POLICY "users_insert_own_call_events" ON public.call_events
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_business_access(business_id));

DROP POLICY IF EXISTS "users_update_own_conversations" ON public.conversations;
CREATE POLICY "users_update_own_conversations" ON public.conversations
    FOR UPDATE TO authenticated
    USING (public.user_has_business_access(business_id))
    WITH CHECK (public.user_has_business_access(business_id));

-- 10. CANONICAL SAAS DOMAIN VIEWS (SECURITY INVOKER = TRUE FOR RLS ENFORCEMENT)
CREATE OR REPLACE VIEW public.contractors
WITH (security_invoker = true) AS
SELECT
    id,
    id AS contractor_id,
    name,
    slug,
    industry,
    phone,
    address,
    city,
    state,
    postal_code,
    timezone,
    is_active,
    created_at,
    updated_at
FROM public.businesses;

CREATE OR REPLACE VIEW public.contractor_settings
WITH (security_invoker = true) AS
SELECT
    id,
    business_id,
    business_id AS contractor_id,
    service_areas,
    supported_zips,
    services_offered,
    business_hours,
    emergency_service_enabled,
    after_hours_instructions,
    transfer_phone_number,
    transfer_instructions,
    custom_greeting,
    ai_voice_name,
    industry_config,
    created_at,
    updated_at
FROM public.business_settings;

CREATE OR REPLACE VIEW public.calls
WITH (security_invoker = true) AS
SELECT
    id,
    business_id,
    business_id AS contractor_id,
    lead_id,
    channel,
    caller_identifier,
    called_number,
    external_call_sid,
    detected_intent,
    status,
    duration_seconds,
    summary,
    started_at,
    ended_at
FROM public.conversations;

CREATE OR REPLACE VIEW public.appointment_requests
WITH (security_invoker = true) AS
SELECT
    id,
    business_id,
    business_id AS contractor_id,
    lead_id,
    conversation_id,
    requested_date,
    requested_slot,
    status,
    notes,
    created_at,
    updated_at
FROM public.appointments;

GRANT SELECT ON public.contractors TO authenticated;
GRANT SELECT ON public.contractor_settings TO authenticated;
GRANT SELECT ON public.calls TO authenticated;
GRANT SELECT ON public.appointment_requests TO authenticated;

-- 11. UPDATE ATOMIC ONBOARDING STORED PROCEDURE TO POPULATE MEMBERS, PHONE_NUMBERS & SERVICES
-- Drop obsolete 19-parameter overload from Migration 2 to prevent ambiguous RPC resolution
DROP FUNCTION IF EXISTS public.onboard_contractor_business(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT[], TEXT[], TEXT[], JSONB, BOOLEAN, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.onboard_contractor_business(
    p_user_id UUID,
    p_user_email TEXT,
    p_full_name TEXT,
    p_name TEXT,
    p_slug TEXT,
    p_phone TEXT,
    p_address TEXT,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL,
    p_service_areas TEXT[] DEFAULT '{}',
    p_supported_zips TEXT[] DEFAULT '{}',
    p_services_offered TEXT[] DEFAULT '{}',
    p_business_hours JSONB DEFAULT '{"weekdays": "8:00 AM - 6:00 PM"}'::jsonb,
    p_emergency_service_enabled BOOLEAN DEFAULT true,
    p_after_hours_instructions TEXT DEFAULT NULL,
    p_transfer_phone_number TEXT DEFAULT NULL,
    p_transfer_instructions TEXT DEFAULT NULL,
    p_custom_greeting TEXT DEFAULT NULL,
    p_industry TEXT DEFAULT 'hvac'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_business_id UUID;
    v_new_business_id UUID;
    v_normalized_digits TEXT;
    v_service_name TEXT;
    v_idx INTEGER := 0;
    v_industry TEXT := COALESCE(NULLIF(trim(p_industry), ''), 'hvac');
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        (SELECT business_id FROM public.users WHERE id = p_user_id LIMIT 1),
        (SELECT business_id FROM public.contractor_members WHERE user_id = p_user_id LIMIT 1)
    ) INTO v_existing_business_id;

    IF v_existing_business_id IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_BUSINESS_REGISTRATION: User is already mapped to business %', v_existing_business_id;
    END IF;

    -- 1. Insert Business (Contractor)
    INSERT INTO public.businesses (
        name,
        slug,
        industry,
        phone,
        address,
        city,
        state,
        postal_code
    )
    VALUES (
        p_name,
        p_slug,
        v_industry,
        p_phone,
        p_address,
        p_city,
        p_state,
        p_postal_code
    )
    RETURNING id INTO v_new_business_id;

    -- 2. Insert Business Settings (Contractor Settings)
    INSERT INTO public.business_settings (
        business_id,
        service_areas,
        supported_zips,
        services_offered,
        business_hours,
        emergency_service_enabled,
        after_hours_instructions,
        transfer_phone_number,
        transfer_instructions,
        custom_greeting
    )
    VALUES (
        v_new_business_id,
        p_service_areas,
        p_supported_zips,
        p_services_offered,
        p_business_hours,
        p_emergency_service_enabled,
        p_after_hours_instructions,
        COALESCE(p_transfer_phone_number, p_phone),
        p_transfer_instructions,
        p_custom_greeting
    );

    -- 3. Upsert Legacy User Profile & Insert Contractor Member
    INSERT INTO public.users (
        id,
        business_id,
        email,
        full_name,
        role
    )
    VALUES (
        p_user_id,
        v_new_business_id,
        p_user_email,
        p_full_name,
        'owner'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        business_id = EXCLUDED.business_id,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        updated_at = timezone('utc'::text, now());

    INSERT INTO public.contractor_members (
        business_id,
        user_id,
        email,
        full_name,
        role,
        is_primary
    )
    VALUES (
        v_new_business_id,
        p_user_id,
        p_user_email,
        p_full_name,
        'owner',
        true
    )
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- 4. Provision Primary Phone Number Routing Record
    v_normalized_digits := RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 10);
    IF length(v_normalized_digits) = 10 THEN
        INSERT INTO public.phone_numbers (
            business_id,
            phone_number,
            normalized_digits,
            label,
            provider,
            is_active
        )
        VALUES (
            v_new_business_id,
            p_phone,
            v_normalized_digits,
            'Primary Receptionist Line',
            'twilio',
            true
        )
        ON CONFLICT (phone_number) DO NOTHING;
    END IF;

    -- 5. Populate Structured Services Catalog
    IF array_length(p_services_offered, 1) IS NOT NULL THEN
        FOREACH v_service_name IN ARRAY p_services_offered LOOP
            v_idx := v_idx + 1;
            INSERT INTO public.services (
                business_id,
                industry,
                name,
                is_emergency_eligible,
                sort_order
            )
            VALUES (
                v_new_business_id,
                v_industry,
                v_service_name,
                p_emergency_service_enabled,
                v_idx
            )
            ON CONFLICT (business_id, name) DO NOTHING;
        END LOOP;
    END IF;

    SELECT jsonb_build_object(
        'business_id', v_new_business_id,
        'contractor_id', v_new_business_id,
        'name', p_name,
        'slug', p_slug,
        'industry', v_industry
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 12. PHASE 10 DATABASE SECURITY HARDENING (RBAC HELPER, COMPOSITE INDEXES, & COMPLETE RLS POLICIES)
CREATE OR REPLACE FUNCTION public.user_has_business_role(
    target_business_id UUID,
    allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contractor_members
    WHERE user_id = auth.uid()
      AND business_id = target_business_id
      AND role = ANY(allowed_roles)
  ) OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND business_id = target_business_id
      AND role = ANY(allowed_roles)
  );
$$;

-- Composite indexes for tenant-isolated call history, lifecycle timeline, and appointment lookups
CREATE INDEX IF NOT EXISTS idx_conversations_business_started
    ON public.conversations(business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_events_conversation_created
    ON public.call_events(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id
    ON public.appointments(lead_id);

-- Grant controlled UPDATE/DELETE permissions to authenticated role (always gated by RLS below)
GRANT UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.conversation_messages TO authenticated;
GRANT DELETE ON TABLE public.call_events TO authenticated;
GRANT DELETE ON TABLE public.leads TO authenticated;
GRANT DELETE ON TABLE public.appointments TO authenticated;

-- Align public.users role CHECK constraint with public.contractor_members roles
ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check CHECK (
        role IN ('owner', 'admin', 'dispatcher', 'technician', 'viewer')
    );

-- RLS Policies for conversations UPDATE & DELETE
DROP POLICY IF EXISTS "users_update_own_conversations" ON public.conversations;
DROP POLICY IF EXISTS "members_update_own_conversations" ON public.conversations;
CREATE POLICY "members_update_own_conversations" ON public.conversations
    FOR UPDATE TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin', 'dispatcher']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin', 'dispatcher']
        )
    );

DROP POLICY IF EXISTS "owners_delete_own_conversations" ON public.conversations;
CREATE POLICY "owners_delete_own_conversations" ON public.conversations
    FOR DELETE TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

-- RLS Policies for conversation_messages UPDATE & DELETE
DROP POLICY IF EXISTS "members_update_own_messages" ON public.conversation_messages;
CREATE POLICY "members_update_own_messages" ON public.conversation_messages
    FOR UPDATE TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE public.user_has_business_role(
                business_id,
                ARRAY['owner', 'admin', 'dispatcher']
            )
        )
    )
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE public.user_has_business_role(
                business_id,
                ARRAY['owner', 'admin', 'dispatcher']
            )
        )
    );

DROP POLICY IF EXISTS "owners_delete_own_messages" ON public.conversation_messages;
CREATE POLICY "owners_delete_own_messages" ON public.conversation_messages
    FOR DELETE TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE public.user_has_business_role(
                business_id,
                ARRAY['owner', 'admin']
            )
        )
    );

-- RLS Policy for call_events DELETE
DROP POLICY IF EXISTS "owners_delete_own_call_events" ON public.call_events;
CREATE POLICY "owners_delete_own_call_events" ON public.call_events
    FOR DELETE TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

-- RLS Policies for leads & appointments DELETE
DROP POLICY IF EXISTS "owners_delete_own_leads" ON public.leads;
CREATE POLICY "owners_delete_own_leads" ON public.leads
    FOR DELETE TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

DROP POLICY IF EXISTS "owners_delete_own_appointments" ON public.appointments;
CREATE POLICY "owners_delete_own_appointments" ON public.appointments
    FOR DELETE TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

-- Tighten management policies on contractor_members, phone_numbers, and services to owner/admin roles
DROP POLICY IF EXISTS "owners_manage_contractor_members" ON public.contractor_members;
CREATE POLICY "owners_manage_contractor_members" ON public.contractor_members
    FOR ALL TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

DROP POLICY IF EXISTS "owners_manage_own_phone_numbers" ON public.phone_numbers;
CREATE POLICY "owners_manage_own_phone_numbers" ON public.phone_numbers
    FOR ALL TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

DROP POLICY IF EXISTS "owners_manage_own_services" ON public.services;
CREATE POLICY "owners_manage_own_services" ON public.services
    FOR ALL TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );

DROP POLICY IF EXISTS "owners_update_own_business" ON public.businesses;
CREATE POLICY "owners_update_own_business" ON public.businesses
    FOR UPDATE TO authenticated
    USING (
        public.user_has_business_role(
            id,
            ARRAY['owner', 'admin']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            id,
            ARRAY['owner', 'admin']
        )
    );

DROP POLICY IF EXISTS "owners_manage_own_settings" ON public.business_settings;
CREATE POLICY "owners_manage_own_settings" ON public.business_settings
    FOR ALL TO authenticated
    USING (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    )
    WITH CHECK (
        public.user_has_business_role(
            business_id,
            ARRAY['owner', 'admin']
        )
    );


