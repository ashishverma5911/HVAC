const UNTRUSTED_TENANT_KEYS = [
  'business_id',
  'businessId',
  'contractor_id',
  'contractorId',
  'tenant_id',
  'tenantId',
  'organization_id',
  'organizationId',
  'businessConfig',
  'contractorConfig',
  'tenantConfig',
  'overrideConfig',
  'systemInstruction',
] as const;

/**
 * Strips any client-supplied or LLM-supplied tenant/contractor identifiers or configuration
 * overrides from an input object (including nested objects and arrays). Server routes and tool
 * executors must ALWAYS derive contractor identity and configuration from the authenticated session
 * or server-verified phone routing table, never from browser or caller payloads.
 */
export function stripUntrustedTenantIds<T extends Record<string, unknown>>(
  payload: T,
  depth: number = 0
): T {
  if (!payload || typeof payload !== 'object' || depth > 5) {
    return payload;
  }

  const sanitized = { ...payload } as Record<string, unknown>;
  for (const key of UNTRUSTED_TENANT_KEYS) {
    delete sanitized[key];
    delete (payload as Record<string, unknown>)[key];
  }

  for (const [k, val] of Object.entries(sanitized)) {
    if (Array.isArray(val)) {
      sanitized[k] = val.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUntrustedTenantIds(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else if (val && typeof val === 'object') {
      sanitized[k] = stripUntrustedTenantIds(val as Record<string, unknown>, depth + 1);
    }
  }

  return sanitized as T;
}
