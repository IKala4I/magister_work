# UI review checklist (standing — applies to every PR touching apps/mobile UI)

The lint rule (eslint.config.mjs, decision 6) mechanically catches raw JSX text,
string-literal children, and template-literal children. The items below are what the linter
CANNOT catch — check them by reading the diff.

## i18n (decision 6)

- [ ] No user-facing string-valued **props**: `accessibilityLabel`, `accessibilityHint`,
      `placeholder`, `title`, `label`, `headerTitle`, alert/toast text — all must be
      `t('…')` calls.
- [ ] New strings added to `src/i18n/en.ts` with stable, namespaced keys; interpolation via
      `{param}` slots, never string concatenation.
- [ ] Dates/numbers destined for users are formatted, not `String()`-ed (locale rules land
      with the second catalog).

## File 02 §3 semantics (invariant 14)

- [ ] Skip/empty states never use `danger` (skip is never red; no guilt UI).
- [ ] Glass (`GlassPanel`) appears only in the recommendation layer.
- [ ] New colors/sizes come from `src/ui/tokens/`, not inline hex/px.
- [ ] Touch targets ≥44 px; primary actions in the bottom 60% where feasible.
- [ ] Any new animation uses the motion tokens and collapses under reduced motion.
- [ ] Destructive actions are undoable for 6 s (`UNDO_WINDOW_SECONDS`).

## Accessibility (NFR-A1/A2)

- [ ] Interactive elements have roles + labels; grouped cards compose their full content
      into the label (see ConfidenceBlock).
- [ ] Text uses `ThemedText` (scaling capped at 200%, never disabled).
- [ ] Information conveyed by color/opacity is also available textually.
