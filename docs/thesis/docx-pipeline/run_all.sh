#!/usr/bin/env bash
# Складання й повний прогін перевірок.
#   ./run_all.sh ../text/full.md ../formatter-brief.md out/
# Код виходу ненульовий, якщо впало складання або звірка.
set -euo pipefail
SRC=${1:?шлях до full.md}; BRIEF=${2:?шлях до formatter-brief.md}; OUT=${3:-out}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"

echo "== складання";            python3 "$HERE/build.py" --src "$SRC" --brief "$BRIEF" --out "$OUT/hourwell.docx" --report "$OUT/report.json"
echo; echo "== звірка";         python3 "$HERE/verify.py" --src "$SRC" --brief "$BRIEF" --docx "$OUT/hourwell.docx"
echo; echo "== легенди";        python3 "$HERE/check_legend_symbols.py" "$SRC"
echo; echo "== аудит розмітки"; python3 "$HERE/audit_markdown.py" "$SRC" --out "$OUT/audit.md"

if command -v soffice >/dev/null 2>&1; then
  echo; echo "== PDF"
  soffice --headless --convert-to pdf --outdir "$OUT" "$OUT/hourwell.docx" >/dev/null 2>&1 && echo "   $OUT/hourwell.pdf" \
    || echo "   PDF не зібрано (для формул потрібен пакет libreoffice-math)"
fi
