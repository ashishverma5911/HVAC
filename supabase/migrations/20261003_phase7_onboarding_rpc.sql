-- ==============================================================================
-- Migration: 20261003_phase7_onboarding_rpc.sql
-- Description: Phase 7 Step 3 Atomic Contractor Onboarding & Profile Stored Procedure
-- ==============================================================================

-- 1. Ensure authenticated users can always select their own record in public.users
DROP POLICY IF EXISTS "users_select_same_business_users" ON public.users;

CREATE POLICY "users_select_own_or_same_business" ON public.users
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR business_id = public.get_auth_business_id()
    );

-- 2. Atomic Contractor Onboarding Function
-- Creates the business, default business_settings, and links public.users.business_id
-- within a single database transaction.
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
    p_custom_greeting TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_business_id UUID;
    v_new_business_id UUID;
    v_result JSONB;
BEGIN
    -- Check if user is already mapped to an existing business
    SELECT business_id INTO v_existing_business_id
    FROM public.users
    WHERE id = p_user_id
    LIMIT 1;

    IF v_existing_business_id IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_BUSINESS_REGISTRATION: User is already mapped to business %', v_existing_business_id;
    END IF;

    -- 1. Insert Business
    INSERT INTO public.businesses (
        name,
        slug,
        phone,
        address,
        city,
        state,
        postal_code
    )
    VALUES (
        p_name,
        p_slug,
        p_phone,
        p_address,
        p_city,
        p_state,
        p_postal_code
    )
    RETURNING id INTO v_new_business_id;

    -- 2. Insert Business Settings
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

    -- 3. Upsert User Profile
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

    SELECT jsonb_build_object(
        'business_id', v_new_business_id,
        'name', p_name,
        'slug', p_slug
    ) INTO v_result;

    RETURN v_result;
END;
$$;
