/**
 * Plural categories, hand-written per locale (CLDR plural rules for integers).
 *
 * Deliberately NOT `Intl.PluralRules`: Hermes builds its own ICU subset per platform, and a
 * grammatical rule that decides which sentence a user reads must not depend on which locale data
 * happened to ship with the engine. The rules below are the CLDR cardinal rules restricted to
 * integer counts, which is all the app ever passes.
 *
 * English has two forms (one/other); Ukrainian has four, of which three occur for integers:
 * one (1, 21, 31 …), few (2–4, 22–24 …), many (0, 5–20, 25–30 …). `other` is CLDR's fractional
 * category and is also the fallback when a catalog omits a form.
 */
export const PLURAL_FORMS = ['one', 'few', 'many', 'other'] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];

/** Every catalog supplies at least `other`; a locale's rule may never reach the forms it omits. */
export type PluralForms = Partial<Record<PluralForm, string>> & { other: string };

function englishForm(count: number): PluralForm {
  return count === 1 ? 'one' : 'other';
}

/**
 * CLDR `uk` cardinal rule for integers (v = 0):
 *   one  — i % 10 = 1 and i % 100 ≠ 11          (1 зміна, 21 зміна)
 *   few  — i % 10 = 2..4 and i % 100 ≠ 12..14   (2 зміни, 23 зміни)
 *   many — everything else                      (0 змін, 5 змін, 11 змін, 25 змін)
 */
function ukrainianForm(count: number): PluralForm {
  const i = Math.abs(Math.trunc(count));
  const mod10 = i % 10;
  const mod100 = i % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

const RULES = {
  en: englishForm,
  uk: ukrainianForm,
} as const;

export type PluralLocale = keyof typeof RULES;

/** The plural category `count` takes in `locale`; non-integers fall to `other` (CLDR). */
export function pluralForm(locale: PluralLocale, count: number): PluralForm {
  if (!Number.isInteger(count)) return 'other';
  return RULES[locale](count);
}

/** Picks the form a catalog actually supplies, falling back to `other`. */
export function selectPlural(forms: PluralForms, locale: PluralLocale, count: number): string {
  return forms[pluralForm(locale, count)] ?? forms.other;
}
