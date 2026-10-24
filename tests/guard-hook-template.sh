#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DOC="$ROOT/docs/PLUGIN-CRAFT-GUIDE.md"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
awk '/^VERDICT=\$\(python3 - "\$CMD" <<'\''PY'\''$/{inside=1; next} inside && /^PY$/{exit} inside{print}' "$DOC" >"$TMP/guard.py"
test -s "$TMP/guard.py"
# Mirror the template's verb placeholder with a representative dangerous verb.
sed 's/<verb>/rm/g' "$TMP/guard.py" >"$TMP/guard.py.tmp"
mv "$TMP/guard.py.tmp" "$TMP/guard.py"
run_guard() { python3 "$TMP/guard.py" "$1"; }
[ "$(run_guard 'rm -rf /tmp/example')" = DENY ]
[ -z "$(run_guard 'printf harmless')" ]
[ -z "$(run_guard 'echo rm -rf /tmp/example')" ]
printf 'guard hook template regression: passed\n'
