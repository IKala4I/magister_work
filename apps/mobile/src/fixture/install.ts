/**
 * Screenshot fixture entry (clock.ts explains the mode). Imported first by the root layout, so
 * the clock is shifted before any other module reads it; in every other build both functions
 * are no-ops behind the inlined `false`.
 */
import type { LocalDb } from '../db/writes';

import { installFixtureClock, SCREENSHOT_FIXTURE } from './clock';

if (SCREENSHOT_FIXTURE) installFixtureClock();

let seeded = false;

/** Seed the demo day once per process, after the migrations and before the first screen. */
export function seedFixtureOnce(db: LocalDb): void {
  if (!SCREENSHOT_FIXTURE || seeded) return;
  seeded = true;
  // required lazily: the seed and its JSON are never evaluated outside the fixture build
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  (require('./seed') as typeof import('./seed')).seedFixture(db);
}
