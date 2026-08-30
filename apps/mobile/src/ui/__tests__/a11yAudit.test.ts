/**
 * NFR-A1 / NFR-A2 source-level audit (P10, ADR-0014 §11) — the mechanical half of the WCAG 2.2
 * AA evidence in docs/verification/p10-a11y-audit.md. What a screen reader or a font-scale
 * sweep on a device would catch structurally is checked here on every commit:
 *   • every pressable in app/ and src/ui carries an accessibilityRole (a role is what VoiceOver
 *     and TalkBack announce; a bare Pressable is "unlabelled element");
 *   • no raw <Text> outside the primitives — ThemedText caps font scaling at 200 % and never
 *     disables it (NFR-A2), so text that bypasses it is a layout-breakage risk;
 *   • every text/surface pairing of BOTH palettes meets AA (body 4.5:1; large/UI 3:1);
 *   • Switches carry a label (the OS reads "switch, on/off" — nothing else without one).
 * Device-conditioned items (reading order, real font scaling, Doze) stay on device-checklist.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { contrastRatio, WCAG_AA_BODY, WCAG_AA_LARGE } from '../tokens/contrast';
import { darkColors, lightColors } from '../tokens/colors';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN_DIRS = [path.join(ROOT, 'app'), path.join(ROOT, 'src', 'ui')];
/** Primitives wrap RN Text/Pressable themselves and expose roles/labels through props. */
const PRIMITIVES_DIR = path.join(ROOT, 'src', 'ui', 'primitives');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') walk(p, out);
    } else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(d));

/** Opening JSX tags of `tag` with their attribute text (multi-line, until the first `>`). */
function openingTags(source: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gs');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1] ?? '');
  return out;
}

describe('a11y source audit (NFR-A1)', () => {
  it('scans the shipped screens and UI components', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('every Pressable / TouchableOpacity in app/ and src/ui carries an accessibilityRole', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.startsWith(PRIMITIVES_DIR) && path.basename(f) === 'Button.tsx') continue; // has one
      const src = readFileSync(f, 'utf8');
      for (const tag of ['Pressable', 'TouchableOpacity', 'TouchableHighlight']) {
        for (const attrs of openingTags(src, tag)) {
          if (!/accessibilityRole=/.test(attrs) && !/\{\.\.\.(rest|props)\}/.test(attrs)) {
            offenders.push(
              `${path.relative(ROOT, f)}: <${tag}${attrs.slice(0, 60).replace(/\s+/g, ' ')}…>`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every Switch carries an accessibilityLabel', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const attrs of openingTags(src, 'Switch')) {
        if (!/accessibilityLabel=/.test(attrs)) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no raw <Text> outside the primitives (ThemedText caps scaling at 200 %, never off)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.startsWith(PRIMITIVES_DIR)) continue;
      const src = readFileSync(f, 'utf8');
      if (openingTags(src, 'Text').length > 0) offenders.push(path.relative(ROOT, f));
      if (/allowFontScaling=\{?false/.test(src))
        offenders.push(`${path.relative(ROOT, f)} (allowFontScaling=false)`);
    }
    expect(offenders).toEqual([]);
  });

  it('ThemedText keeps font scaling on with the 200 % cap (NFR-A2)', () => {
    const src = readFileSync(path.join(PRIMITIVES_DIR, 'ThemedText.tsx'), 'utf8');
    expect(src).toMatch(/maxFontSizeMultiplier=\{MAX_FONT_SCALE\}/);
    expect(src).not.toMatch(/allowFontScaling=\{?false/);
  });
});

describe('contrast matrix (WCAG 2.2 AA, both palettes) — the rules the UI follows', () => {
  const palettes = { light: lightColors, dark: darkColors } as const;
  for (const [name, c] of Object.entries(palettes)) {
    it(`${name}: body text on the surface and on the primary container ≥ ${WCAG_AA_BODY}:1`, () => {
      expect(contrastRatio(c.textPrimary, c.surface)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
      expect(contrastRatio(c.textPrimary, c.primaryContainer)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
      expect(contrastRatio(c.textSecondary, c.surface)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
    });
    it(`${name}: secondary text on the primary container is large-text only (≥ ${WCAG_AA_LARGE}:1) — captions on banners use the primary tone`, () => {
      // dark: 4.36:1 (P10 audit) — below body AA, above large-text AA; banners use tone="primary"
      expect(contrastRatio(c.textSecondary, c.primaryContainer)).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });
    it(`${name}: primary and danger as text/icons on the surface ≥ ${WCAG_AA_LARGE}:1`, () => {
      expect(contrastRatio(c.primary, c.surface)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      expect(contrastRatio(c.danger, c.surface)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });
    it(`${name}: on-primary button text ≥ ${WCAG_AA_BODY}:1 (white in light, the dark surface in dark)`, () => {
      const onPrimary = name === 'dark' ? c.surface : '#FFFFFF';
      expect(contrastRatio(onPrimary, c.primary)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
    });
  }
  it('accent colours (success, warning, energy) are never text — the source uses them as fills only', () => {
    // light success 2.4:1, warning 2.7:1, energyHigh 2.1:1 on the surface (P10 audit): fine for
    // fills with a text alternative (heatmap), never for body text (1.4.3)
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (/color:\s*(theme\.)?colors\.(success|warning|energyHigh|energyLow)\b/.test(line)) {
          // a `color:` (text) assignment from an accent token; backgroundColor/borderColor are fills
          if (!/backgroundColor|borderColor/.test(line))
            offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
