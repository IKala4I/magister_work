/**
 * i18n (decision 6, ADR-0023): typed catalog access, catalog parity, locale resolution from the
 * device plus an explicit preference, Ukrainian plural forms, and the formatting locale.
 *
 * The hygiene and parity suites run over EVERY catalog, not just English — a Ukrainian string
 * with a mistyped slot or a missing key is exactly the defect they exist to catch.
 */
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }]),
}));

const mockStore = new Map<string, string>();
jest.mock('../../storage/mmkv', () => ({
  appStorage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v),
  },
  StorageKeys: { language: 'ui.language' },
}));

import { getLocales } from 'expo-localization';

import { en, enPlurals } from '../en';
import {
  CATALOGS,
  interpolate,
  localeTag,
  plural,
  pluralForm,
  resetLocaleForTests,
  resolveLocale,
  setActiveLocale,
  t,
} from '../index';
import { uk, ukPlurals } from '../uk';

const mockedGetLocales = getLocales as jest.Mock;
const ENGLISH_DEVICE = [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }];
const UKRAINIAN_DEVICE = [{ languageCode: 'uk', languageTag: 'uk-UA', regionCode: 'UA' }];

afterEach(() => {
  resetLocaleForTests();
  mockStore.clear();
  mockedGetLocales.mockReturnValue(ENGLISH_DEVICE);
});

describe('locale resolution', () => {
  it('follows the device when the preference is system', () => {
    expect(resolveLocale(['en'])).toBe('en');
    expect(resolveLocale(['uk'])).toBe('uk');
    // A device that reports a region-tagged code must still find the catalog; the earlier version
    // of this line sliced the tag down to 'uk' first and so tested nothing (adversarial pass).
    expect(resolveLocale(['uk-UA'])).toBe('uk');
    expect(resolveLocale(['en-GB'])).toBe('en');
    expect(resolveLocale(['de-DE'])).toBe('en');
  });

  it('falls back to English for languages without a catalog', () => {
    expect(resolveLocale(['de', null])).toBe('en');
    expect(resolveLocale([])).toBe('en');
  });

  it('an explicit choice outranks the device in both directions', () => {
    expect(resolveLocale(['en'], 'uk')).toBe('uk');
    expect(resolveLocale(['uk'], 'en')).toBe('en');
    expect(resolveLocale(['de'], 'uk')).toBe('uk');
  });

  it('t() renders Ukrainian on a Ukrainian device with no stored choice', () => {
    mockedGetLocales.mockReturnValue(UKRAINIAN_DEVICE);
    expect(t('tabs.today')).toBe(uk['tabs.today']);
    expect(t('tabs.today')).not.toBe(en['tabs.today']);
  });

  it('a stored choice survives a cold start before any store mounts', () => {
    mockStore.set('ui.language', 'uk');
    mockedGetLocales.mockReturnValue(ENGLISH_DEVICE);
    expect(t('tabs.today')).toBe(uk['tabs.today']);
  });

  it('ignores a stored value that is not a language preference', () => {
    mockStore.set('ui.language', 'klingon');
    expect(t('tabs.today')).toBe(en['tabs.today']);
  });
});

describe('formatting locale (language from the catalog, conventions from the phone)', () => {
  it('uses the device tag when the phone already speaks the active language', () => {
    expect(localeTag()).toBe('en-US');
    resetLocaleForTests();
    mockedGetLocales.mockReturnValue(UKRAINIAN_DEVICE);
    expect(localeTag()).toBe('uk-UA');
  });

  it('falls back to the language default when the device tag is malformed', () => {
    // An OEM ROM reporting `uk_UA` used to reach `Intl` and throw a RangeError during render.
    mockedGetLocales.mockReturnValue([
      { languageCode: 'uk', languageTag: 'uk_UA', regionCode: 'UA' },
    ]);
    setActiveLocale('uk');
    expect(localeTag()).toBe('uk-UA');
    expect(() => new Date().toLocaleDateString(localeTag())).not.toThrow();
  });

  it('reads the device locale once per language, not once per formatted date', () => {
    // A FlashList of blocks formats two clock times per row; before memoisation each one was a
    // native `getLocales()` call (adversarial pass, 2026-09-09).
    localeTag();
    mockedGetLocales.mockClear();
    localeTag();
    localeTag();
    localeTag();
    expect(mockedGetLocales).not.toHaveBeenCalled();
    // …and a language change invalidates it.
    setActiveLocale('uk');
    localeTag();
    expect(mockedGetLocales).toHaveBeenCalled();
  });

  it('falls back to the language default when device and app disagree', () => {
    mockedGetLocales.mockReturnValue(UKRAINIAN_DEVICE);
    setActiveLocale('en');
    // en-GB, not en-US: the app writes its own times in 24-hour form, and this phone never
    // asked for a 12-hour clock.
    expect(localeTag()).toBe('en-GB');
    setActiveLocale('uk');
    mockedGetLocales.mockReturnValue(ENGLISH_DEVICE);
    expect(localeTag()).toBe('uk-UA');
  });
});

describe('plural forms', () => {
  it('English has two integer forms', () => {
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 0)).toBe('other');
    expect(pluralForm('en', 2)).toBe('other');
    expect(pluralForm('en', 21)).toBe('other');
  });

  // CLDR uk: one 1/21/31…, few 2–4/22–24…, many 0/5–20/25–30…
  it.each([
    [1, 'one'],
    [21, 'one'],
    [31, 'one'],
    [2, 'few'],
    [4, 'few'],
    [22, 'few'],
    [0, 'many'],
    [5, 'many'],
    [11, 'many'],
    [12, 'many'],
    [14, 'many'],
    [19, 'many'],
    [25, 'many'],
  ])('Ukrainian %i takes the %s form', (count, form) => {
    expect(pluralForm('uk', count)).toBe(form);
  });

  it('non-integers fall to other in both languages', () => {
    expect(pluralForm('uk', 1.5)).toBe('other');
    expect(pluralForm('en', 1.5)).toBe('other');
  });

  it('plural() supplies {count} and honours other slots', () => {
    expect(plural('settings.sync.pending', 3)).toBe(
      enPlurals['settings.sync.pending'].other.replace('{count}', '3'),
    );
    expect(plural('review.adherence.week', 5, { percent: 80 })).toContain('80');
  });

  it('the three Ukrainian forms are genuinely different sentences', () => {
    setActiveLocale('uk');
    const one = plural('settings.sync.pending', 1);
    const few = plural('settings.sync.pending', 3);
    const many = plural('settings.sync.pending', 7);
    expect(new Set([one, few, many]).size).toBe(3);
    expect(one).toBe('1 зміна чекає');
    expect(few).toBe('3 зміни чекають');
    expect(many).toBe('7 змін чекає');
  });
});

describe('catalog parity and hygiene (every catalog)', () => {
  const catalogs = Object.entries(CATALOGS);

  it.each(catalogs)('%s has exactly the English key set', (_name, catalog) => {
    expect(Object.keys(catalog.messages).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(catalog.plurals).sort()).toEqual(Object.keys(enPlurals).sort());
  });

  it.each(catalogs)('%s has no empty strings', (_name, catalog) => {
    for (const [key, value] of Object.entries(catalog.messages)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(key.trim()).toBe(key);
    }
    for (const forms of Object.values(catalog.plurals)) {
      for (const value of Object.values(forms)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(catalogs)('%s uses the same interpolation slots as English', (_name, catalog) => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      // `rationale.energy_peak` carries an optional `{percent}` suffix built by the caller;
      // every other entry must offer the same slots the English sentence does.
      expect(slots(catalog.messages[key])).toEqual(slots(en[key]));
    }
  });

  // Counted sentences were not slot-checked at all, so a typo like `{tme}` in a Ukrainian plural
  // form would have rendered literally on screen (adversarial pass, 2026-09-09). Each form must
  // offer every slot the family's English `other` does, plus `{count}` where the form uses it.
  it.each(catalogs)('%s plural forms carry the English slots', (_name, catalog) => {
    for (const key of Object.keys(enPlurals) as (keyof typeof enPlurals)[]) {
      const required = slots(enPlurals[key].other).filter((slot) => slot !== 'count');
      for (const [form, value] of Object.entries(catalog.plurals[key])) {
        expect({ key, form, slots: slots(value) }).toMatchObject({
          slots: expect.arrayContaining(required),
        });
        for (const slot of slots(value)) {
          expect([...required, 'count']).toContain(slot);
        }
      }
    }
  });

  it.each(catalogs)('%s writes every {slot} with word characters only', (_name, catalog) => {
    for (const value of Object.values(catalog.messages)) {
      for (const match of value.matchAll(/\{([^}]*)\}/g)) {
        expect(match[1]).toMatch(/^\w+$/);
      }
    }
  });

  it('Ukrainian supplies all three integer forms for every counted sentence', () => {
    for (const [key, forms] of Object.entries(ukPlurals)) {
      expect({ key, ...forms }).toMatchObject({
        one: expect.any(String),
        few: expect.any(String),
        many: expect.any(String),
        other: expect.any(String),
      });
    }
  });

  it('the instrument stays English in every catalog (ADR-0023)', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (key.startsWith('onboarding.rmeq.')) expect(uk[key]).toBe(en[key]);
    }
  });

  // «зробив/зробила», «додав/додала» … — the app cannot know the reader's gender.
  // `\b` and `\w` are ASCII-only in JavaScript, so the first version of this test could not
  // match Cyrillic at all and would have passed on «я зробив» (adversarial pass, 2026-09-09).
  const GENDERED_PAST = /(?:^|\P{L})я\s+\p{L}+(?:в|ла)(?:\P{L}|$)/iu;
  const GENDERED_PAST_INVERTED = /(?:^|\P{L})\p{L}+(?:в|ла)\s+(?:я|сам|сама)(?:\P{L}|$)/iu;

  it('the gendered-past-tense guard actually matches Cyrillic', () => {
    expect('я зробив').toMatch(GENDERED_PAST);
    expect('Я додала це').toMatch(GENDERED_PAST);
    expect('зробила я').toMatch(GENDERED_PAST_INVERTED);
    expect('Уже зроблено').not.toMatch(GENDERED_PAST);
    expect('Ви це закріпили.').not.toMatch(GENDERED_PAST);
  });

  it('no Ukrainian string uses a gendered first-person past form', () => {
    for (const [key, value] of Object.entries(uk)) {
      expect({ key, value }).toMatchObject({ value: expect.not.stringMatching(GENDERED_PAST) });
      expect({ key, value }).toMatchObject({
        value: expect.not.stringMatching(GENDERED_PAST_INVERTED),
      });
    }
    for (const forms of Object.values(ukPlurals)) {
      for (const value of Object.values(forms)) {
        expect(value).not.toMatch(GENDERED_PAST);
      }
    }
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
