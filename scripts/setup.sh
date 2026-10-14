#!/bin/sh
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
AGENT_DIR=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
DRY_RUN=0
FORCE=0
INTERACTIVE=0
exec 3<&0
PROVIDER=
for arg do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --interactive) INTERACTIVE=1 ;;
    --provider=*)
      PROVIDER=${arg#*=}
      case "$PROVIDER" in
        codex|claude) ;;
        *) printf 'Unsupported provider: %s (choose codex or claude)\n' "$PROVIDER" >&2; exit 2 ;;
      esac
      ;;
    -h|--help) printf 'Usage: %s [--dry-run] [--force] [--interactive] [--provider=codex|claude]\n' "$0"; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

run_merge() {
  kind=$1 src=$2 dst=$3 profile=${4:-}
  if PI_DOTFILES_DRY_RUN=$DRY_RUN PI_DOTFILES_FORCE=$FORCE node "$ROOT/scripts/merge-json.mjs" "$kind" "$src" "$dst" "$profile"; then
    return 0
  else
    result=$?
    [ "$result" -eq 3 ] || return "$result"
  fi
}

PROFILE=
[ -z "$PROVIDER" ] || PROFILE="$ROOT/agent/providers/$PROVIDER.json"
run_merge settings "$ROOT/agent/settings.json" "$AGENT_DIR/settings.json" "$PROFILE"
run_merge mcp "$ROOT/agent/mcp.json" "$AGENT_DIR/mcp.json"

copy_one() {
  src=$1 target=$2 create_only=${3:-no}
  if [ -L "$target" ]; then
    printf 'CONFLICT symlink preserved %s\n' "$target"
    return
  fi
  if [ "$create_only" = yes ] && [ -e "$target" ]; then
    printf 'PRESERVED %s\n' "$target"
    return
  fi
  if [ -f "$target" ] && cmp -s "$src" "$target"; then
    printf 'UNCHANGED %s\n' "$target"
    return
  fi
  if [ -e "$target" ] && [ "$FORCE" -ne 1 ]; then
    candidate="$target.pi-dotfiles-new"
    if [ "$INTERACTIVE" -eq 1 ]; then
      printf 'Conflict: %s\n  [u] update from repo (backup local)\n  [k] keep local and stage repo candidate\n  [s] skip\nChoice [s]: ' "$target" >&2
      IFS= read -r choice <&3 || { printf '\nNo choice received; preserving %s\n' "$target" >&2; return; }
      case "$choice" in
        u|U) ;;
        k|K)
          printf 'KEEP %s; candidate: %s\n' "$target" "$candidate"
          if [ "$DRY_RUN" -eq 0 ]; then
            if [ -e "$candidate" ] || [ -L "$candidate" ]; then
              printf 'CANDIDATE preserved %s\n' "$candidate"
            else
              cp "$src" "$candidate"
            fi
          fi
          return
          ;;
        *)
          printf 'SKIP %s\n' "$target"
          return
          ;;
      esac
    else
      printf 'CONFLICT preserved %s; candidate: %s.pi-dotfiles-new\n' "$target" "$target"
      if [ "$DRY_RUN" -eq 0 ]; then
        if [ -e "$candidate" ] || [ -L "$candidate" ]; then
          printf 'CANDIDATE preserved %s\n' "$candidate"
        else
          cp "$src" "$candidate"
        fi
      fi
      return
    fi
  fi
  printf '%s %s\n' "$([ "$DRY_RUN" -eq 1 ] && printf 'WOULD COPY' || printf 'COPY')" "$target"
  if [ "$DRY_RUN" -eq 1 ]; then return; fi
  mkdir -p "$(dirname "$target")"
  if [ -e "$target" ]; then
    backup="$target.pi-dotfiles-bak.$(date '+%Y%m%d%H%M%S').$$"
    cp -p "$target" "$backup"
    printf 'BACKUP %s\n' "$backup"
  fi
  tmp="$target.pi-dotfiles-tmp.$$"
  cp -p "$src" "$tmp"
  mv -f "$tmp" "$target"
}

copy_tree() {
  srcdir=$1 destdir=$2
  find "$srcdir" -type f -print | while IFS= read -r src; do
    rel=${src#"$srcdir"/}
    copy_one "$src" "$destdir/$rel"
  done
}

copy_one "$ROOT/bin/prompt-opt" "$HOME/.local/bin/prompt-opt"
copy_one "$ROOT/bin/prompt-opt-history.mjs" "$HOME/.local/bin/prompt-opt-history.mjs"
copy_tree "$ROOT/prompt_engineering" "$HOME/ai/prompt_engineering"
copy_one "$ROOT/agent/MEMORY.md.template" "$AGENT_DIR/MEMORY.md" yes
copy_tree "$ROOT/agent/extensions" "$AGENT_DIR/extensions"

skill_tmp=$(mktemp)
agents_tmp=$(mktemp)
trap 'rm -f "$skill_tmp" "$agents_tmp"' EXIT HUP INT TERM
# Pi always loads the global AGENTS.md, but a trusted project's .pi/APPEND_SYSTEM.md
# replaces the global one, so the Pi addendum is installed inside AGENTS.md.
{ cat "$ROOT/agent/AGENTS.md"; printf '\n'; cat "$ROOT/agent/AGENTS.pi.md"; } >"$agents_tmp"
chmod 644 "$agents_tmp"
copy_one "$agents_tmp" "$AGENT_DIR/AGENTS.md"
rm -f "$agents_tmp"
{
  cat <<'SKILL_HEADER'
---
name: prompt-engineering
description: Model-aware prompt creation, optimization, review, comparison, and explanation; use when working with prompts.
---

SKILL_HEADER
  cat "$ROOT/prompt_engineering/AGENTS.md"
} >"$skill_tmp"
chmod 644 "$skill_tmp"
copy_one "$skill_tmp" "$AGENT_DIR/skills/prompt-engineering/SKILL.md"
rm -f "$skill_tmp"
trap - EXIT HUP INT TERM
for file in prompt_engineering.md prompting-references.md prompt-optimization-playbook.md; do
  copy_one "$ROOT/prompt_engineering/$file" "$AGENT_DIR/skills/prompt-engineering/references/$file"
done
