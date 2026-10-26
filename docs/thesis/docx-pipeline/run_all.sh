#!/usr/bin/env bash
# Складання й повний прогін перевірок.
#   ./run_all.sh ../text/full.md ../formatter-brief.md /Users/vladyslav/Workspace/MagisterDocs
# Третій аргумент — тека MagisterDocs поза репозиторієм: звідти беруться приватні дані
# (private/titulka.json — імена для титулки) і знімки (figures/3.4), туди йде результат (build/).
# Python і його пакети — з власного проєкту uv цієї теки (pyproject.toml, uv.lock, Python 3.12,
# лише керований uv), а не з того, що стоїть на машині. Рисунки — рендер render_figures.py:
# Mermaid із render/ (npm ci за package-lock.json, власний chrome-headless-shell), PlantUML —
# закріплений jar у render/.tools. PDF — make_pdf.py: закріплений LibreOffice у render/.tools, зміст
# оновлюється. Із системи потрібні uv, pandoc, node/npm, java (PlantUML) і macOS (hdiutil, для LibreOffice).
# Код виходу ненульовий, якщо впало будь-що: рендер (підписи < 8 пт), складання, звірка, легенди чи PDF.
set -euo pipefail
SRC=${1:?шлях до full.md}; BRIEF=${2:?шлях до formatter-brief.md}
DOCS=${3:?шлях до MagisterDocs — приватні дані й результати збірки живуть поза репозиторієм}
[ -d "$DOCS" ] || { echo "немає теки $DOCS"; exit 1; }
OUT="$DOCS/build"
PRIV="$DOCS/private/titulka.json"; PRIVATE=()
[ -f "$PRIV" ] && PRIVATE=(--private "$PRIV")
HERE=$(cd "$(dirname "$0")" && pwd)
# тека з приватними іменами й готовими файлами не може лежати всередині репозиторію
REPO=$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$REPO" ]; then
  case "$(cd "$DOCS" && pwd -P)/" in
    "$(cd "$REPO" && pwd -P)/"*) echo "$DOCS — усередині репозиторію $REPO; MagisterDocs має бути поза ним"; exit 1 ;;
  esac
fi
PY=(uv run --project "$HERE" --locked --quiet python)
command -v uv >/dev/null 2>&1 || { echo "немає uv (brew install uv)"; exit 1; }
command -v pandoc >/dev/null 2>&1 || { echo "немає pandoc (brew install pandoc): без нього формули не складаються"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "немає npm (brew install node): без нього діаграми не рендеряться"; exit 1; }
[ -x "$HERE/render/node_modules/.bin/mmdc" ] || (cd "$HERE/render" && npm ci --no-fund --no-audit --loglevel=error)
mkdir -p "$OUT"

echo "== середовище: $("${PY[@]}" -c 'import sys, docx, lxml; print(f"Python {sys.version.split()[0]} (uv), python-docx {docx.__version__}, lxml {lxml.__version__}")'), $(pandoc --version | head -1)"
echo; echo "== рисунки";        "${PY[@]}" "$HERE/render_figures.py" --src "$SRC" --out "$OUT/figures" --docs "$DOCS"
# Складання йде в кілька проходів, бо дві речі знає лише верстка. Обсяг роботи в сторінках (вступ
# і реферат) і обсяг основного тексту (вступ) беруться з готового PDF (layout.py pages, layout.py
# body --total) і підставляються наступним проходом (build.py --pages, --body-pages). Те, які рядки таблиці перейшли на наступну сторінку, теж читається з PDF
# (layout.py tables), і наступний прохід ділить таблицю там із написом «Продовження таблиці N»
# (build.py --splits): по одній межі на розділ за прохід, бо кожна межа зсуває все, що нижче.
# Проходи тривають, доки обсяг і план поділу не перестануть змінюватися. Руками нічого не набирається.
PLAN="$OUT/tables.json"
BUILD=("${PY[@]}" "$HERE/build.py" --src "$SRC" --brief "$BRIEF" --out "$OUT/hourwell.docx" --report "$OUT/report.json"
       --figures "$OUT/figures" --parts "$DOCS/private" --referat "$OUT/referat.docx" --splits "$PLAN"
       ${PRIVATE[@]+"${PRIVATE[@]}"})
PAGES=""; BODY=""; MAX_PASSES=14
rm -f "$PLAN" "$PLAN.next" "$OUT/splits.json" "$OUT/splits.next.json"
for PASS in $(seq 1 $MAX_PASSES); do
  echo; echo "== складання, прохід $PASS${PAGES:+ (обсяг $PAGES с., основний текст $BODY с.)}"
  "${BUILD[@]}" ${PAGES:+--pages "$PAGES"} ${BODY:+--body-pages "$BODY"} > "$OUT/build.log"; tail -2 "$OUT/build.log"
  "${PY[@]}" "$HERE/make_pdf.py" "$OUT/hourwell.docx" "$OUT/hourwell.pdf"
  NEW=$("${PY[@]}" "$HERE/layout.py" pages "$OUT/hourwell.pdf")
  NEWBODY=$("${PY[@]}" "$HERE/layout.py" body --total "$OUT/hourwell.pdf")
  MOVED=0
  "${PY[@]}" "$HERE/layout.py" tables "$OUT/hourwell.pdf" "$OUT/hourwell.docx" --plan "$PLAN" --out "$PLAN.next" || MOVED=1
  if [ "$NEW" = "$PAGES" ] && [ "$NEWBODY" = "$BODY" ] && [ "$MOVED" = 0 ]; then rm -f "$PLAN.next"; break; fi
  [ "$PASS" = "$MAX_PASSES" ] && { echo "верстка не стабілізувалася за $MAX_PASSES проходів (обсяг $NEW с.)"; exit 1; }
  PAGES=$NEW; BODY=$NEWBODY; mv "$PLAN.next" "$PLAN"
done
echo; echo "== складання: звіт останнього проходу"; sed '$d' "$OUT/build.log" | sed '$d'
echo; echo "== реферат";        "${PY[@]}" "$HERE/make_pdf.py" "$OUT/referat.docx" "$OUT/referat.pdf" --no-index
                                "${PY[@]}" "$HERE/layout.py" referat "$OUT/referat.pdf"
echo; echo "== обсяг";          "${PY[@]}" "$HERE/layout.py" body "$OUT/hourwell.pdf"
echo; echo "== типографіка в PDF"; "${PY[@]}" "$HERE/layout.py" typography "$OUT/hourwell.pdf"
echo; echo "== звірка";         "${PY[@]}" "$HERE/verify.py" --src "$SRC" --brief "$BRIEF" --docx "$OUT/hourwell.docx" --referat "$OUT/referat.docx" --figures "$OUT/figures" --pages "$PAGES" --body-pages "$BODY" ${PRIVATE[@]+"${PRIVATE[@]}"}
echo; echo "== самоперевірка оформлення"; "${PY[@]}" "$HERE/verify.py" --self-test --src "$SRC" --docx "$OUT/hourwell.docx"
echo; echo "== легенди";        "${PY[@]}" "$HERE/check_legend_symbols.py" "$SRC"
echo; echo "== аудит розмітки"; "${PY[@]}" "$HERE/audit_markdown.py" "$SRC" --out "$OUT/audit.md"

