# Ukrainian interface — simulator sweep, 2026-09-09 (ADR-0023)

**What ran.** iPhone 16 simulator, iOS 18.3, Release build of `f5fff2f` + this branch's working
tree, installed by `npx expo run:ios --configuration Release`. Four Maestro flows, driven by
`docs/verification/uk-a11y-sweep.sh`:

| flow                      | text size          | what it does                                          |
| ------------------------- | ------------------ | ----------------------------------------------------- |
| `i18n-uk-onboard.yaml`    | medium             | onboarding to the tab shell, English, no keyboard     |
| `i18n-uk-switch.yaml`     | medium             | Settings → Мова → Українська                          |
| `i18n-uk-a11y-sweep.yaml` | accessibility-XXXL | Today, Focus, Insights, Settings ×3, Inbox, quick add |
| `i18n-uk-plan.yaml`       | accessibility-XXXL | a Ukrainian task → a real plan → block cards          |

All four passed. One throwaway anonymous account on the hosted project; one plan request.

**What it establishes.** The Ukrainian catalog renders on a real build, and on the swept surfaces
nothing clips or overlaps at the largest iOS text size.

**What it does not establish.** Anything about a physical device (CLAUDE.md "Simulator evidence").
The four `device-checklist.md` → "Ukrainian interface" rows stay open, and the NFR-A2 rows closed on
the Pixel 7a and the iPhone 12 were closed **in English** and do not transfer.

## Observations

1. **The block action row wraps rather than clips** (`uk-14-today-planned.png`). «Почати» «Готово»
   «Пропустити» sit on one line and «Перенести…» takes a second — which is the predicted +150 % on
   `Skip`→«Пропустити» showing up as a wrap. Readable, nothing cut off. This is the row already
   known to wrap on the iPhone 12 _in English_ (revisit.md), so it is the first thing to look at on
   hardware.
2. **FR-21 rationales read as Ukrainian sentences, not as translations.** «Експеримент: Рутина
   опівдні — щоб зрозуміти, як вам краще.» and «Рутина — по обіді ще майже не пробували.» The
   adverbial dayparts do the work the ADR expected: no case agreement, no reshuffling.
3. **The plural forms are right in the wild.** «Сьогодні не вмістилося 2 завдання — вони лишаються у
   Вхідних.» is the _few_ form, chosen by the locale rule rather than by a `count === 1` ternary.
4. **`Intl` gives Ukrainian month and weekday names on iOS.** The Today header reads «середа, 9
   вересня» (`formatDate` with `weekday: 'long'`, `month: 'long'`). That settles the iOS half of the
   Hermes locale-data question; **Android is untested** and stays on the checklist, because there
   `Intl` data comes from the OS.
5. **Ukrainian quick-add works on a real build**, not only in jest: «чернетка звіту 2 год» became a
   task titled «чернетка звіту» with a 120 хв estimate (`uk-12-inbox-parsed.png`), and «купити
   молоко» shows the honest hint instead of silence (`uk-11-inbox-no-parse.png`).
6. **The tab bar fits.** Сьогодні · Вхідні · Фокус · Аналітика, all four legible at XXXL.

## One correction to what was written before the run

**A language change does not throw the user out to Today.** ADR-0023 (as first drafted), the
explainer and the commit message for `f71a3f3` all said the remount returns the user to Today, by
analogy with the font-scale key. Measured (`uk-02-after-switch-still-in-settings.png`): expo-router
restores the route it was on, so the Settings modal stays open and re-renders in Ukrainian, scrolled
back to the top. That is better behaviour than what was claimed, but the claim was still wrong, and
the records are corrected rather than quietly left. Whether the _font-scale_ key behaves the same
way was not re-tested here and the older claim about it is untouched.

## Limits of this sweep, named

- The **energy heatmap** is not covered: a fresh account has no learned data, so Insights shows
  "Ще вчимося". The weekday header at XXXL (`weekday.short.*` = Пн…Нд, two characters in both
  languages) is therefore untested in Ukrainian.
- The **Move picker**, the **undo bar**, the **trade-off sheet** and the **focus rating chips** need
  a running session or an infeasible day; not reached here.
- Onboarding and the switch ran at **medium** text size: Maestro cannot dismiss the simulator
  keyboard, and scrolling a 200 %-scale Settings list to its foot tests Maestro rather than the app.

## Gotchas this run added

- Maestro screenshots land in `~/.maestro/tests/<run>/<flow>/takeScreenshot/`, **not** the working
  directory; the runner copies them out.
- A row that is an `accessible` Pressable exposes only its accessibility label to Maestro — iOS
  merges the child `Text` away. `tapOn: 'Українська'` finds nothing; `'Language: Українська'` does.
- The simulator keyboard covers the tab bar and `hideKeyboard` fails (P2 gotcha, still true). A
  relaunch is the reliable way past it; a second `inputText` opens the emoji keyboard instead.
- `scrollUntilVisible` needs `timeout: 60000` + `speed: 30` to reach the foot of Settings at XXXL,
  and its default 100 % visibility check makes assertions on a solver-dependent plan flaky — the
  action row is evidence in a screenshot, deliberately not an assertion.
