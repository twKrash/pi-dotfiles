# pi-dotfiles

Portable user-level config for [Pi](https://pi.dev), maintained for `twKrash`. This repository contains config and skill files only; Pi packages are referenced, not vendored.

## Install or update

```sh
git clone https://github.com/twKrash/pi-dotfiles.git
cd pi-dotfiles
./scripts/setup.sh --dry-run
./scripts/setup.sh
./scripts/setup.sh --provider=claude
./scripts/setup.sh --provider=codex
```

The target defaults to `~/.pi/agent`. Set `PI_CODING_AGENT_DIR` to use another Pi agent directory. `setup.sh` uses POSIX `/bin/sh` and Node.js (already required by Pi).

- `settings.json`: merges package sources and portable subagent role defaults; keeps other settings and existing package entries. `--provider=codex|claude` selects model/thinking defaults for subagents; explicit selection replaces only those fields, preserving local tool allowlists and other role settings. Claude profile adds `npm:pi-claude-agent-sdk` (setup does not install packages).
- `mcp.json`: adds Context7 only; preserves other MCP servers. A conflicting local Context7 entry is kept unless `--force` is used.
- Managed files: new files are copied; differing files are preserved and staged beside the target as `.pi-dotfiles-new`.
- `MEMORY.md`: created from the empty template only when absent. Existing memory is never overwritten.
- `--force`: backs up and replaces conflicting managed files. It still preserves unrelated settings and MCP servers.

Review staged `.pi-dotfiles-new` files before applying them. The script does not remove packages or run package installers. After reviewing package sources, use Pi's package commands (for example `pi update --extensions`) to install or update executable extensions.

To update configs after fetching repository changes:

```sh
git pull --ff-only
./scripts/setup.sh --dry-run
./scripts/setup.sh
./scripts/setup.sh --provider=claude
./scripts/setup.sh --provider=codex
```

## Included config

- `agent/AGENTS.md`: general user-level Pi instructions.
- `agent/MEMORY.md.template`: headings only; no personal memory content.
- `agent/settings.json`: package list and portable `pi-subagents` role defaults. Provider model IDs live in opt-in `agent/providers/` profiles.
- `agent/mcp.json`: Context7 endpoint only; personal MCP headers are excluded.
- `agent/extensions/`: permission-system, RTK optimizer, and subagent settings.
- `agent/providers/`: opt-in `codex` and `claude` subagent model profiles.
- `agent/skills/graphify/`: Graphify skill and references, with upstream MIT notice in `third_party/licenses/`.

Provider profiles set scout to a low-cost model, worker to a mid-tier model, reviewer to Opus 5.5 at medium effort, and oracle to Opus 5.5 at high effort for Claude. Use per-run thinking overrides for oracle `xhigh` when task warrants it. No provider option leaves existing models untouched.

The package list follows the currently selected npm/Git extensions. `pi-session-inspector` uses its published package (`@twkrash/pi-session-inspector@1.5.3`), not a development checkout. Pi packages can execute code; review them before installing.

The permission template follows `@gotgenes/pi-permission-system`'s config format. It keeps the plugin's allow-within-project default, denies secret-like `.env` files, asks before shell commands and external-directory access, and grants only explicit global tool paths. Reads and writes use separate external-directory rules. Debug and review logs are disabled to avoid retaining prompts and tool inputs.

## Repository protection

`main` is protected: changes require a pull request; force pushes and branch deletion are disabled; administrators are subject to the rule. No approval count is required so a sole maintainer can merge their own PR. Public users can submit PRs but have no direct write access. Only maintainers with repository write permission can merge.

## License

Repository config is MIT licensed. Graphify files retain their upstream MIT notice; see `third_party/licenses/graphify-MIT.txt`.
