#!/usr/bin/env node
/**
 * Generates docs/i18n/uk-copy-review.md — the Ukrainian copy grouped by screen, so it can be
 * read as copy rather than out of a diff. Regenerate after any catalog edit:
 *
 *   node scripts/i18n-copy-review.mjs && pnpm format
 *
 * The `pnpm format` is not optional: prettier re-pads the markdown tables, so without it the
 * committed file and a fresh run differ by several hundred lines of whitespace and the doc stops
 * being checkably generated.
 *
 * Reading the catalogs with a regex rather than importing them keeps this a plain node script
 * with no TypeScript toolchain in the way; the parity test in src/i18n/__tests__ is what
 * guarantees the two files hold the same keys.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = (name) => resolve(root, 'apps/mobile/src/i18n', name);

/** Flat `'key': 'value'` pairs, including values wrapped onto the next line by prettier. */
function readCatalog(file) {
  const src = readFileSync(file, 'utf8');
  const out = new Map();
  const re = /^\s*'([A-Za-z0-9_.-]+)':\s*\n?\s*'((?:[^'\\]|\\.)*)'/gm;
  let m;
  while ((m = re.exec(src))) out.set(m[1], m[2].replace(/\\'/g, "'"));
  return out;
}

/** Plural families: `'key': { one: '…', few: '…', … }`. */
function readPlurals(file) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf('Plurals = {');
  if (start < 0) return new Map();
  const body = src.slice(start);
  const out = new Map();
  const re = /'([A-Za-z0-9_.-]+)':\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const forms = new Map();
    const fre = /(one|few|many|other):\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;
    let f;
    while ((f = fre.exec(m[2]))) forms.set(f[1], f[2].replace(/\\'/g, "'"));
    out.set(m[1], forms);
  }
  return out;
}

/** Word choices where the Ukrainian is not the literal English, and why. Hand-maintained. */
const TRADES = `## Where the Ukrainian is not the literal English

Written as Ukrainian copy first, then measured at the largest text size on the simulator. **No label
had to be shortened to fit** — the only tightness seen was the block action row putting
«Перенести…» on a second line, which is a wrap, not a clip. The choices below are about idiom, not
about width.

| English | Ukrainian | why not the literal one |
| --- | --- | --- |
| Insights | Аналітика | «Спостереження» / «Висновки» are both longer and read like a research report; «Аналітика» is what a Ukrainian app calls this tab. |
| Admin (category) | Рутина | «Адміністративні справи» is a phrase, not a chip. «Рутина» is what people actually call this pile of work. |
| I did it | Уже зроблено | «Я зробив» / «Я зробила» is gendered, and the app does not know the reader's gender. The impersonal form also keeps it distinct from «Готово» (Done). |
| Undo | Повернути | «Скасувати» is already Cancel elsewhere; «Повернути» says what the button does — brings the task back — and is one letter shorter. |
| Stop for now | Зупинити | «Зупинити поки що» is clumsy on a button; the "for now" is carried by the screen, which still shows the session. |
| Skip rating | Без оцінки | A noun phrase reads better under two rating rows than a second imperative «Пропустити оцінку», and it does not repeat the Skip action's word. |
| Fair (difficulty) | Помірне | «Справедливе» is the wrong sense of *fair* entirely; «Помірне» is the middle rung people expect. |
| Okay (energy) | Середня | Same reason: a middle rung, agreeing with «енергія». |
| Appearance | Вигляд | «Зовнішній вигляд» is the dictionary phrase and twice the width for nothing. |
| … percent | …% | English spells "percent" out for screen readers; Ukrainian «%» is read correctly by TTS, avoids a three-form plural, and is the written convention. **Worth a listen on a real phone** — it is the one place this trade could cost a screen-reader user. |
| {minutes} minutes focused of {planned} planned | У фокусі {minutes} хв із запланованих {planned} хв | Spelling both counts out would need two agreeing plurals in one sentence; the abbreviation avoids the agreement without inventing a rule. |
| No working hours today (ADR-0019 recorded «Сьогодні не робочий день») | Сьогодні неробочий день | The parked copy in ADR-0019 spelled the adjective as two words; one word is the standard orthography. |
`;

const en = readCatalog(CATALOG('en.ts'));
const uk = readCatalog(CATALOG('uk.ts'));
const enP = readPlurals(CATALOG('en.ts'));
const ukP = readPlurals(CATALOG('uk.ts'));

/** Screen groups, in the order a person meets them. First matching prefix wins. */
const GROUPS = [
  [
    'Onboarding — welcome',
    ['onboarding.welcome', 'onboarding.step', 'onboarding.continue', 'onboarding.skipStep'],
  ],
  ['Onboarding — the rhythm survey', ['onboarding.survey', 'onboarding.rmeq']],
  ['Onboarding — your hours', ['onboarding.hours']],
  ['Onboarding — categories and first tasks', ['onboarding.categories', 'onboarding.seedTasks']],
  ['Sign in', ['auth.']],
  ['Tabs', ['tabs.']],
  ['Today — the plan', ['today.']],
  ['Today — a block and its actions', ['block.']],
  ['Today — why a block is here (FR-21)', ['rationale.', 'daypart.']],
  ['Today — the trade-off sheet (FR-24)', ['tradeoff.']],
  ['Today — the third-skip question (UC-04)', ['diagnostic.']],
  ['Inbox and quick add (FR-11)', ['inbox.']],
  ['A task', ['task.']],
  ['Focus (FR-30, FR-31)', ['focus.']],
  ['Insights — the energy map (FR-40)', ['heatmap.', 'weekday.']],
  ['Insights — what Hourwell believes (FR-41)', ['beliefs.']],
  ['Insights — the weekly review (FR-33)', ['review.', 'insights.']],
  ['Notifications the OS shows (FR-50, FR-26)', ['notify.']],
  ['Settings — language (ADR-0023)', ['settings.language']],
  ['Settings — everything else', ['settings.', 'gcal.']],
  ['Erasure and the rest', ['accountDeleted.', 'db.', 'common.', 'app.']],
];

function groupOf(key) {
  for (const [name, prefixes] of GROUPS) {
    if (prefixes.some((p) => key.startsWith(p))) return name;
  }
  return 'Ungrouped';
}

const buckets = new Map(GROUPS.map(([name]) => [name, []]));
buckets.set('Ungrouped', []);
for (const key of en.keys()) buckets.get(groupOf(key)).push(key);

const esc = (s) => s.replace(/\|/g, '\\|');
const lines = [];
lines.push('# Ukrainian copy, by screen');
lines.push('');
lines.push(
  '> Generated by `node scripts/i18n-copy-review.mjs` from `apps/mobile/src/i18n/{en,uk}.ts`.',
);
lines.push('> Read this rather than the diff: the catalogs are one flat file each, but a reader');
lines.push('> meets the strings a screen at a time. Edit the catalogs, then regenerate.');
lines.push('');
lines.push(`${en.size} strings plus ${enP.size} counted sentences.`);
lines.push('');
lines.push(TRADES);
lines.push('');

for (const [name] of [...GROUPS, ['Ungrouped']]) {
  const keys = buckets.get(name) ?? [];
  if (keys.length === 0) continue;
  lines.push(`## ${name}`);
  lines.push('');
  lines.push('| key | English | Українська |');
  lines.push('| --- | --- | --- |');
  for (const key of keys) {
    const e = en.get(key) ?? '';
    const u = uk.get(key) ?? '';
    const same = e === u ? ' _(unchanged, deliberately)_' : '';
    lines.push(`| \`${key}\` | ${esc(e)} | ${esc(u)}${same} |`);
  }
  const plurals = [...enP.keys()].filter((k) => groupOf(k) === name);
  if (plurals.length > 0) {
    lines.push('');
    lines.push('Counted sentences:');
    lines.push('');
    lines.push('| key | form | English | Українська |');
    lines.push('| --- | --- | --- | --- |');
    for (const key of plurals) {
      for (const form of ['one', 'few', 'many', 'other']) {
        const e = enP.get(key)?.get(form);
        const u = ukP.get(key)?.get(form);
        if (e === undefined && u === undefined) continue;
        lines.push(
          `| \`${key}\` | ${form} | ${e === undefined ? '—' : esc(e)} | ${u === undefined ? '—' : esc(u)} |`,
        );
      }
    }
  }
  lines.push('');
}

const outPath = resolve(root, 'docs/i18n/uk-copy-review.md');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${outPath}: ${en.size} strings, ${enP.size} plural families`);
