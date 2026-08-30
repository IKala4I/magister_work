/**
 * Backend-key checks shared by every function that pg_cron or the operator calls with
 * `x-service-key` (attribute-rewards, gcal-webhook, delete-account). Constant-time compare;
 * an empty or missing configured key never matches (P10 adversarial #7).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only when a non-empty key is configured and the presented one equals it. */
export function serviceKeyMatches(configured: string | null, presented: string | null): boolean {
  if (configured === null || configured.length === 0) return false;
  if (presented === null || presented.length === 0) return false;
  return constantTimeEqual(presented, configured);
}
