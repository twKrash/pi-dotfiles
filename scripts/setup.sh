#!/bin/sh
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
AGENT_DIR=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
DRY_RUN=0
FORCE=0
PROVIDER=
for arg do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --provider=*)
      PROVIDER=${arg#*=}
      case "$PROVIDER" in
        codex|claude) ;;
        *) printf 'Unsupported provider: %s (choose codex or claude)\n' "$PROVIDER" >&2; exit 2 ;;
      esac
      ;;
    -h|--help) printf 'Usage: %s [--dry-run] [--force] [--provider=codex|claude]\n' "$0"; exit 0 ;;
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
    printf 'CONFLICT preserved %s; candidate: %s.pi-dotfiles-new\n' "$target" "$target"
    if [ "$DRY_RUN" -eq 0 ]; then
      candidate="$target.pi-dotfiles-new"
      if [ ! -L "$candidate" ]; then cp "$src" "$candidate"; fi
    fi
    return
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

copy_one "$ROOT/agent/AGENTS.md" "$AGENT_DIR/AGENTS.md"
copy_one "$ROOT/agent/MEMORY.md.template" "$AGENT_DIR/MEMORY.md" yes
copy_tree "$ROOT/agent/extensions" "$AGENT_DIR/extensions"
copy_tree "$ROOT/agent/skills" "$AGENT_DIR/skills"
