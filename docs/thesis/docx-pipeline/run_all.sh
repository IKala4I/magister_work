#!/usr/bin/env bash
# Складання й повний прогін перевірок.
#   ./run_all.sh ../text/full.md ../formatter-brief.md out/
# Python і його пакети — з власного проєкту uv цієї теки (pyproject.toml, uv.lock, Python 3.12,
# лише керований uv), а не з того, що стоїть на машині. Рисунки — рендер render_figures.py:
# Mermaid із render/ (npm ci за package-lock.json, власний chrome-headless-shell), PlantUML —
# закріплений jar у render/.tools. PDF — make_pdf.py: закріплений LibreOffice у render/.tools, зміст
# оновлюється. Із системи потрібні uv, pandoc, node/npm, java (PlantUML) і macOS (hdiutil, для LibreOffice).
# Код виходу ненульовий, якщо впало будь-що: рендер (підписи < 8 пт), складання, звірка, легенди чи PDF.
set -euo pipefail
SRC=${1:?шлях до full.md}; BRIEF=${2:?шлях до formatter-brief.md}; OUT=${3:-out}
HERE=$(cd "$(dirname "$0")" && pwd)
PY=(uv run --project "$HERE" --locked --quiet python)
command -v uv >/dev/null 2>&1 || { echo "немає uv (brew install uv)"; exit 1; }
command -v pandoc >/dev/null 2>&1 || { echo "немає pandoc (brew install pandoc): без нього формули не складаються"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "немає npm (brew install node): без нього діаграми не рендеряться"; exit 1; }
[ -x "$HERE/render/node_modules/.bin/mmdc" ] || (cd "$HERE/render" && npm ci --no-fund --no-audit --loglevel=error)
mkdir -p "$OUT"

echo "== середовище: $("${PY[@]}" -c 'import sys, docx, lxml; print(f"Python {sys.version.split()[0]} (uv), python-docx {docx.__version__}, lxml {lxml.__version__}")'), $(pandoc --version | head -1)"
echo; echo "== рисунки";        "${PY[@]}" "$HERE/render_figures.py" --src "$SRC" --out "$OUT/figures"
echo; echo "== складання";      "${PY[@]}" "$HERE/build.py" --src "$SRC" --brief "$BRIEF" --out "$OUT/hourwell.docx" --report "$OUT/report.json" --figures "$OUT/figures"
echo; echo "== звірка";         "${PY[@]}" "$HERE/verify.py" --src "$SRC" --brief "$BRIEF" --docx "$OUT/hourwell.docx" --figures "$OUT/figures"
echo; echo "== легенди";        "${PY[@]}" "$HERE/check_legend_symbols.py" "$SRC"
echo; echo "== аудит розмітки"; "${PY[@]}" "$HERE/audit_markdown.py" "$SRC" --out "$OUT/audit.md"

echo; echo "== PDF";            "${PY[@]}" "$HERE/make_pdf.py" "$OUT/hourwell.docx" "$OUT/hourwell.pdf"
