/**
 * Seed script for Phase 7 Pilot Account: ABC Cooling & Heating.
 * Sets up a realistic contractor profile for real-world pilot testing in Plano & Richardson, TX.
 * 
 * Usage:
 *   pnpm tsx scripts/seed_pilot_account.ts
 */

import { createAdminClient } from '../src/lib/supabase/admin';

export const PILOT_CONFIG = {
  name: 'ABC Cooling & Heating',
  slug: 'abc-cooling-heating',
  phone: '(972) 555-0199',
  address: '1400 Preston Rd, Suite 400',
  city: 'Plano',
  state: 'TX',
  postalCode: '75093',
  serviceAreas: ['Plano', 'Richardson'],
  services: [
    'AC Repair & Diagnostic',
    'HVAC Maintenance',
    'Heating & Furnace Repair',
    'Emergency Service',
  ],
  businessHours: {
    weekdays: '8:00 AM - 6:00 PM',
    saturday: 'Closed',
    sunday: 'Closed',
  },
  emergencyService: true,
  afterHoursPolicy:
    'Emergency service available 24/7 for urgent heating and cooling failures. Non-emergency inquiries will be scheduled during regular business hours.',
  transferInstructions:
    'Transfer customer to the emergency dispatch line at (972) 555-0199 if customer explicitly requests a person or reports a severe heating/cooling breakdown during freezing or extreme heat conditions.',
};

async function seedPilotAccount() {
  console.log('[SeedPilotAccount] Starting pilot configuration setup...');

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[SeedPilotAccount] Supabase credentials not found in environment. Skipping database write.');
    return;
  }

  const admin = createAdminClient();

  // Check if pilot business already exists
  const { data: existing } = await admin
    .from('businesses')
    .select('id, name')
    .eq('name', PILOT_CONFIG.name)
    .maybeSingle();

  let businessId: string;

  if (existing) {
    businessId = existing.id;
    console.log(`[SeedPilotAccount] Pilot business already exists with ID: ${businessId}`);
    const { error: updateErr } = await admin
      .from('businesses')
      .update({
        phone: PILOT_CONFIG.phone,
        address: PILOT_CONFIG.address,
        city: PILOT_CONFIG.city,
        state: PILOT_CONFIG.state,
        postal_code: PILOT_CONFIG.postalCode,
      })
      .eq('id', businessId);

    if (updateErr) {
      console.error('[SeedPilotAccount] Failed to update pilot business:', updateErr);
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from('businesses')
      .insert({
        name: PILOT_CONFIG.name,
        slug: PILOT_CONFIG.slug,
        phone: PILOT_CONFIG.phone,
        address: PILOT_CONFIG.address,
        city: PILOT_CONFIG.city,
        state: PILOT_CONFIG.state,
        postal_code: PILOT_CONFIG.postalCode,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('[SeedPilotAccount] Failed to create pilot business:', insertErr);
      return;
    }
    businessId = inserted.id;
    console.log(`[SeedPilotAccount] Created pilot business with ID: ${businessId}`);
  }

  // Update or insert business_settings
  const { data: existingSettings } = await admin
    .from('business_settings')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle();

  if (existingSettings) {
    const { error: settingsUpdateErr } = await admin
      .from('business_settings')
      .update({
        service_areas: PILOT_CONFIG.serviceAreas,
        services_offered: PILOT_CONFIG.services,
        business_hours: PILOT_CONFIG.businessHours,
        emergency_service_enabled: PILOT_CONFIG.emergencyService,
        after_hours_instructions: PILOT_CONFIG.afterHoursPolicy,
        transfer_instructions: PILOT_CONFIG.transferInstructions,
      })
      .eq('business_id', businessId);

    if (settingsUpdateErr) {
      console.error('[SeedPilotAccount] Failed to update business_settings:', settingsUpdateErr);
    } else {
      console.log('[SeedPilotAccount] Updated pilot business_settings successfully.');
    }
  } else {
    const { error: settingsInsertErr } = await admin
      .from('business_settings')
      .insert({
        business_id: businessId,
        service_areas: PILOT_CONFIG.serviceAreas,
        supported_zips: ['75093', '75080'],
        services_offered: PILOT_CONFIG.services,
        business_hours: PILOT_CONFIG.businessHours,
        emergency_service_enabled: PILOT_CONFIG.emergencyService,
        after_hours_instructions: PILOT_CONFIG.afterHoursPolicy,
        transfer_instructions: PILOT_CONFIG.transferInstructions,
      });

    if (settingsInsertErr) {
      console.error('[SeedPilotAccount] Failed to insert business_settings:', settingsInsertErr);
    } else {
      console.log('[SeedPilotAccount] Inserted pilot business_settings successfully.');
    }
  }
}

if (require.main === module) {
  seedPilotAccount()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SeedPilotAccount] Error:', err);
      process.exit(1);
    });
}
