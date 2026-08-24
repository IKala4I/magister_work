/**
 * @hourwell/shared — types shared by the mobile client and Supabase Edge Functions.
 *
 * From P1 onward this package holds ONLY generated artifacts plus tiny hand-written
 * constants (specs/03 §1.1 "note on shared types"):
 *   - database.ts  — `supabase gen types typescript` output (committed, CI-diffed)
 *   - api.ts       — `openapi-typescript` output from the FastAPI spec (committed, CI-diffed)
 * Generated files are committed in their own chore(db)/chore(repo) commits.
 */
export * from './params';
export type { Database, Json } from './database';
