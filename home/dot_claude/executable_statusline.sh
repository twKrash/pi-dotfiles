#!/usr/bin/env bash
# Claude Code status line, three lines:
#   1 where:   model | dir | branch+git state | worktree | graph
#   2 session: tokens | context | cache
#   3 limits:  allowance | lines changed | plugin modes
in=$(cat)
j() { printf '%s' "$in" | jq -r "$1 // empty" 2>/dev/null; }
c() { printf '\033[38;5;%sm%s\033[0m' "$1" "$2"; }   # c <256-color> <text>
k() { awk -v n="${1:-0}" 'BEGIN{ if(n>=1e6) printf "%.1fM",n/1e6; else if(n>=1e3) printf "%.1fk",n/1e3; else printf "%d",n }'; }
# level color: green below $2, yellow below $3, red otherwise
lvl() { awk -v v="$1" -v w="$2" -v r="$3" 'BEGIN{ print (v<w)?108:((v<r)?179:167) }'; }
# seconds until epoch $1 as 2h10m / 45m
until_reset() {
  local d=$(( $1 - $(date +%s) )); [ "$d" -le 0 ] && return
  if [ "$d" -ge 3600 ]; then printf '%dh%02dm' $((d/3600)) $((d%3600/60)); else printf '%dm' $((d/60)); fi
}
# join non-empty args with " | "
join() { local s="" a; for a in "$@"; do [ -n "$a" ] && s+="${s:+ | }$a"; done; printf '%s' "$s"; }

model=$(j '.model.display_name')
dir=$(j '.workspace.current_dir'); dir=${dir:-$(j '.cwd')}

# --- line 1: where ---
gitpart=""; wt=""; graph=""
if root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null); then
  branch=$(git -C "$dir" symbolic-ref --short HEAD 2>/dev/null || git -C "$dir" rev-parse --short HEAD 2>/dev/null)
  st=$(git -C "$dir" status --porcelain=v1 -b 2>/dev/null)
  flags=""
  printf '%s\n' "$st" | tail -n +2 | grep -q '^.[MADRCU?]' && flags+="*"
  printf '%s\n' "$st" | tail -n +2 | grep -q '^[MADRCU]' && flags+="+"
  ahead=$(printf '%s' "$st" | head -1 | sed -nE 's/.*ahead ([0-9]+).*/\1/p')
  behind=$(printf '%s' "$st" | head -1 | sed -nE 's/.*behind ([0-9]+).*/\1/p')
  [ -n "$ahead" ] && flags+="↑$ahead"; [ -n "$behind" ] && flags+="↓$behind"
  gitpart="${branch}${flags}"
  [ "$(git -C "$dir" rev-parse --git-dir 2>/dev/null)" != "$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null)" ] \
    && wt="wt:$(basename "$root")"
  if [ -d "$root/graphify-out" ]; then graph=$(c 108 graph); else graph=$(c 244 'graph✗'); fi
fi
line1=$(join "${model:-?}" "${dir/#$HOME/~}" "$gitpart" "$wt" "$graph")

# --- line 2: session ---
in_tok=$(j '.context_window.total_input_tokens'); out_tok=$(j '.context_window.total_output_tokens')
tok="tok $(k "$in_tok")↑ $(k "$out_tok")↓"

ctx=""
ctx_pct=$(j '.context_window.used_percentage'); ctx_size=$(j '.context_window.context_window_size')
if [ -n "$ctx_pct" ]; then
  ctx="ctx $(c "$(lvl "$ctx_pct" 70 85)" "$(printf '%.0f' "$ctx_pct")%")"
  [ -n "$ctx_size" ] && ctx+=" of $(k "$ctx_size")"
fi

cache=""
cu_in=$(j '.context_window.current_usage.input_tokens')
cu_cc=$(j '.context_window.current_usage.cache_creation_input_tokens')
cu_cr=$(j '.context_window.current_usage.cache_read_input_tokens')
total=$(( ${cu_in:-0} + ${cu_cc:-0} + ${cu_cr:-0} ))
if [ "$total" -gt 0 ]; then
  hit=$(( ${cu_cr:-0} * 100 / total ))
  # inverted scale: low hit ratio is bad
  col=$(awk -v h="$hit" 'BEGIN{ print (h>=70)?108:((h>=50)?179:167) }')
  cache="cache $(c "$col" "${hit}% hit") ($(k "${cu_cr:-0}") read / $(k "${cu_cc:-0}") miss)"
fi
line2=$(join "$tok" "$ctx" "$cache")

# --- line 3: limits, edits, modes ---
lim=""
for w in five_hour:5h seven_day:7d; do
  key=${w%%:*}; lab=${w##*:}
  p=$(j ".rate_limits.$key.used_percentage"); [ -z "$p" ] && continue
  r=$(j ".rate_limits.$key.resets_at"); rs=""
  [ -n "$r" ] && rs=$(until_reset "$r") && [ -n "$rs" ] && rs=" ($rs)"
  lim+="${lim:+ }$lab $(c "$(lvl "$p" 70 90)" "$(printf '%.0f' "$p")%")$rs"
done
[ -n "$lim" ] && lim="limit $lim"

lines=""
la=$(j '.cost.total_lines_added'); lr=$(j '.cost.total_lines_removed')
{ [ "${la:-0}" -gt 0 ] || [ "${lr:-0}" -gt 0 ]; } && lines="$(c 108 "+${la:-0}") $(c 167 "-${lr:-0}")"

# plugin modes: flag files written by the plugins' hooks
cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
modes=""
[ -f "$cfg/.caveman-active" ] && m=$(head -n1 "$cfg/.caveman-active" | tr -d '[:space:]') && [ -n "$m" ] && [ "$m" != off ] && modes+="caveman:$m "
[ -f "$cfg/.ponytail-active" ] && m=$(head -n1 "$cfg/.ponytail-active" | tr -d '[:space:]') && modes+="ponytail:${m:-full} "
line3=$(join "$lim" "$lines" "${modes% }")

for l in "$line1" "$line2" "$line3"; do [ -n "$l" ] && printf '%s\n' "$l"; done
