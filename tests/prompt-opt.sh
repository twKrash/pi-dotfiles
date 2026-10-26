#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# Keep the caller's prompt-opt defaults out of the assertions.
unset PROMPT_LAB_DIR PROMPT_OPT_TARGET_PROVIDER PROMPT_OPT_TARGET_MODEL PROMPT_OPT_TARGET_EFFORT PROMPT_OPT_TARGET_ENVIRONMENT \
  PROMPT_OPT_RUNNER_PROVIDER PROMPT_OPT_RUNNER_MODEL PROMPT_OPT_RUNNER_EFFORT PROMPT_OPT_PI_PROVIDER PROMPT_OPT_PI_MODEL PROMPT_OPT_PI_EFFORT \
  PROMPT_OPT_ANTHROPIC_PROVIDER PROMPT_OPT_RUNNER_EXTENSION
TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
HOME="$TMP/home"
export HOME
PROMPT_OPT="$ROOT/home/dot_local/bin/executable_prompt-opt"
HISTORY_HELPER="$ROOT/home/dot_local/bin/prompt-opt-history.mjs"
LAB="$ROOT/home/ai/prompt_engineering"

# Provider-only overrides reset incompatible inherited target-model defaults.
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/prompt-state" \
  PROMPT_OPT_TARGET_MODEL=opus-5.5 "$PROMPT_OPT" --provider=openai --show-config >"$TMP/prompt-config.log"
grep -q 'Target: *provider=openai model=luna ' "$TMP/prompt-config.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/sol-alias-state" \
  "$PROMPT_OPT" --model=sol --show-config >"$TMP/sol-alias-config.log"
grep -q 'Target: *provider=openai model=gpt-6.1-sol ' "$TMP/sol-alias-config.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/sol-6-alias-state" \
  "$PROMPT_OPT" --model=sol-6 --show-config >"$TMP/sol-6-alias-config.log"
grep -q 'Target: *provider=openai model=gpt-6-sol ' "$TMP/sol-6-alias-config.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/sol-6.1-alias-state" \
  "$PROMPT_OPT" --opt-model=sol-6.1 --show-config >"$TMP/sol-6.1-alias-config.log"
grep -q 'Optimizer: *provider=openai model=gpt-6.1-sol ' "$TMP/sol-6.1-alias-config.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/prompt-opt-effort-state" \
  "$PROMPT_OPT" --opt-effort=medium --show-config >"$TMP/prompt-config-opt-effort.log"
grep -q 'Optimizer: *provider=openai model=gpt-6-luna thinking=medium' "$TMP/prompt-config-opt-effort.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/prompt-state-verbose" \
  "$PROMPT_OPT" --verbose --show-config >"$TMP/prompt-config-verbose.log" 2>"$TMP/prompt-verbose.log"
grep -q 'prompt-opt\[debug\].*phase=config' "$TMP/prompt-verbose.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/prompt-state-debug" \
  "$PROMPT_OPT" --debug --show-config >"$TMP/prompt-config-debug.log" 2>"$TMP/prompt-debug.log"
grep -q 'prompt-opt\[debug\].*phase=config' "$TMP/prompt-debug.log"
mkdir -p "$TMP/mock-bin"
cat >"$TMP/mock-bin/pi" <<'MOCK_PI'
#!/bin/sh
if [ "${1:-}" = --version ]; then echo "${PI_VERSION:-1.1.0}"; exit 0; fi
echo "pi-called" >>"$PI_CALLS"
if [ -n "${PI_ARGS:-}" ]; then printf '%s\n' "$@" >"$PI_ARGS"; fi
if [ -n "${PI_CWD:-}" ]; then printf '%s\n' "$PWD" >"$PI_CWD"; fi
if [ -n "${GOAL_INPUT_CAPTURE:-}" ] && [ "${1:-}" != --version ]; then
  for pi_arg do :; done
  printf '%s' "$pi_arg" >"$GOAL_INPUT_CAPTURE"
fi
if [ -n "${MUTATE_LAB:-}" ]; then printf '%s\n' changed >>"$MUTATE_LAB/.runtime-change"; fi
if [ "${FAIL_PI:-0}" = 1 ]; then exit 1; fi
call_count=$(wc -l <"$PI_CALLS" | tr -d " ")
if [ "${GOAL_MODE:-0}" = 1 ]; then
  if [ -n "${GOAL_OUTPUT_FILE:-}" ]; then cat "$GOAL_OUTPUT_FILE"; else
    printf '%s\n' '{"optimized_prompt":"Complete execution prompt\nwith all requirements.","goal_objective":"Implement the \"requested\" feature while preserving user'"'"'s stated constraints and C:\\tools paths."}'
  fi
else
  printf 'optimized-%s\n' "$call_count"
fi
MOCK_PI
cat >"$TMP/mock-bin/xclip" <<'MOCK_XCLIP'
#!/bin/sh
cat >"${CLIP_CAPTURE:-/dev/null}"
if [ "${FAIL_CLIPBOARD:-0}" = 1 ]; then exit 1; fi
MOCK_XCLIP
chmod +x "$TMP/mock-bin/pi" "$TMP/mock-bin/xclip"
# --last settings loading must work without Bash 4's mapfile builtin.
LAST_STATE="$TMP/last-settings-state/prompt-opt"
mkdir -p "$LAST_STATE"
printf '%s\n' openai sol low pi openai-codex gpt-6-luna medium >"$LAST_STATE/last-settings.txt"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/last-settings-state" \
  bash -c 'enable -n mapfile 2>/dev/null || :; source "$0" --last --show-config' "$PROMPT_OPT" >"$TMP/last-settings-config.log"
grep -q 'Target: *provider=openai model=gpt-6.1-sol effort=low environment=pi' "$TMP/last-settings-config.log"
grep -q 'Optimizer: *provider=openai-codex model=gpt-6-luna thinking=medium' "$TMP/last-settings-config.log"
# With no xclip in PATH, both fresh and cached clipboard writes must use pbcopy.
PBCOPY_BIN="$TMP/pbcopy-bin"
mkdir -p "$PBCOPY_BIN"
for tool in bash node dirname mktemp rm mv cp grep head wc tr cat; do
  ln -s "$(command -v "$tool")" "$PBCOPY_BIN/$tool"
done
cat >"$PBCOPY_BIN/pi" <<'PBCOPY_PI'
#!/bin/sh
if [ "${1:-}" = --version ]; then echo 1.1.0; exit 0; fi
printf 'optimized-pbcopy\n'
PBCOPY_PI
cat >"$PBCOPY_BIN/pbcopy" <<'PBCOPY_CLIPBOARD'
#!/bin/sh
cat >"$CLIP_CAPTURE"
printf 'called\n' >>"$PB_COPY_CALLS"
PBCOPY_CLIPBOARD
chmod +x "$PBCOPY_BIN/pi" "$PBCOPY_BIN/pbcopy"
printf 'pbcopy task\n' >"$TMP/pbcopy-request.md"
printf 'optimized-pbcopy\n' >"$TMP/pbcopy-expected.out"
PATH="$PBCOPY_BIN" CLIP_CAPTURE="$TMP/pbcopy-clipboard.out" PB_COPY_CALLS="$TMP/pbcopy-calls" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/pbcopy-state" \
  "$PROMPT_OPT" --debug "$TMP/pbcopy-request.md" >"$TMP/pbcopy-first.out" 2>"$TMP/pbcopy-first.log"
cmp "$TMP/pbcopy-expected.out" "$TMP/pbcopy-first.out"
cmp "$TMP/pbcopy-expected.out" "$TMP/pbcopy-clipboard.out"
PATH="$PBCOPY_BIN" CLIP_CAPTURE="$TMP/pbcopy-clipboard.out" PB_COPY_CALLS="$TMP/pbcopy-calls" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/pbcopy-state" \
  "$PROMPT_OPT" --debug "$TMP/pbcopy-request.md" >"$TMP/pbcopy-cached.out" 2>"$TMP/pbcopy-cached.log"
cmp "$TMP/pbcopy-expected.out" "$TMP/pbcopy-cached.out"
cmp "$TMP/pbcopy-expected.out" "$TMP/pbcopy-clipboard.out"
grep -q 'phase=cache_hit' "$TMP/pbcopy-cached.log"
test "$(wc -l <"$TMP/pbcopy-calls")" -eq 2
# A symlinked TMPDIR (macOS /var -> /private/var) must not break history writes.
mkdir "$TMP/real-tmpdir"
ln -s "$TMP/real-tmpdir" "$TMP/link-tmpdir"
printf 'symlinked tmpdir task\n' >"$TMP/symlink-tmpdir-request.md"
TMPDIR="$TMP/link-tmpdir" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/symlink-tmpdir-calls" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/symlink-tmpdir-state" \
  "$PROMPT_OPT" "$TMP/symlink-tmpdir-request.md" >"$TMP/symlink-tmpdir.out"
grep -qx 'optimized-1' "$TMP/symlink-tmpdir.out"
# The optimizer run must see only the lab instructions, not global/ancestor AGENTS.md.
printf 'context isolation task\n' >"$TMP/isolation-request.md"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/isolation-calls" PI_ARGS="$TMP/isolation-args" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/isolation-state" \
  "$PROMPT_OPT" "$TMP/isolation-request.md" >/dev/null
grep -qx -- '--no-context-files' "$TMP/isolation-args"
grep -A1 -x -- '--append-system-prompt' "$TMP/isolation-args" | tail -n 1 | grep -qx "$LAB/AGENTS.md"
if grep -qx -- '--extension' "$TMP/isolation-args"; then exit 1; fi
# PROMPT_OPT_RUNNER_EXTENSION loads exactly that extension for the optimizer run; a missing file is an error.
printf '%s\n' 'export default function () {}' >"$TMP/runner-ext.js"
printf 'runner extension task\n' >"$TMP/runner-ext-request.md"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/runner-ext-calls" PI_ARGS="$TMP/runner-ext-args" PROMPT_OPT_RUNNER_EXTENSION="$TMP/runner-ext.js" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/runner-ext-state" "$PROMPT_OPT" "$TMP/runner-ext-request.md" >/dev/null
grep -qx -- '--no-extensions' "$TMP/runner-ext-args"
grep -A1 -x -- '--extension' "$TMP/runner-ext-args" | tail -n 1 | grep -qx "$TMP/runner-ext.js"
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/runner-ext-calls" PROMPT_OPT_RUNNER_EXTENSION="$TMP/missing-ext.js" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/runner-ext-missing-state" "$PROMPT_OPT" "$TMP/runner-ext-request.md" >/dev/null 2>"$TMP/runner-ext-missing.log"; then exit 1; fi
grep -q 'runner extension does not exist' "$TMP/runner-ext-missing.log"
# Context requests use configured tools, preserve context with --last, and never
# reuse optimizer output that did not include the same live context.
CONTEXT_PROJECT="$TMP/context-project"
mkdir -p "$CONTEXT_PROJECT"
printf 'context task\n' >"$TMP/context-request.md"
CONTEXT_CALLS="$TMP/context-calls"
for run in 1 2; do
  (cd "$CONTEXT_PROJECT" && PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CALLS" PI_ARGS="$TMP/context-args" PI_CWD="$TMP/context-cwd" \
    PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-state" \
    "$PROMPT_OPT" --context "Look up Jira issue ABC-123 and ADR-17; no updates." "$TMP/context-request.md") >"$TMP/context-$run.out"
done
test "$(wc -l <"$CONTEXT_CALLS")" -eq 2
test "$(cat "$TMP/context-cwd")" = "$CONTEXT_PROJECT"
if grep -Eq '^--no-(extensions|mcp|skills)$|^--tools$' "$TMP/context-args"; then echo 'context run did not load configured tools' >&2; exit 1; fi
grep -q 'configured tools available in this Pi environment' "$TMP/context-args"
grep -q 'Do not modify project files or update Jira, wiki, or other external systems' "$TMP/context-args"
grep -q 'Use retrieval operations only; if a source has no read-only operation, report it unavailable.' "$TMP/context-args"
grep -q 'Look up Jira issue ABC-123 and ADR-17; no updates.' "$TMP/context-args"
printf '#!/bin/sh\nexit 0\n' >"$TMP/context-editor"
chmod +x "$TMP/context-editor"
(cd "$TMP" && VISUAL="$TMP/context-editor" EDITOR="$TMP/context-editor" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CALLS" PI_ARGS="$TMP/context-last-args" PI_CWD="$TMP/context-last-cwd" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-state" "$PROMPT_OPT" --last) >"$TMP/context-last.out"
test "$(wc -l <"$CONTEXT_CALLS")" -eq 3
test "$(cat "$TMP/context-last-cwd")" = "$CONTEXT_PROJECT"
grep -q 'Look up Jira issue ABC-123 and ADR-17; no updates.' "$TMP/context-last-args"
grep -q 'Look up Jira issue ABC-123 and ADR-17; no updates.' "$TMP/context-state/prompt-opt/last-context.md"
test ! -s "$TMP/context-state/prompt-opt/last-successful-context.txt"
test ! -e "$TMP/context-state/prompt-opt/last-successful-input.md"
CONTEXT_HISTORY=$(find "$TMP/context-state/prompt-opt/history" -mindepth 4 -maxdepth 4 -type f -name metadata.json | head -n 1)
test -n "$CONTEXT_HISTORY"
case "$CONTEXT_HISTORY" in */unverified/*) ;; *) echo 'context result incorrectly entered reusable history' >&2; exit 1 ;; esac
# Context output must never be archived under the hash of its context-free task.
ARCHIVE_STATE="$TMP/context-archive-state"
ARCHIVE_CALLS="$TMP/context-archive-calls"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$ARCHIVE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$ARCHIVE_STATE" \
  "$PROMPT_OPT" --context 'Inspect ADR-17.' "$TMP/context-request.md" >/dev/null
CONTEXT_TASK_HASH=$(sha256sum "$TMP/context-request.md" | cut -d' ' -f1)
if PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$ARCHIVE_STATE" \
  "$PROMPT_OPT" --history "$CONTEXT_TASK_HASH" >/dev/null 2>"$TMP/context-raw-history.err"; then
  echo 'context-dependent output was archived under the raw task hash' >&2; exit 1
fi
test ! -e "$ARCHIVE_STATE/prompt-opt/history/$CONTEXT_TASK_HASH"
CONTEXT_EQUAL_CALLS="$TMP/context-equal-calls"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_EQUAL_CALLS" PI_ARGS="$TMP/context-equal-args" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-equal-state" \
  "$PROMPT_OPT" --context='Inspect ADR-17 only.' "$TMP/context-request.md" >/dev/null
grep -q 'Inspect ADR-17 only.' "$TMP/context-equal-args"
# A valid context-free cached result replaces context output and remains adoptable.
CONTEXT_CACHE_CALLS="$TMP/context-cache-calls"
CONTEXT_CACHE_STATE="$TMP/context-cache-state"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CACHE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$CONTEXT_CACHE_STATE" \
  "$PROMPT_OPT" "$TMP/context-request.md" >/dev/null
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CACHE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$CONTEXT_CACHE_STATE" \
  "$PROMPT_OPT" --context 'Read ADR-17.' "$TMP/context-request.md" >/dev/null
# Context output is retained only in unverified history, not the shared adoptable output.
grep -qx 'optimized-1' "$CONTEXT_CACHE_STATE/prompt-opt/last-output.md"
cmp "$TMP/context-request.md" "$CONTEXT_CACHE_STATE/prompt-opt/last-successful-input.md"
test ! -s "$CONTEXT_CACHE_STATE/prompt-opt/last-successful-context.txt"
CONTEXT_CACHE_OUTPUT=$(find "$CONTEXT_CACHE_STATE/prompt-opt/history" -mindepth 4 -maxdepth 4 -path '*/unverified/*' -type f -name optimized.md | head -n 1)
test -n "$CONTEXT_CACHE_OUTPUT"
grep -qx 'optimized-2' "$CONTEXT_CACHE_OUTPUT"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CACHE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$CONTEXT_CACHE_STATE" \
  "$PROMPT_OPT" --debug "$TMP/context-request.md" >"$TMP/context-cache-hit.out" 2>"$TMP/context-cache-hit.log"
grep -q 'phase=cache_hit' "$TMP/context-cache-hit.log"
test "$(wc -l <"$CONTEXT_CACHE_CALLS")" -eq 2
test ! -s "$CONTEXT_CACHE_STATE/prompt-opt/last-successful-context.txt"
printf 'y\n' | PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$CONTEXT_CACHE_STATE" \
  "$PROMPT_OPT" --adopt-cache >"$TMP/context-cache-adopt.out" 2>"$TMP/context-cache-adopt.err"
grep -q 'Cache pairing restored and recorded' "$TMP/context-cache-adopt.err"
# If context output publication fails after replacing last-output, adoption must fail closed.
PROVENANCE_BIN="$TMP/provenance-bin"
PROVENANCE_STATE="$TMP/provenance-state"
PROVENANCE_CALLS="$TMP/provenance-calls"
mkdir -p "$PROVENANCE_BIN"
REAL_CP=$(command -v cp)
export REAL_CP
cat >"$PROVENANCE_BIN/cp" <<'FAIL_CP'
#!/bin/sh
for destination do :; done
if [ "${FAIL_SUCCESS_INPUT_COPY:-0}" = 1 ] && [ "${destination##*/}" = last-successful-input.md ]; then exit 1; fi
exec "$REAL_CP" "$@"
FAIL_CP
chmod +x "$PROVENANCE_BIN/cp"
printf 'provenance task\n' >"$TMP/provenance-request.md"
PATH="$TMP/mock-bin:$PATH" PI_CALLS="$PROVENANCE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$PROVENANCE_STATE" \
  "$PROMPT_OPT" --no-cache "$TMP/provenance-request.md" >/dev/null
if PATH="$PROVENANCE_BIN:$TMP/mock-bin:$PATH" FAIL_SUCCESS_INPUT_COPY=1 PI_CALLS="$PROVENANCE_CALLS" \
  PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$PROVENANCE_STATE" "$PROMPT_OPT" --no-cache "$TMP/provenance-request.md" \
  >/dev/null 2>"$TMP/provenance-copy-failure.err"; then echo 'injected provenance copy failure unexpectedly succeeded' >&2; exit 1; fi
grep -qx 'optimized-2' "$PROVENANCE_STATE/prompt-opt/last-output.md"
grep -qx pending "$PROVENANCE_STATE/prompt-opt/last-successful-context.txt"
if printf 'y\n' | PATH="$TMP/mock-bin:$PATH" PI_CALLS="$PROVENANCE_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$PROVENANCE_STATE" \
  "$PROMPT_OPT" --adopt-cache >/dev/null 2>"$TMP/provenance-adopt.err"; then echo 'incomplete output provenance was adopted' >&2; exit 1; fi
grep -q 'output provenance is incomplete' "$TMP/provenance-adopt.err"
CALLS_BEFORE_CONTEXT_REJECTIONS=$(wc -l <"$CONTEXT_CALLS")
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-state" \
  "$PROMPT_OPT" --adopt-cache >/dev/null 2>"$TMP/context-adopt.err"; then echo 'context cache adoption was accepted' >&2; exit 1; fi
grep -q 'cannot reuse a context-dependent result' "$TMP/context-adopt.err"
# A failed context-free run clears the last context request but must not make the
# preceding context-dependent output eligible for manual cache adoption.
if PATH="$TMP/mock-bin:$PATH" FAIL_PI=1 PI_CALLS="$CONTEXT_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-state" \
  "$PROMPT_OPT" --no-cache "$TMP/context-request.md" >/dev/null 2>"$TMP/context-free-failed.err"; then echo 'mock Pi failure unexpectedly succeeded' >&2; exit 1; fi
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-state" \
  "$PROMPT_OPT" --adopt-cache >/dev/null 2>"$TMP/context-stale-adopt.err"; then echo 'context output was adopted despite no reusable output existing' >&2; exit 1; fi
grep -q 'previous input or output is missing' "$TMP/context-stale-adopt.err"
CALLS_AFTER_CONTEXT_FAILURE=$(wc -l <"$CONTEXT_CALLS")
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$CONTEXT_CALLS" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-history-state" \
  "$PROMPT_OPT" --history --context 'Inspect ADR-17' >/dev/null 2>"$TMP/context-history.err"; then echo 'context history mode was accepted' >&2; exit 1; fi
grep -q 'cannot be used with --history' "$TMP/context-history.err"
test "$(wc -l <"$CONTEXT_CALLS")" -eq "$CALLS_AFTER_CONTEXT_FAILURE"
CONTEXT_LINK_STATE="$TMP/context-link-state/prompt-opt"
mkdir -p "$CONTEXT_LINK_STATE"
printf 'outside context state' >"$TMP/context-outside"
ln -s "$TMP/context-outside" "$CONTEXT_LINK_STATE/last-context.md"
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/context-link-calls" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-link-state" \
  "$PROMPT_OPT" --context 'Inspect ADR-17' "$TMP/context-request.md" >/dev/null 2>&1; then echo 'symlinked context state was accepted' >&2; exit 1; fi
test ! -s "$TMP/context-link-calls"
test "$(cat "$TMP/context-outside")" = 'outside context state'
CONTEXT_SUCCESS_LINK_STATE="$TMP/context-success-link-state/prompt-opt"
mkdir -p "$CONTEXT_SUCCESS_LINK_STATE"
ln -s "$TMP/context-outside" "$CONTEXT_SUCCESS_LINK_STATE/last-successful-context.txt"
if PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/context-success-link-calls" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/context-success-link-state" \
  "$PROMPT_OPT" --context 'Inspect ADR-17' "$TMP/context-request.md" >/dev/null 2>&1; then echo 'symlinked successful-context state was accepted' >&2; exit 1; fi
test ! -s "$TMP/context-success-link-calls"
test "$(cat "$TMP/context-outside")" = 'outside context state'
# PROMPT_OPT_ANTHROPIC_PROVIDER routes a resolved "anthropic" optimizer through another Pi provider only.
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/anthropic-provider-state" PROMPT_OPT_ANTHROPIC_PROVIDER=claude-bridge \
  "$PROMPT_OPT" --model=opus-5.5 --opt-model=sonnet-5.5 --show-config >"$TMP/anthropic-provider.log"
grep -q 'Optimizer: *provider=claude-bridge model=claude-sonnet-5-5 ' "$TMP/anthropic-provider.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/anthropic-default-state" \
  "$PROMPT_OPT" --model=opus-5.5 --opt-model=sonnet-5.5 --show-config >"$TMP/anthropic-default.log"
grep -q 'Optimizer: *provider=anthropic model=claude-sonnet-5-5 ' "$TMP/anthropic-default.log"
PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/anthropic-openai-state" PROMPT_OPT_ANTHROPIC_PROVIDER=claude-bridge \
  "$PROMPT_OPT" --model=sol --show-config >"$TMP/anthropic-openai.log"
grep -q 'Optimizer: *provider=openai ' "$TMP/anthropic-openai.log"
# Exact-byte history is immutable and repeated requests should be served without Pi.
PI_CALLS="$TMP/pi-calls"
export PI_CALLS
printf 'sample task\n' >"$TMP/request.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" "$TMP/request.md" >"$TMP/history-first.out"
REQUEST_HASH=$(sha256sum "$TMP/request.md" | cut -d' ' -f1)
MODERN_RECORD=$(find "$TMP/history-state/prompt-opt/history/$REQUEST_HASH" -mindepth 3 -maxdepth 3 -name metadata.json | head -n 1)
test -n "$MODERN_RECORD"
MODERN_RECORD_DIR=$(dirname "$MODERN_RECORD")
cp "$MODERN_RECORD_DIR/original.md" "$TMP/modern-record-original"
cp "$MODERN_RECORD_DIR/optimized.md" "$TMP/modern-record-optimized"
cp "$MODERN_RECORD_DIR/metadata.json" "$TMP/modern-record-metadata"
PATH="$TMP/mock-bin:$PATH" CLIP_CAPTURE="$TMP/cache-clipboard.out" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" "$TMP/request.md" >"$TMP/history-second.out" 2>/dev/null
cmp "$TMP/modern-record-original" "$MODERN_RECORD_DIR/original.md"
cmp "$TMP/modern-record-optimized" "$MODERN_RECORD_DIR/optimized.md"
cmp "$TMP/modern-record-metadata" "$MODERN_RECORD_DIR/metadata.json"
test "$(wc -l <"$PI_CALLS")" -eq 1
printf 'second request\n' >"$TMP/other-request.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" "$TMP/other-request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 2
grep -q 'optimized-1' "$TMP/cache-clipboard.out"
grep -q 'optimized-1' "$TMP/history-state/prompt-opt/last-output.md"
cmp "$TMP/request.md" "$TMP/history-state/prompt-opt/last-successful-input.md"
test "$(wc -l <"$TMP/history-state/prompt-opt/last-successful-settings.txt")" -eq 7
# --no-cache forces a new immutable result rather than reusing the hit.
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --no-cache "$TMP/request.md" >/dev/null 2>&1
cmp "$TMP/modern-record-original" "$MODERN_RECORD_DIR/original.md"
cmp "$TMP/modern-record-optimized" "$MODERN_RECORD_DIR/optimized.md"
cmp "$TMP/modern-record-metadata" "$MODERN_RECORD_DIR/metadata.json"
test "$(wc -l <"$PI_CALLS")" -eq 3
cmp "$TMP/request.md" "$TMP/history-state/prompt-opt/last-successful-input.md"
cmp "$TMP/request.md" "$TMP/history-state/prompt-opt/last-input.md"
test "$(wc -l <"$TMP/history-state/prompt-opt/last-successful-settings.txt")" -eq 7
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --history "$(sha256sum "$TMP/request.md" | cut -d' ' -f1)" >"$TMP/history-show.out"
grep -q 'original' "$TMP/history-show.out"
grep -q 'optimized-' "$TMP/history-show.out"
# Malformed siblings and symlinked entries must not hide valid history or mutate outside targets.
HISTORY_DIR="$TMP/history-state/prompt-opt/history"
mkdir -p "$HISTORY_DIR/badhash/unverified/bad-record"
printf '{broken' >"$HISTORY_DIR/badhash/unverified/bad-record/metadata.json"
printf 'outside sentinel' >"$TMP/outside"
ln -s "$TMP/outside" "$HISTORY_DIR/outside-link"
if PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --history >"$TMP/history-list.out" 2>"$TMP/history-list.err"; then :; else echo 'history listing failed' >&2; exit 1; fi
grep -q 'sample task' "$TMP/history-show.out"
test -f "$HISTORY_DIR/badhash/unverified/bad-record/metadata.json"
test "$(cat "$TMP/outside")" = 'outside sentinel'
# Valid-shaped records with invalid settings are ignored, not fatal.
BAD_SETTINGS="$HISTORY_DIR/$(sha256sum "$TMP/request.md" | cut -d' ' -f1)/unverified/bad-settings"
mkdir -p "$BAD_SETTINGS"
cp "$TMP/request.md" "$BAD_SETTINGS/original.md"
printf 'bad optimized' >"$BAD_SETTINGS/optimized.md"
node - "$BAD_SETTINGS/metadata.json" "$BAD_SETTINGS/optimized.md" "$TMP/request.md" <<'NODE'
const fs=require('fs'),crypto=require('crypto'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const out=fs.readFileSync(process.argv[3]),req=fs.readFileSync(process.argv[4]);
fs.writeFileSync(process.argv[2],JSON.stringify({schema:1,compatibility:'unverified',settings:'bad',request_sha256:hash(req),optimized_sha256:hash(out)}));
NODE
# A symlinked record body must be skipped even if its claimed digest matches.
REQ_HASH=$(sha256sum "$TMP/request.md" | cut -d' ' -f1)
EVIL="$HISTORY_DIR/$REQ_HASH/unverified/evil-record"
mkdir -p "$EVIL"
cp "$TMP/request.md" "$EVIL/original.md"
ln -s "$TMP/outside" "$EVIL/optimized.md"
node - "$EVIL/metadata.json" "$TMP/outside" "$REQ_HASH" <<'NODE'
const fs=require('fs'),crypto=require('crypto'),m={schema:1,compatibility:'unverified',settings:Array(7).fill('x'),request_sha256:process.argv[4]};
m.optimized_sha256=crypto.createHash('sha256').update(fs.readFileSync(process.argv[3])).digest('hex');
fs.writeFileSync(process.argv[2],JSON.stringify(m));
NODE
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --history "$REQ_HASH" >"$TMP/history-symlink.out" 2>/dev/null
if grep -q 'outside sentinel' "$TMP/history-symlink.out"; then echo 'symlinked record was read' >&2; exit 1; fi
test -f "$EVIL/metadata.json"
# CLI must reject mutable-state symlinks before Pi or any write.
mkdir -p "$TMP/state-symlink-target/prompt-opt" "$TMP/state-file-link/prompt-opt"
printf 'keep sentinel' >"$TMP/state-symlink-target/prompt-opt/last-output.md"
ln -s "$TMP/state-symlink-target/prompt-opt/last-output.md" "$TMP/state-file-link/prompt-opt/last-output.md"
CALLS_BEFORE_SYMLINK=$(wc -l <"$PI_CALLS")
if PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/state-file-link" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1; then echo 'symlinked mutable file accepted' >&2; exit 1; fi
test "$(cat "$TMP/state-symlink-target/prompt-opt/last-output.md")" = 'keep sentinel'
test "$(wc -l <"$PI_CALLS")" -eq "$CALLS_BEFORE_SYMLINK"
ln -s "$TMP/state-symlink-target" "$TMP/state-dir-link"
if PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/state-dir-link" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1; then echo 'symlinked state directory accepted' >&2; exit 1; fi
test "$(wc -l <"$PI_CALLS")" -eq "$CALLS_BEFORE_SYMLINK"
# Saving through a symlinked history ancestor must not create outside records.
mkdir -p "$TMP/outside-history"
mkdir -p "$TMP/hostile-state/prompt-opt"
ln -s "$TMP/outside-history" "$TMP/hostile-state/prompt-opt/history"
printf 'answer' >"$TMP/answer.md"
node - "$TMP/save-meta.json" <<'NODE'
const fs=require('fs');fs.writeFileSync(process.argv[2],JSON.stringify({compatibility:'unverified',settings:Array(7).fill('x')}));
NODE
if node "$HISTORY_HELPER" save "$TMP/hostile-state/prompt-opt" "$TMP/request.md" "$TMP/answer.md" "$TMP/save-meta.json" >/dev/null 2>&1; then echo 'save followed history symlink' >&2; exit 1; fi
test -z "$(find "$TMP/outside-history" -mindepth 1 -print -quit)"
if "$PROMPT_OPT" --history=not-a-hash >"$TMP/bad-hash.out" 2>&1; then echo 'invalid history hash accepted' >&2; exit 1; fi
grep -q 'invalid history hash' "$TMP/bad-hash.out"
if "$PROMPT_OPT" --history "$TMP/request.md" >"$TMP/history-conflict.out" 2>&1; then echo 'history/input conflict accepted' >&2; exit 1; fi
grep -q 'conflicting input mode' "$TMP/history-conflict.out"
# Settings variants are retained independently for the same exact request.
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --effort=low "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 4
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/history-state" "$PROMPT_OPT" --history "$(sha256sum "$TMP/request.md" | cut -d' ' -f1)" >"$TMP/history-variants.out"
test "$(grep -c '^===' "$TMP/history-variants.out")" -eq 6
# Source and Pi-version changes must miss the cache; unusable versions never cache.
mkdir -p "$TMP/lab"
printf 'lab instructions\n' >"$TMP/lab/AGENTS.md"
printf 'lab source\n' >"$TMP/lab/guide.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/invalidation-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
printf 'changed source\n' >>"$TMP/lab/guide.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/invalidation-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 6
PATH="$TMP/mock-bin:$PATH" PI_VERSION=1.1.0 PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/version-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" PI_VERSION=1.2.0 PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/version-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" PI_VERSION=1.2.0 PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/version-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 8
PATH="$TMP/mock-bin:$PATH" PI_VERSION=invalid PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/invalid-version-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" PI_VERSION=invalid PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/invalid-version-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 10
# Empty lab directories are part of the source fingerprint.
FP_BEFORE=$(node "$HISTORY_HELPER" fingerprint "$TMP/lab" 1.1.0 openai luna high pi openai-codex gpt-6-luna high)
mkdir "$TMP/lab/empty-folder"
FP_ADDED=$(node "$HISTORY_HELPER" fingerprint "$TMP/lab" 1.1.0 openai luna high pi openai-codex gpt-6-luna high)
test "$FP_BEFORE" != "$FP_ADDED"
rmdir "$TMP/lab/empty-folder"
# A lab mutation during optimization produces an unverified record; restoring the source must still miss.
MUTATE_LAB="$TMP/lab" PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/mutating-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
rm -f "$TMP/lab/.runtime-change"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$TMP/lab" XDG_STATE_HOME="$TMP/mutating-state" "$PROMPT_OPT" "$TMP/request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq 12
# Legacy layouts/snapshots are archived before any mutable state write.
LAYOUT="$TMP/layout-state/prompt-opt"
mkdir -p "$LAYOUT"
printf 'draft bytes\001' >"$LAYOUT/last-input.md"
printf 'successful bytes\002' >"$LAYOUT/last-successful-input.md"
printf 'legacy layout output\003' >"$LAYOUT/last-output.md"
printf 'draft settings\004' >"$LAYOUT/last-settings.txt"
printf 'success settings\005' >"$LAYOUT/last-successful-settings.txt"
cp "$LAYOUT/last-input.md" "$TMP/legacy-layout-draft"
cp "$LAYOUT/last-successful-input.md" "$TMP/legacy-layout-success"
cp "$LAYOUT/last-output.md" "$TMP/legacy-layout-output"
cp "$LAYOUT/last-settings.txt" "$TMP/legacy-draft-settings"
cp "$LAYOUT/last-successful-settings.txt" "$TMP/legacy-success-settings"
DRAFT_HASH=$(sha256sum "$LAYOUT/last-input.md" | cut -d' ' -f1)
SUCCESS_HASH=$(sha256sum "$LAYOUT/last-successful-input.md" | cut -d' ' -f1)
printf 'fresh task\n' >"$TMP/fresh-request.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/layout-state" "$PROMPT_OPT" "$TMP/fresh-request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/layout-state" "$PROMPT_OPT" --history "$DRAFT_HASH" >"$TMP/layout-draft.out"
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/layout-state" "$PROMPT_OPT" --history "$SUCCESS_HASH" >"$TMP/layout-success.out"
grep -q 'draft bytes' "$TMP/layout-draft.out"
grep -q 'successful bytes' "$TMP/layout-success.out"
grep -q 'legacy layout output' "$TMP/layout-draft.out"
grep -q 'legacy layout output' "$TMP/layout-draft.out"
cmp "$TMP/legacy-layout-draft" "$(find "$LAYOUT/history/$DRAFT_HASH/unverified" -type f -name original.md | head -n 1)"
cmp "$TMP/legacy-layout-success" "$(find "$LAYOUT/history/$SUCCESS_HASH/unverified" -type f -name original.md | head -n 1)"
cmp "$TMP/legacy-layout-output" "$(find "$LAYOUT/history/$DRAFT_HASH/unverified" -type f -name optimized.md | head -n 1)"
cmp "$TMP/legacy-layout-output" "$(find "$LAYOUT/history/$SUCCESS_HASH/unverified" -type f -name optimized.md | head -n 1)"
cmp "$TMP/legacy-draft-settings" "$(find "$LAYOUT/history/$DRAFT_HASH/unverified" -type f -name last-settings.txt | head -n 1)"
cmp "$TMP/legacy-success-settings" "$(find "$LAYOUT/history/$SUCCESS_HASH/unverified" -type f -name last-successful-settings.txt | head -n 1)"
# A complete-looking record with invalid settings cannot suppress the replacement archive.
INVALID_ARCHIVE="$TMP/invalid-dedup-state/prompt-opt"
mkdir -p "$INVALID_ARCHIVE"
printf 'legacy request\001' >"$INVALID_ARCHIVE/last-input.md"
printf 'legacy optimized\002' >"$INVALID_ARCHIVE/last-output.md"
INVALID_HASH=$(sha256sum "$INVALID_ARCHIVE/last-input.md" | cut -d' ' -f1)
INVALID_RECORD="$INVALID_ARCHIVE/history/$INVALID_HASH/unverified/legacy-corrupt-settings"
mkdir -p "$INVALID_RECORD"
cp "$INVALID_ARCHIVE/last-input.md" "$INVALID_RECORD/original.md"
cp "$INVALID_ARCHIVE/last-output.md" "$INVALID_RECORD/optimized.md"
node - "$INVALID_RECORD/metadata.json" "$INVALID_RECORD/original.md" "$INVALID_RECORD/optimized.md" <<'NODE'
const fs=require('fs'),crypto=require('crypto'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(process.argv[3]),output=fs.readFileSync(process.argv[4]);
fs.writeFileSync(process.argv[2],JSON.stringify({schema:1,compatibility:'unverified',settings:'bad',request_sha256:hash(original),optimized_sha256:hash(output),origin:'legacy',legacy_settings:[]}));
NODE
cp "$INVALID_RECORD/metadata.json" "$TMP/invalid-record-metadata"
cp "$INVALID_RECORD/original.md" "$TMP/invalid-record-original"
cp "$INVALID_RECORD/optimized.md" "$TMP/invalid-record-optimized"
printf 'replacement request\n' >"$TMP/replacement-request.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/invalid-dedup-state" "$PROMPT_OPT" "$TMP/replacement-request.md" >/dev/null 2>&1
cmp "$TMP/invalid-record-metadata" "$INVALID_RECORD/metadata.json"
cmp "$TMP/invalid-record-original" "$INVALID_RECORD/original.md"
cmp "$TMP/invalid-record-optimized" "$INVALID_RECORD/optimized.md"
INVALID_RECORD_COUNT=$(find "$INVALID_ARCHIVE/history/$INVALID_HASH/unverified" -mindepth 1 -maxdepth 1 -type d | wc -l)
test "$INVALID_RECORD_COUNT" -eq 2
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/invalid-dedup-state" "$PROMPT_OPT" --history "$INVALID_HASH" >"$TMP/invalid-dedup-history.out"
grep -q 'legacy optimized' "$TMP/invalid-dedup-history.out"
# The older draft-only layout remains recoverable when successful-input is absent.
DRAFT_ONLY="$TMP/draft-only-state/prompt-opt"
mkdir -p "$DRAFT_ONLY"
printf 'draft only raw' >"$DRAFT_ONLY/last-input.md"
printf 'draft only output' >"$DRAFT_ONLY/last-output.md"
DRAFT_ONLY_HASH=$(sha256sum "$DRAFT_ONLY/last-input.md" | cut -d' ' -f1)
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/draft-only-state" "$PROMPT_OPT" "$TMP/fresh-request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/draft-only-state" "$PROMPT_OPT" --history "$DRAFT_ONLY_HASH" >"$TMP/draft-only-show.out"
grep -q 'draft only raw' "$TMP/draft-only-show.out"
grep -q 'draft only output' "$TMP/draft-only-show.out"
# Incomplete deterministic archive is retained while a complete exclusive record is added.
BROKEN_STATE="$TMP/broken-archive-state/prompt-opt"
mkdir -p "$BROKEN_STATE"
printf 'broken request' >"$BROKEN_STATE/last-input.md"
printf 'broken request' >"$BROKEN_STATE/last-successful-input.md"
printf 'broken output' >"$BROKEN_STATE/last-output.md"
BROKEN_HASH=$(sha256sum "$BROKEN_STATE/last-successful-input.md" | cut -d' ' -f1)
BROKEN_ID="legacy-$(sha256sum "$BROKEN_STATE/last-output.md" | cut -d' ' -f1 | cut -c1-16)"
mkdir -p "$BROKEN_STATE/history/$BROKEN_HASH/unverified/$BROKEN_ID"
printf 'corrupt metadata preserved' >"$BROKEN_STATE/history/$BROKEN_HASH/unverified/$BROKEN_ID/metadata.json"
printf 'do not overwrite' >"$BROKEN_STATE/history/$BROKEN_HASH/unverified/$BROKEN_ID/sentinel"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/broken-archive-state" "$PROMPT_OPT" "$TMP/fresh-request.md" >/dev/null 2>&1
test "$(cat "$BROKEN_STATE/history/$BROKEN_HASH/unverified/$BROKEN_ID/metadata.json")" = 'corrupt metadata preserved'
test "$(cat "$BROKEN_STATE/history/$BROKEN_HASH/unverified/$BROKEN_ID/sentinel")" = 'do not overwrite'
BROKEN_RECORDS=$(find "$BROKEN_STATE/history/$BROKEN_HASH/unverified" -mindepth 1 -maxdepth 1 -type d | wc -l)
test "$BROKEN_RECORDS" -eq 2
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/broken-archive-state" "$PROMPT_OPT" --history "$BROKEN_HASH" >"$TMP/broken-archive-show.out"
grep -q 'broken output' "$TMP/broken-archive-show.out"
# Required legacy bytes plus an unarchivable history root must abort before mutable-state changes.
FAIL_STATE="$TMP/archive-failure-state/prompt-opt"
mkdir -p "$FAIL_STATE"
printf 'keep old draft' >"$FAIL_STATE/last-input.md"
printf 'keep old success' >"$FAIL_STATE/last-successful-input.md"
printf 'keep old output' >"$FAIL_STATE/last-output.md"
printf 'keep settings raw' >"$FAIL_STATE/last-settings.txt"
printf 'keep success settings raw' >"$FAIL_STATE/last-successful-settings.txt"
printf 'not a directory' >"$FAIL_STATE/history"
cp -a "$FAIL_STATE" "$TMP/archive-failure-before"
CALLS_BEFORE_ARCHIVE_FAILURE=$(wc -l <"$PI_CALLS")
if PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/archive-failure-state" "$PROMPT_OPT" "$TMP/fresh-request.md" >/dev/null 2>&1; then echo 'archive failure allowed state mutation' >&2; exit 1; fi
test "$(wc -l <"$PI_CALLS")" -eq "$CALLS_BEFORE_ARCHIVE_FAILURE"
cmp "$TMP/archive-failure-before/last-input.md" "$FAIL_STATE/last-input.md"
cmp "$TMP/archive-failure-before/last-settings.txt" "$FAIL_STATE/last-settings.txt"
# Source-context change during adoption confirmation must prevent modern cache eligibility.
LEGACY_STATE="$TMP/legacy-state/prompt-opt"
mkdir -p "$LEGACY_STATE"
printf 'legacy task\n' >"$LEGACY_STATE/last-input.md"
printf 'legacy task\n' >"$LEGACY_STATE/last-successful-input.md"
printf 'legacy optimized\n' >"$LEGACY_STATE/last-output.md"
LEGACY_HASH=$(sha256sum "$LEGACY_STATE/last-successful-input.md" | cut -d' ' -f1)
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/legacy-state" "$PROMPT_OPT" --history "$LEGACY_HASH" >"$TMP/legacy-show.out"
grep -q 'legacy optimized' "$TMP/legacy-show.out"
grep -q 'legacy/unverified' "$TMP/legacy-show.out"
# Another legacy pair is archived during a new optimization before last-output is replaced.
OVERWRITE_STATE="$TMP/legacy-overwrite-state/prompt-opt"
mkdir -p "$OVERWRITE_STATE"
printf 'old request\n' >"$OVERWRITE_STATE/last-input.md"
printf 'old request\n' >"$OVERWRITE_STATE/last-successful-input.md"
printf 'old output\n' >"$OVERWRITE_STATE/last-output.md"
OLD_HASH=$(sha256sum "$OVERWRITE_STATE/last-successful-input.md" | cut -d' ' -f1)
printf 'new request\n' >"$TMP/new-request.md"
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/legacy-overwrite-state" "$PROMPT_OPT" "$TMP/new-request.md" >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/legacy-overwrite-state" "$PROMPT_OPT" --history "$OLD_HASH" >"$TMP/old-after-overwrite.out"
grep -q 'old output' "$TMP/old-after-overwrite.out"
# Adoption cancellation leaves the legacy files untouched; confirmation creates an immutable reusable record.
cp "$LEGACY_STATE/last-output.md" "$TMP/legacy-output-copy"
printf 'original settings\n' >"$LEGACY_STATE/last-settings.txt"
cp "$LEGACY_STATE/last-settings.txt" "$TMP/legacy-settings-copy"
if printf 'n\n' | PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/legacy-state" "$PROMPT_OPT" --adopt-cache >/dev/null 2>&1; then echo 'adoption cancellation unexpectedly succeeded' >&2; exit 1; fi
cmp "$LEGACY_STATE/last-output.md" "$TMP/legacy-output-copy"
cmp "$LEGACY_STATE/last-settings.txt" "$TMP/legacy-settings-copy"
if printf 'y\n' | PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/legacy-state" "$PROMPT_OPT" --adopt-cache >"$TMP/adoption.out" 2>"$TMP/adoption.err"; then :; else cat "$TMP/adoption.err" >&2; echo 'adoption unexpectedly failed' >&2; exit 1; fi
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/legacy-state" "$PROMPT_OPT" --history "$LEGACY_HASH" >"$TMP/adopted-show.out"
grep -q 'legacy optimized' "$TMP/adopted-show.out"
printf 'legacy task\n' >"$TMP/adopt-request.md"
CALLS_BEFORE_ADOPT_HIT=$(wc -l <"$PI_CALLS")
PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/legacy-state" "$PROMPT_OPT" "$TMP/adopt-request.md" >/dev/null 2>&1
test "$(wc -l <"$PI_CALLS")" -eq "$CALLS_BEFORE_ADOPT_HIT"
UNVERIFIED="$TMP/unverified-adopt-state/prompt-opt"
mkdir -p "$UNVERIFIED"
printf 'unverified task\n' >"$UNVERIFIED/last-input.md"
printf 'unverified output\n' >"$UNVERIFIED/last-output.md"
printf 'unverified task\n' >"$UNVERIFIED/last-successful-input.md"
UNVERIFIED_HASH=$(sha256sum "$UNVERIFIED/last-input.md" | cut -d' ' -f1)
printf 'y\n' | PATH="$TMP/mock-bin:$PATH" PI_VERSION=invalid PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/unverified-adopt-state" "$PROMPT_OPT" --adopt-cache >/dev/null 2>&1
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/unverified-adopt-state" "$PROMPT_OPT" --history "$UNVERIFIED_HASH" >"$TMP/unverified-adopt.out"
grep -q 'unverified' "$TMP/unverified-adopt.out"
# Source-context change during adoption confirmation must prevent modern cache eligibility.
RACE_BIN="$TMP/race-bin"
mkdir -p "$RACE_BIN" "$TMP/race-state/prompt-opt"
cat >"$RACE_BIN/pi" <<'RACE_PI'
#!/bin/sh
if [ "${1:-}" = --version ]; then
  count=0; [ ! -f "$PI_VERSION_COUNT" ] || count=$(cat "$PI_VERSION_COUNT")
  count=$((count + 1)); printf '%s\n' "$count" >"$PI_VERSION_COUNT"
  if [ "$count" -eq 1 ]; then echo 1.1.0; else echo 1.2.0; fi
  exit 0
fi
echo 'unexpected optimizer call' >>"$PI_CALLS"
echo 'optimized race'
RACE_PI
chmod +x "$RACE_BIN/pi"
printf 'race request' >"$TMP/race-state/prompt-opt/last-input.md"
printf 'race request' >"$TMP/race-state/prompt-opt/last-successful-input.md"
printf 'race output' >"$TMP/race-state/prompt-opt/last-output.md"
printf 'y\n' | PATH="$RACE_BIN:$TMP/mock-bin:$PATH" PI_VERSION_COUNT="$TMP/pi-version-count" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/race-state" "$PROMPT_OPT" --adopt-cache >/dev/null 2>&1
RACE_HASH=$(sha256sum "$TMP/race-state/prompt-opt/last-input.md" | cut -d' ' -f1)
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/race-state" "$PROMPT_OPT" --history "$RACE_HASH" >"$TMP/race-show.out"
grep -q 'unverified' "$TMP/race-show.out"
# A clipboard failure must not discard a successful optimization record.
printf 'clipboard recovery task\n' >"$TMP/recovery.md"
if PATH="$TMP/mock-bin:$PATH" FAIL_CLIPBOARD=1 PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/recovery-state" "$PROMPT_OPT" "$TMP/recovery.md" >"$TMP/recovery.out" 2>/dev/null; then
  echo 'clipboard failure unexpectedly succeeded' >&2; exit 1
fi
PATH="$TMP/mock-bin:$PATH" XDG_STATE_HOME="$TMP/recovery-state" "$PROMPT_OPT" --history "$(sha256sum "$TMP/recovery.md" | cut -d' ' -f1)" >"$TMP/recovery-history.out"
grep -q 'optimized-' "$TMP/recovery-history.out"
printf '%s\n' 'sample task' | PATH="$TMP/mock-bin:$PATH" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/prompt-state-run" \
  "$PROMPT_OPT" --debug - >"$TMP/prompt-run.out" 2>"$TMP/prompt-run.log"
grep -q 'phase=pi_start' "$TMP/prompt-run.log"
grep -q 'phase=pi_complete status=0' "$TMP/prompt-run.log"
grep -q 'phase=clipboard_complete' "$TMP/prompt-run.log"
grep -q 'phase=complete' "$TMP/prompt-run.log"
# --goal persists the complete optimized prompt and emits a machine-readable handoff result.
GOAL_HOME="$TMP/goal space 'and\" quote O'Brien"
mkdir -p "$GOAL_HOME"
GOAL_SESSION=01a17a4d-c236-7573-b7e3-60a763bbbec8
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" \
  GOAL_MODE=1 GOAL_INPUT_CAPTURE="$TMP/goal-input" CLIP_CAPTURE="$TMP/goal-clip" \
  "$PROMPT_OPT" --goal --context 'inspect read-only sources' - >"$TMP/goal-output.json" 2>"$TMP/goal-output.err"
printf 'Complete execution prompt\nwith all requirements.' >"$TMP/expected-goal-prompt"
node - "$TMP/goal-output.json" "$TMP/expected-goal-objective.txt" "$GOAL_HOME/.pi/agent/handoffs/$GOAL_SESSION" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const parsed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const [sessionDir] = [process.argv[4]];
assert.equal(parsed.status, "handoff-written");
assert.ok(parsed.handoff_path.startsWith(`${sessionDir}/`), "handoff must live under the session directory");
assert.ok(parsed.handoff_path.endsWith(".md"));
const expected = `Implement the "requested" feature while preserving user's stated constraints and C:\\tools paths. The authoritative task specification is at: \`${parsed.handoff_path}\`. Read it fully before execution; after compaction or whenever requirements become unclear, consult it again to preserve its requirements; verify its acceptance criteria before completing the goal.`;
assert.equal(parsed.objective, expected);
assert.ok(parsed.objective.length <= 4000);
fs.writeFileSync(process.argv[3], parsed.handoff_path);
NODE
GOAL_HANDOFF=$(cat "$TMP/expected-goal-objective.txt")
test -n "$GOAL_HANDOFF"
test "$(dirname "$GOAL_HANDOFF")" = "$GOAL_HOME/.pi/agent/handoffs/$GOAL_SESSION"
cmp "$GOAL_HANDOFF" "$TMP/expected-goal-prompt"
# No copy-ready command, no re-printed prompt, exactly one optimizer call, no prompt-opt state writes.
! grep -q '^/goal ' "$TMP/goal-output.json"
! grep -Fq '/goal Complete' "$TMP/goal-output.json"
! grep -Fq 'Complete execution prompt' "$TMP/goal-output.json"
test "$(wc -l <"$TMP/goal-calls" | tr -d ' ')" -eq 1
test ! -e "$TMP/goal-state/prompt-opt"
grep -q 'OPT-IN GOAL HANDOFF OUTPUT CONTRACT' "$TMP/goal-input"
grep -q '"goal_objective"' "$TMP/goal-input"
! grep -q '"objective_summary"' "$TMP/goal-input"
grep -qi 'do not execute the task' "$TMP/goal-input"
grep -q 'CONTEXT REQUEST:' "$TMP/goal-input"
grep -q 'inspect read-only sources' "$TMP/goal-input"
grep -q 'Goal handoff saved to: ' "$TMP/goal-output.err"
grep -q 'Goal activation is owned by the Pi extension' "$TMP/goal-output.err"
test "$(node -e 'console.log((require("node:fs").statSync(process.argv[1]).mode & 0o777).toString(8))' "$GOAL_HANDOFF")" = 600
test "$(node -e 'console.log((require("node:fs").statSync(process.argv[1]).mode & 0o777).toString(8))' "$(dirname "$GOAL_HANDOFF")")" = 700
test "$(node -e 'console.log((require("node:fs").statSync(process.argv[1]).mode & 0o777).toString(8))' "$(dirname "$(dirname "$GOAL_HANDOFF")")")" = 700
# A second run must retain the first handoff and use a distinct path.
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" \
  GOAL_MODE=1 CLIP_CAPTURE="$TMP/goal-clip" "$PROMPT_OPT" --goal - >"$TMP/goal-output-2.json"
GOAL_HANDOFF_2=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).handoff_path)' "$TMP/goal-output-2.json")
test "$GOAL_HANDOFF" != "$GOAL_HANDOFF_2"
cmp "$GOAL_HANDOFF" "$TMP/expected-goal-prompt"
test "$(wc -l <"$TMP/goal-calls" | tr -d ' ')" -eq 2
# Clipboard problems cannot block a persisted handoff, because goal mode does not use the clipboard.
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" \
  GOAL_MODE=1 CLIP_CAPTURE="$TMP/goal-clip" FAIL_CLIPBOARD=1 "$PROMPT_OPT" --goal - >"$TMP/goal-clipboard-failure.json"
node -e 'const v = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (v.status !== "handoff-written") process.exit(1)' "$TMP/goal-clipboard-failure.json"
test "$(wc -l <"$TMP/goal-calls" | tr -d ' ')" -eq 3
# Missing session identity must fail without printing a handoff result.
if printf 'original task\n' | env -u PI_SESSION_ID HOME="$GOAL_HOME" PROMPT_LAB_DIR="$LAB" XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" GOAL_MODE=1 "$PROMPT_OPT" --goal - >"$TMP/goal-missing-session.out" 2>"$TMP/goal-missing-session.err"; then
  echo 'goal mode accepted missing PI_SESSION_ID' >&2; exit 1
fi
grep -q 'PI_SESSION_ID' "$TMP/goal-missing-session.err"
test ! -s "$TMP/goal-missing-session.out"
# Refuse a handoff directory symlink and do not report a handoff result.
GOAL_BROKEN_HOME="$TMP/goal-broken-home"
mkdir -p "$GOAL_BROKEN_HOME/.pi/agent" "$TMP/elsewhere"
ln -s "$TMP/elsewhere" "$GOAL_BROKEN_HOME/.pi/agent/handoffs"
if printf 'original task\n' | env HOME="$GOAL_BROKEN_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" \
  GOAL_MODE=1 "$PROMPT_OPT" --goal - >"$TMP/goal-fs-failure.out" 2>"$TMP/goal-fs-failure.err"; then
  echo 'goal mode followed a handoff-directory symlink' >&2; exit 1
fi
grep -q 'unsafe handoff directory' "$TMP/goal-fs-failure.err"
test ! -s "$TMP/goal-fs-failure.out"
# A host with no clipboard tool must still be able to persist a handoff.
GOAL_MIN_BIN="$TMP/goal-min-bin"
mkdir -p "$GOAL_MIN_BIN"
for tool in bash node dirname mktemp rm mv cp grep head wc tr cat sed; do
  ln -sf "$(command -v "$tool")" "$GOAL_MIN_BIN/$tool"
done
cp "$TMP/mock-bin/pi" "$GOAL_MIN_BIN/pi"
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$GOAL_MIN_BIN" PI_CALLS="$TMP/goal-calls" GOAL_MODE=1 \
  "$PROMPT_OPT" --goal - >"$TMP/goal-no-clipboard.json" 2>"$TMP/goal-no-clipboard.err"
node -e 'const v = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (v.status !== "handoff-written") process.exit(1)' "$TMP/goal-no-clipboard.json"
! grep -q 'xclip\|pbcopy' "$TMP/goal-no-clipboard.err"
# Pi session ids are path-safe ids, not necessarily UUIDs.
GOAL_NAMED_SESSION='my_session.1'
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_NAMED_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" GOAL_MODE=1 \
  "$PROMPT_OPT" --goal - >"$TMP/goal-named-session.json"
node -e '
const v = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (!v.handoff_path.includes(process.argv[2])) process.exit(1);
' "$TMP/goal-named-session.json" "/$GOAL_NAMED_SESSION/"
# A fenced JSON answer is still a usable handoff.
printf '```json\n{"optimized_prompt":"fenced prompt","goal_objective":"fenced objective"}\n```\n' >"$TMP/goal-fenced.json"
printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" GOAL_MODE=1 \
  GOAL_OUTPUT_FILE="$TMP/goal-fenced.json" "$PROMPT_OPT" --goal - >"$TMP/goal-fenced.out"
grep -q '"status":"handoff-written"' "$TMP/goal-fenced.out"
# Reject objectives that exceed pi-goal's documented limit.
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({optimized_prompt:"prompt",goal_objective:"x".repeat(4000)}))' "$TMP/goal-too-long.json"
if printf 'original task\n' | env HOME="$GOAL_HOME" PI_SESSION_ID="$GOAL_SESSION" PROMPT_LAB_DIR="$LAB" \
  XDG_STATE_HOME="$TMP/goal-state" PATH="$TMP/mock-bin:$PATH" PI_CALLS="$TMP/goal-calls" GOAL_MODE=1 \
  GOAL_OUTPUT_FILE="$TMP/goal-too-long.json" "$PROMPT_OPT" --goal - >"$TMP/goal-too-long.out" 2>"$TMP/goal-too-long.err"; then
  echo 'goal mode accepted an oversized objective' >&2; exit 1
fi
grep -q '4000-character limit' "$TMP/goal-too-long.err"
test ! -s "$TMP/goal-too-long.out"

node "$ROOT/tests/prompt-opt-extension.mjs"
printf 'prompt-opt tests passed\n'
