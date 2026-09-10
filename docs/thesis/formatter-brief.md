# Do-not-touch list for whoever formats `text/full.md`

Every string below is quoted **verbatim** from `docs/thesis/text/full.md` as of 2026-09-10. This
is a list, not a principle: hand it over as it is.

**What the formatter is for:** headings, styles, page layout, tables, figure placement, the
reference list's visual form, pagination, the title page. **Nothing in this file's prose needs
improving.** Where a sentence reads awkwardly, that is usually because it is carrying a condition
that a smoother sentence would drop.

The single rule behind every entry: **a number here means something only together with the words
around it.** Round it, average it, pick one end of it, or drop the clause that says how it was
measured, and the sentence becomes false while reading better.

**After formatting, run `python3 docs/thesis/verify-docx.py <your-file>.docx`.** It reads a
`.docx` directly and mechanically re-checks 61 assertions about the text — banned phrasings that
must not have come back, sentences that must still be present, and number pairs that must still
agree. It does not check everything in this list, but what it does check it checks exactly.

---

## 1. Ranges — never round, never collapse to one end, never average

| Keep exactly      | Do not write                      | Why                                                                               |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `3,7–4,1 с`       | `3,7 с` · `≈ 4 с` · `близько 4 с` | two separate ten-request series, 3 and 4 September. One number implies one series |
| `4,8–10,2 в. п.`  | `≈ 5 в. п.` · `5–10 в. п.`        | the evening-type gain across the grid; "≈ 5" was a rounding that was caught       |
| `0,8–2,1 в. п.`   | `≈ 1 в. п.` · `до 2 в. п.`        | the morning-type loss; the upper end is the point                                 |
| `0,3–1,4 в. п.`   | `≈ 1 в. п.`                       | the four-week personalisation gap. Rounding up makes it look like it compounds    |
| `6,8–7,2 в. п.`   | `7 в. п.` · `≈ 8 в. п.`           | realised effect vs the nominal 8 в. п. The gap between them is the finding        |
| `0,11–0,53 с`     | `< 1 с`                           | measured alarm latency, plugged and unplugged                                     |
| `78–151 мс`       | `≈ 100 мс` · `менш ніж 200 мс`    | measured server-side cascade delete                                               |
| `0,03–17 в. п.`   | `до 17 в. п.` · `незначна`        | the price of the randomized slice; the low end matters as much as the high        |
| `1,1–2,4`         | `≈ 2`                             | experiments per user per week on loaded weeks                                     |
| `0,12–0,14`       | `≈ 0,13`                          | how much more optimistic the prior level is than the world                        |
| `34–40 учасників` | `≈ 35` · `40`                     | N for power 0,80 under the protocol's own pessimistic assumption                  |
| `10–11 мс`        | `≈ 10 мс`                         | time to first feasible solution                                                   |
| `0,38–1,21`       | `≈ 1`                             | the relative bound gap that never closed                                          |

## 2. Paired numbers — both halves, in this order, or neither

- `потужність 0,84 і 0,82 за 30 учасників **за зареєстрованої неоднорідності** — але за власного
песимістичного припущення протоколу про міжкористувацький розкид справжнього ефекту та сама межа
дає 0,77 і 0,74`
  → **Never keep only `0,84 і 0,82`.** The second pair is why N = 30 is not settled.
- `його потужність становить 0,21 і 0,13, тобто самостійним тестом він бути не може`
  → the low numbers are the result. Do not delete as "negative".
- `виміряним практичним порогом — 3·10³ літералів на машині розгортання` … `(8·10³ на машині
розробника класу M-series)` … `специфікований поріг 4·10⁴ лишається зовнішньою межею`
  → **all three numbers stay.** Do not "reconcile" `3·10³` up to `4·10⁴`: the whole passage exists
  because measurement contradicted the specification.
- `28 % ранкових, 52 % проміжних, 20 % вечірніх` … `за первинними межами Горна–Остберга та сама
вибірка ділиться як 62,1 / 36,6 / 2,2`
  → both splits, and the clause between them (§4 item 3) must stay together.

## 3. Counts — never "most", "the majority", "almost all", "nearly always"

| Keep exactly                                           | Do not write                  |
| ------------------------------------------------------ | ----------------------------- |
| `у 58 світах, грає внічию у 17 і не програє в жодному` | `перемагає майже скрізь`      |
| `понад 120 — у 48 із 75 розглянутих світів`            | `у більшості світів`          |
| `N₈₀ не перевищує 60 у 13 комірках із 75`              | `у частині комірок`           |
| `розв'язувач у 12 із 15 запитів доходив до ліміту`     | `здебільшого` · `у більшості` |
| `набір щонайменше 172 осіб`                            | `близько 170` · `≈ 200`       |
| `40 повтореннях`                                       | `кількох повтореннях`         |
| `N₈₀ … дорівнює 31 … а в дорослій вибірці — 33`        | either number alone           |

`не програє в жодному` is **not** the same claim as `перемагає в усіх`. Do not convert it.

## 4. Sentences that must survive word for word

These are the limitations. Each was written after a version that was weaker got caught.

1. `Правило, з яким систему порівняно, **одне** — «найраніший вільний слот»; порівняння з наявними
планувальниками не проводилося.`
   → Do not delete the second clause as redundant. It is the scope of the whole evaluation.
2. `Оцінювання виконано в симуляції, і симуляція не заміщує польового дослідження` …
   `гіпотези H1–H4 лишаються неперевіреними`
   → Do not soften to "перевірено частково" or "попередньо підтверджено".
3. `у світі, який описує сам приор холодного старту системи, вона **лише грає внічию** (+0,4 в. п.)`
   with `(стандартна похибка Монте-Карло ≈ 0,14 в. п.)`
   → **`лише` carries the finding.** `+0,4 в. п.` is not a win and must never be described as one.
   The Monte-Carlo standard error stays with it.
4. `Склад класів «дорослий» (28 % ранкових, 52 % проміжних, 20 % вечірніх) узято з валідації MEQ на
вибірці 566 французьких працівників середнього віку (51,2 ± 3,2 року) [67] **за межами класів,
які автори адаптували саме для цієї вибірки**`
   → the bolded clause is the reason the number is quotable at all. Do not shorten the sentence.
5. `Оцінки з ESS < 100 позначаються як недоказові, але **ніколи не вилучаються з подання**`
   → Do not simplify to "оцінки з ESS < 100 не використовуються".
6. `**Розрив у персоналізації не накопичується**` … `тож первинне позиціювання «перевага зростає з
кожним тижнем» у симуляції не підтверджується`
   → the retraction of the original positioning is deliberate. Keep both halves.
7. `≈ 4,3 експерименти на користувача за тиждень на звичайних тижнях і 1,1–2,4 на завантажених,
**пораховані на коді придатності, а не спостережені**`
   → the bolded clause is the difference between a measurement and an estimate.
8. `Ця передумова **не втрималася під час реалізації**`
9. `Ризик **реалізувався** під час виконання роботи`
10. `Хронотипні приори **не знижують ризик першого тижня вимірно**: їхній внесок у симуляції
становить ±0,4 в. п.`
11. `**Не всі кольорові пари відповідають WCAG 2.2 AA як текст**`
    → Do not restore the older, friendlier "усі кольорові пари задовольняють WCAG 2.2 AA".
12. `Опитувальник **не перекладено**.`
13. `Послідовнісна модель SASRec-lite, он-девайс ONNX-ранжувальник і текстові вкладення MiniLM у v1
**не реалізовані** і віднесені до перспектив.`
    → naming an unbuilt component in order to disclaim it is deliberate. Do not delete the row.
14. `жодного подання до магазинів не виконано`
15. `Мережева складова розкладу (0,90 с) є **власним виміром цієї роботи** на еталонному пристрої,
а не величиною з літератури`
    → do not attach a citation to this. There is deliberately none.

## 5. Hedges that are load-bearing — do not delete as filler

`лише` · `частково` · `не проводилося` · `не запускався` · `лишаються неперевіреними` ·
`виміряний лише частково` · `є **припущенням, а не вимірюванням**` · `є виведенням із Pixel 7a, а не вимірюванням` ·
`спроєктовано, інструментовано й перевірено наскрізно на розгорнутій системі; його виконання лежить поза межами роботи`

A copy-editor's instinct is that these weaken the text. They are the text. In particular:

- `**ДП2** — відповіді не отримано` — do not upgrade to "отримано частково".
- `у симуляції участі не брав і на реальних даних не запускався` (the collaborative layer).
- `◐ — протокол польового оцінювання спроєктовано, інструментовано та перевірено наскрізно на
розгорнутій системі; виконання лежить поза межами роботи` — the half-filled glyph `◐` in
  табл. 1.2 is not a typo for `+`.

## 6. Conditions welded to numbers — never move to a footnote, never drop

Each of these phrases must stay **inside the sentence with its number**:

`на еталонному пристрої` · `на машині розгортання (Oracle A1, два закріплені ядра)` ·
`на машині розробника класу M-series` · `за слабкого зв'язку` · `на 95-му перцентилі` ·
`(дві серії по десять, 3 і 4 вересня; об'єднано 4,0 с, n = 20)` ·
`(стандартна похибка Монте-Карло ≈ 0,14 в. п.)` · `за інформативного приору` ·
`за зареєстрованої неоднорідності` · `медіана по 40 повтореннях` ·
`пораховані на коді придатності, а не спостережені` · `за припущеного відсіву 30 %`

## 7. Characters and formulas — do not normalise

| Keep                                       | A formatter or model will want to write | Consequence                                                                |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| `clip[0,1]` in (2.9) and (2.10)            | `clip[0, 1]`                            | tooling has already misread this as a citation and produced `clip[‹?›, 1]` |
| `E(x~~D) E(a~~π(·                          | x))` in (2.15)                          | `E(x~~D)`                                                                  | Markdown tooling reads `~…~` as strikethrough and doubles the tildes |
| `«…»` guillemets                           | `"…"` typographic quotes                | the whole document uses guillemets                                         |
| `’` (U+2019) apostrophe                    | `'`                                     | every checker folds both, but the text is one                              |
| `–` en dash in numeric ranges              | `-` hyphen                              | `3,7–4,1` vs `3,7-4,1`                                                     |
| `в. п.` with the space                     | `в.п.`                                  | appears ~90 times                                                          |
| Subscripts `N₈₀ α₀ β₀ μ₀ p₀ c₀`            | `N80`, `alpha0`                         | —                                                                          |
| Superscripts `4·10⁴ 3·10³ A⁻¹ xᵀ`          | `10^4`                                  | —                                                                          |
| `≈ ≤ ≥ ± · × → ∈ Σ σ τ λ ε φ θ μ π`        | ASCII equivalents                       | —                                                                          |
| the four-space run before `(2.1)`…`(2.20)` | a single space                          | it is the Word tab stop for the equation number                            |
| `                                          | A_m(x)                                  | `                                                                          | `A_m(x)`                                                             | the bars are cardinality, not emphasis |

The code listings in §4.2 and §4.4 keep their indentation and their aligned trailing comments.
They have already been flattened once.

## 8. Numbering and structure — already correct, do not "fix"

- Six chapters. `ВСТУП` says `шести розділів`. Cross-references to `розділ 6` are real.
- §4.5's nightly pipeline runs `(1) (2) (3) (4) (5)` with no gap. It previously had one; it is fixed.
- The reference list is **numbered in its final order** and citations point at those numbers. Do not
  re-sort, re-alphabetise or renumber. If an entry must move, the citation numbers move with it.
- `Kuliahin A., Narozhnyi V., Tkachov V., Kuchuk H.` and `Meleshko Ye., Khokh V., Ulichev O.` are
  Latin-transliterated above Ukrainian titles. That is how those journals print their own author
  metadata. Do not "correct" them into Cyrillic.
- Додаток З is 75 rows in five block tables. Every row is reported on purpose, losses and ties
  included. Do not summarise it.

## 9. If a sentence must change

Anything that changes wording goes back through `assemble.py`, not into the `.docx`:
`docs/thesis/text/full.md` is generated, and a hand edit to the Word file is invisible to every
checker in this repository. See `ASSEMBLY.md`.

---

## Appendix — the machine-checkable list

`verify-brief.py` asserts every line below is present in `text/full.md`, so this brief cannot
drift from the text it describes. One string per line; nothing else in this file is parsed.

```keep-verbatim
3,7–4,1 с
4,8–10,2 в. п.
0,8–2,1 в. п.
0,3–1,4 в. п.
6,8–7,2 в. п.
0,11–0,53 с
78–151 мс
0,03–17 в. п.
1,1–2,4
0,12–0,14
34–40 учасників
10–11 мс
0,38–1,21
у 58 світах, грає внічию у 17 і не програє в жодному
понад 120 — у 48 із 75 розглянутих світів
N₈₀ не перевищує 60 у 13 комірках із 75
розв'язувач у 12 із 15 запитів доходив до ліміту
набір щонайменше 172 осіб
62,1 / 36,6 / 2,2
порівняння з наявними планувальниками не проводилося
гіпотези H1–H4 лишаються неперевіреними
лише грає внічию з евристикою
стандартна похибка Монте-Карло ≈ 0,14 в. п.
за межами класів, які автори адаптували саме для цієї вибірки
ніколи не вилучаються з подання
пораховані на коді придатності, а не спостережені
не втрималася під час реалізації
не знижують ризик першого тижня вимірно
Не всі кольорові пари відповідають WCAG 2.2 AA як текст
Опитувальник **не перекладено**
жодного подання до магазинів не виконано
власним виміром цієї роботи
є **припущенням, а не вимірюванням**
є виведенням із Pixel 7a, а не вимірюванням
на еталонному пристрої
на машині розгортання
за слабкого зв'язку
на 95-му перцентилі
за інформативного приору
за зареєстрованої неоднорідності
за припущеного відсіву 30 %
clip[0,1]
E(x~D)
|A_m(x)|
шести розділів
```
