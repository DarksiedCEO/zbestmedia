import { createHash } from 'crypto';

/**
 * Deterministic ID for Brand based on tenantId and brand name.
 */
export function generateBrandId(tenantId: string, name: string): string {
  const input = `${tenantId}:${name.toLowerCase().trim()}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 24);
}

/**
 * Deterministic ID for Tenant based on name.
 */
export function generateTenantId(name: string): string {
  return createHash('sha256').update(name.toLowerCase().trim()).digest('hex').substring(0, 24);
}

/**
 * Event IDs can be random or based on requestId, 
 * but for audit events we might want them to be unique.
 */
export function generateEventId(): string {
  return createHash('sha256').update(Math.random().toString() + Date.now().toString()).digest('hex').substring(0, 24);
}

/**
 * Deterministic ID for events based on stable inputs.
 */
export function makeEventId(input: { tenantId: string; brandId?: string; eventType: string }): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').substring(0, 24);
}
