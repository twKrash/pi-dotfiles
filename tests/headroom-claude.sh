#!/bin/sh
# headroom-claude.zsh: claude goes through `headroom wrap` only when headroom is installed.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FN="$ROOT/home/dot_config/zsh/functions/headroom-claude.zsh"
command -v zsh >/dev/null 2>&1 || { echo "headroom-claude: zsh not installed, skipped"; exit 0; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/with" "$TMP/without"
for dir in with without; do
  printf '#!/bin/sh\nprintf claude; printf " [%%s]" "$@"; echo\n' >"$TMP/$dir/claude"
  chmod +x "$TMP/$dir/claude"
done
printf '#!/bin/sh\nprintf headroom; printf " [%%s]" "$@"; echo\n' >"$TMP/with/headroom"
chmod +x "$TMP/with/headroom"

out=$(PATH="$TMP/with:/usr/bin:/bin" zsh -fc ". '$FN'; claude --resume 'a b'")
test "$out" = "headroom [wrap] [claude] [--resume] [a b]"
out=$(PATH="$TMP/without:/usr/bin:/bin" zsh -fc ". '$FN'; claude --resume 'a b'")
test "$out" = "claude [--resume] [a b]"
out=$(PATH="$TMP/with:/usr/bin:/bin" zsh -fc ". '$FN'; command claude -p hi")
test "$out" = "claude [-p] [hi]"
echo "headroom-claude tests passed"
