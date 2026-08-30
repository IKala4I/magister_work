/**
 * Analytics gating (NFR-O1 event half, NFR-S2): PostHog constructs only when BOTH
 * the api key and the host env vars are present — a key without a host must stay
 * disabled, because posthog-react-native falls back to the US cloud when host is
 * omitted and NFR-S2 requires the EU instance. GeoIP stays off. The typed catalog
 * pins the NFR-O1 model-version tag on recommendation events at compile time (the
 * @ts-expect-error assertions below are enforced by `pnpm typecheck`).
 */
const mockCtor = jest.fn();
const mockCapture = jest.fn();
const mockOptOut = jest.fn(() => Promise.resolve());

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: class PostHogMock {
    constructor(apiKey: string, options: Record<string, unknown>) {
      mockCtor(apiKey, options);
    }
    capture = mockCapture;
    optOut = mockOptOut;
  },
}));

import { appStorage, StorageKeys } from '../../storage/mmkv';
import { initAnalytics, isAnalyticsEnabled, setAnalyticsEnabled, track } from '../analytics';
import type { AnalyticsEvents } from '../events';

const KEY = 'phc_test_key';
const EU_HOST = 'https://eu.i.posthog.com';

type EnvName = 'EXPO_PUBLIC_POSTHOG_API_KEY' | 'EXPO_PUBLIC_POSTHOG_HOST';
const ENV_NAMES: EnvName[] = ['EXPO_PUBLIC_POSTHOG_API_KEY', 'EXPO_PUBLIC_POSTHOG_HOST'];

function withEnv(env: Record<EnvName, string | undefined>, run: () => void): void {
  const previous: Record<EnvName, string | undefined> = {
    EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  };
  const apply = (values: Record<EnvName, string | undefined>) => {
    for (const name of ENV_NAMES) {
      const value = values[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(env);
  try {
    run();
  } finally {
    apply(previous);
  }
}

afterEach(() => {
  // Leave the module disabled so state never leaks between tests.
  withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: undefined, EXPO_PUBLIC_POSTHOG_HOST: undefined }, () => {
    initAnalytics();
  });
  jest.clearAllMocks();
});

describe('initAnalytics (env-gated, NFR-S2)', () => {
  it('stays disabled when both env vars are absent', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: undefined, EXPO_PUBLIC_POSTHOG_HOST: undefined }, () => {
      expect(initAnalytics()).toBe(false);
      expect(isAnalyticsEnabled()).toBe(false);
      expect(mockCtor).not.toHaveBeenCalled();
    });
  });

  it('stays disabled when the key is present but the host is absent (never the US default)', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: undefined }, () => {
      expect(initAnalytics()).toBe(false);
      expect(isAnalyticsEnabled()).toBe(false);
      expect(mockCtor).not.toHaveBeenCalled();
    });
  });

  it('constructs with the exact env host and GeoIP disabled when both are present', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: EU_HOST }, () => {
      expect(initAnalytics()).toBe(true);
      expect(isAnalyticsEnabled()).toBe(true);
      expect(mockCtor).toHaveBeenCalledTimes(1);
      expect(mockCtor).toHaveBeenCalledWith(KEY, {
        host: EU_HOST,
        disableGeoip: true,
        captureAppLifecycleEvents: false,
      });
    });
  });

  it('re-running init with vars gone disables a previously enabled client', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: EU_HOST }, () => {
      initAnalytics();
    });
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: undefined, EXPO_PUBLIC_POSTHOG_HOST: undefined }, () => {
      expect(initAnalytics()).toBe(false);
      track('task_created', {
        source: 'form',
        nl_parse_used: false,
        has_deadline: false,
        has_duration: false,
      });
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });
});

describe('track', () => {
  it('is a safe no-op while disabled', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: undefined, EXPO_PUBLIC_POSTHOG_HOST: undefined }, () => {
      initAnalytics();
      expect(() =>
        track('task_created', {
          source: 'quick_add',
          nl_parse_used: true,
          has_deadline: true,
          has_duration: false,
        }),
      ).not.toThrow();
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  it('forwards the event name and typed properties when enabled', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: EU_HOST }, () => {
      initAnalytics();
      track('recommendation_shown', {
        model_version: 'heuristic-v0',
        engine: 'heuristic',
        is_experiment: false,
      });
      expect(mockCapture).toHaveBeenCalledWith('recommendation_shown', {
        model_version: 'heuristic-v0',
        engine: 'heuristic',
        is_experiment: false,
      });
    });
  });
});

describe('typed catalog (compile-time, enforced by pnpm typecheck)', () => {
  it('rejects recommendation events without the NFR-O1 model tag and unknown events', () => {
    // @ts-expect-error — recommendation_shown without model_version/engine must not compile
    const missingTag: AnalyticsEvents['recommendation_shown'] = { is_experiment: false };
    void missingTag;

    const emitUnknown = () => {
      // @ts-expect-error — events outside the catalog must not compile
      track('totally_unknown_event', {});
    };
    void emitUnknown;
    expect(true).toBe(true);
  });
});

describe('opt-out (P10, ADR-0014 §12)', () => {
  afterEach(() => appStorage.delete(StorageKeys.analyticsOptOut));
  it('the MMKV flag wins over present keys: no client is constructed', () => {
    appStorage.set(StorageKeys.analyticsOptOut, '1');
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: EU_HOST }, () => {
      expect(initAnalytics()).toBe(false);
      expect(isAnalyticsEnabled()).toBe(false);
      expect(mockCtor).not.toHaveBeenCalled();
    });
  });
  it('switching off sends the toggle event last and drops the client; switching on re-inits', () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_API_KEY: KEY, EXPO_PUBLIC_POSTHOG_HOST: EU_HOST }, () => {
      expect(initAnalytics()).toBe(true);
      expect(setAnalyticsEnabled(false)).toBe(false);
      expect(mockCapture).toHaveBeenLastCalledWith('privacy_toggled', {
        sdk: 'analytics',
        enabled: false,
      });
      expect(mockOptOut).toHaveBeenCalledTimes(1); // the live instance is opted out, not just dropped
      expect(mockCtor.mock.calls[0]![1]).toEqual(
        expect.objectContaining({ captureAppLifecycleEvents: false }),
      );
      expect(isAnalyticsEnabled()).toBe(false);
      track('task_created', {
        source: 'form',
        nl_parse_used: false,
        has_deadline: false,
        has_duration: false,
      });
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(setAnalyticsEnabled(true)).toBe(true);
      expect(isAnalyticsEnabled()).toBe(true);
    });
  });
});
