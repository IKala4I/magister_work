/**
 * Screenshot fixture (рис. 3.4 and the poster; docs/thesis/screenshots/README.md) — the flag and
 * the clock. Built only with EXPO_PUBLIC_SCREENSHOT_FIXTURE=1 and no backend keys: the app runs
 * local-only on invented data, so nothing here reaches a server and nothing here is evidence.
 *
 * The clock: the status bar is pinned at 09:41 (`simctl status_bar`), so the app's own "now"
 * starts at 09:41 today as well — otherwise the Today "Now" marker, the lapse scan and the Focus
 * timer would disagree with the status bar by however late in the day the shots were taken.
 * `Date` is swapped for a constructor that returns ordinary Date objects shifted by a fixed
 * offset (the mockdate pattern), so `instanceof Date` and every Intl formatter still work.
 */

/** Babel inlines EXPO_PUBLIC_* at bundle time: in any other build this is the constant false. */
export const SCREENSHOT_FIXTURE = process.env.EXPO_PUBLIC_SCREENSHOT_FIXTURE === '1';

/** Local wall-clock time the fixture day starts at (the status bar's 09:41). */
export const FIXTURE_START = { hour: 9, minute: 41 } as const;

let realDate: DateConstructor | null = null;

/** Shift the JS clock so that "now" is 09:41 today; idempotent. */
export function installFixtureClock(realNow: number = Date.now()): number {
  if (realDate !== null) return 0;
  const RealDate = Date;
  realDate = RealDate;
  const target = new RealDate(realNow);
  target.setHours(FIXTURE_START.hour, FIXTURE_START.minute, 0, 0);
  const offset = target.getTime() - realNow;
  function FixtureDate(this: unknown, ...args: unknown[]): unknown {
    // called without `new` → a string, like Date() itself
    if (!(this instanceof RealDate)) return new RealDate(RealDate.now() + offset).toString();
    return args.length === 0
      ? new RealDate(RealDate.now() + offset)
      : new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
  }
  FixtureDate.prototype = RealDate.prototype;
  FixtureDate.now = () => RealDate.now() + offset;
  FixtureDate.parse = RealDate.parse;
  FixtureDate.UTC = RealDate.UTC;
  (globalThis as { Date: unknown }).Date = FixtureDate;
  return offset;
}

/** Put the real clock back (tests only — the fixture build never uninstalls). */
export function uninstallFixtureClock(): void {
  if (realDate === null) return;
  (globalThis as { Date: unknown }).Date = realDate;
  realDate = null;
}
