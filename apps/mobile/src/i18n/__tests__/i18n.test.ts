/**
 * i18n scaffolding (decision 6): typed catalog access, locale resolution with an English
 * fallback, and visible-on-miss interpolation.
 */
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

import { getLocales } from 'expo-localization';

import { en } from '../en';
import { t, resolveLocale, interpolate, resetLocaleForTests } from '../index';

const mockedGetLocales = getLocales as jest.Mock;

afterEach(() => {
  resetLocaleForTests();
  mockedGetLocales.mockReturnValue([{ languageCode: 'en' }]);
});

describe('locale resolution', () => {
  it('picks English for an English device', () => {
    expect(resolveLocale(['en'])).toBe('en');
  });

  it('falls back to English for locales without a catalog (uk, de, null)', () => {
    expect(resolveLocale(['uk'])).toBe('en');
    expect(resolveLocale(['de', null])).toBe('en');
    expect(resolveLocale([])).toBe('en');
  });

  it('t() works on a non-English device via the fallback', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'uk' }]);
    expect(t('tabs.today')).toBe(en['tabs.today']);
  });
});

describe('interpolation', () => {
  it('fills {slots} from params', () => {
    expect(interpolate('Confidence {percent} percent', { percent: 82 })).toBe(
      'Confidence 82 percent',
    );
  });

  it('leaves missing params visible instead of erasing them', () => {
    expect(interpolate('Confidence {percent} percent')).toBe('Confidence {percent} percent');
  });

  it('t() interpolates catalog entries', () => {
    expect(t('block.confidence.a11y', { percent: 40 })).toBe('Confidence 40 percent');
  });
});

describe('catalog hygiene', () => {
  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(key.trim()).toBe(key);
    }
  });

  it('every {slot} in the catalog is a word-character name', () => {
    for (const value of Object.values(en)) {
      for (const match of value.matchAll(/\{([^}]*)\}/g)) {
        expect(match[1]).toMatch(/^\w+$/);
      }
    }
  });
});
