/**
 * Observability scaffolding: Sentry stays disabled without a DSN (env-gated, NFR-S2 —
 * nothing ships events until the EU org exists), never sends default PII, keeps tracing
 * off; startup marking is idempotent.
 */
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: unknown) => c,
}));

import * as SentrySdk from '@sentry/react-native';

import { initSentry } from '../sentry';
import { markFirstFrame, getStartupTiming } from '../startup';

const initMock = SentrySdk.init as jest.Mock;

describe('initSentry (env-gated)', () => {
  it('initializes disabled when EXPO_PUBLIC_SENTRY_DSN is absent', () => {
    expect(process.env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(initSentry()).toBe(false);
    expect(initMock).toHaveBeenCalledTimes(1);
    const options = initMock.mock.calls[0][0];
    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it('never sends default PII and keeps tracing off (NFR-S2)', () => {
    initSentry();
    const options = initMock.mock.calls.at(-1)[0];
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
  });

  it('initializes enabled when EXPO_PUBLIC_SENTRY_DSN is present', () => {
    // sentry.ts reads the env at module scope, so re-require in an isolated registry.
    const dsn = 'https://examplekey@o000000.ingest.de.sentry.io/0000000';
    process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
    try {
      let enabled: boolean | undefined;
      jest.isolateModules(() => {
        enabled = (jest.requireActual('../sentry') as typeof import('../sentry')).initSentry();
      });
      expect(enabled).toBe(true);
      const options = initMock.mock.calls.at(-1)[0];
      expect(options.enabled).toBe(true);
      expect(options.dsn).toBe(dsn);
      expect(options.sendDefaultPii).toBe(false);
      expect(options.tracesSampleRate).toBe(0);
    } finally {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    }
  });
});

describe('startup timing (NFR-P2 instrumentation)', () => {
  it('is null before the first frame, then a non-negative duration', () => {
    expect(getStartupTiming()).toBeNull();
    markFirstFrame();
    const timing = getStartupTiming();
    expect(timing).not.toBeNull();
    expect(timing?.jsStartToFirstFrameMs).toBeGreaterThanOrEqual(0);
  });

  it('marking again does not move the first-frame time', () => {
    markFirstFrame();
    const first = getStartupTiming();
    markFirstFrame();
    expect(getStartupTiming()).toEqual(first);
  });
});
