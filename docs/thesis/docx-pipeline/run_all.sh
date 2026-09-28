#!/usr/bin/env bash
# Складання й повний прогін перевірок.
#   ./run_all.sh ../text/full.md ../formatter-brief.md out/
# Python і його пакети — з власного проєкту uv цієї теки (pyproject.toml, uv.lock, Python 3.12,
# лише керований uv), а не з того, що стоїть на машині. Із системи потрібні тільки uv і pandoc.
# Код виходу ненульовий, якщо впало складання, звірка чи перевірка легенд.
set -euo pipefail
SRC=${1:?шлях до full.md}; BRIEF=${2:?шлях до formatter-brief.md}; OUT=${3:-out}
HERE=$(cd "$(dirname "$0")" && pwd)
PY=(uv run --project "$HERE" --locked --quiet python)
command -v uv >/dev/null 2>&1 || { echo "немає uv (brew install uv)"; exit 1; }
command -v pandoc >/dev/null 2>&1 || { echo "немає pandoc (brew install pandoc): без нього формули не складаються"; exit 1; }
mkdir -p "$OUT"

echo "== середовище: $("${PY[@]}" -c 'import sys, docx, lxml; print(f"Python {sys.version.split()[0]} (uv), python-docx {docx.__version__}, lxml {lxml.__version__}")'), $(pandoc --version | head -1)"
echo; echo "== складання";      "${PY[@]}" "$HERE/build.py" --src "$SRC" --brief "$BRIEF" --out "$OUT/hourwell.docx" --report "$OUT/report.json"
echo; echo "== звірка";         "${PY[@]}" "$HERE/verify.py" --src "$SRC" --brief "$BRIEF" --docx "$OUT/hourwell.docx"
echo; echo "== легенди";        "${PY[@]}" "$HERE/check_legend_symbols.py" "$SRC"
echo; echo "== аудит розмітки"; "${PY[@]}" "$HERE/audit_markdown.py" "$SRC" --out "$OUT/audit.md"

if command -v soffice >/dev/null 2>&1; then
  echo; echo "== PDF"
  soffice --headless --convert-to pdf --outdir "$OUT" "$OUT/hourwell.docx" >/dev/null 2>&1 && echo "   $OUT/hourwell.pdf" \
    || echo "   PDF не зібрано (для формул потрібен пакет libreoffice-math)"
fi
