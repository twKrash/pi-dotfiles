# pi-dotfiles

Portable user-level configuration, utilities, and skills for [Pi](https://pi.dev) and other agent harnesses (Claude Code, Codex), maintained for `twKrash` and applied with [chezmoi](https://www.chezmoi.io). Pi packages are referenced, not vendored.

## Install

```sh
brew install chezmoi                                   # or see chezmoi.io/install
git clone git@github.com:twKrash/pi-dotfiles.git ~/Work/code/pi-dotfiles
chezmoi init --source ~/Work/code/pi-dotfiles          # asks: harnesses on this machine, Pi subagent profile
chezmoi diff                                           # review
chezmoi apply
```

`chezmoi init` writes `~/.config/chezmoi/chezmoi.toml` with `sourceDir` (this checkout), the selected `harnesses` (`pi`, `claude`, `codex`), the Pi subagent `provider` profile (`none`, `claude`, `codex`), and `nvim -d` as merge tool. Answers are remembered; run `chezmoi init` again after the config template (`home/.chezmoi.toml.tmpl`) changes. Requirements: chezmoi, Node.js (already required by Pi), and `~/.local/bin` on `PATH`.

## Daily use

| Task | Command |
|---|---|
| Update | `git pull --ff-only && chezmoi diff && chezmoi apply` |
| A managed file was edited locally | `chezmoi apply` asks (diff / overwrite / skip); `chezmoi merge <file>` opens a 3-way merge |
| Copy a local edit back into the repo | `chezmoi re-add <file>` (plain files), then commit |
| Machine-only instructions | edit `~/.config/chezmoi/local.md`, then `chezmoi apply` |

## Harnesses

Each selected harness gets its own generated global instructions file; files of unselected harnesses are not installed (`home/.chezmoiignore`).

| Harness | Generated file | Contents |
|---|---|---|
| `pi` | `~/.pi/agent/AGENTS.md` | core + `instructions/harness-pi.md` + local |
| `claude` | `~/.claude/CLAUDE.md` | core + `instructions/harness-claude.md` + local |
| `codex` | `~/.codex/AGENTS.md` | core + local |

Core is `instructions/core.md` (no harness or provider specifics). Local is the optional `~/.config/chezmoi/local.md` for machine- or employer-specific rules; it never enters the repo. Edit these sources, not the generated files. Pi config, `prompt-opt`, and the prompt lab are installed only when `pi` is selected. The Pi addendum lives inside `AGENTS.md` because Pi always loads the global `AGENTS.md`, whereas a trusted project's `.pi/APPEND_SYSTEM.md` replaces the global `APPEND_SYSTEM.md`. Source files avoid the names `AGENTS.md`/`CLAUDE.md` so agents working in this repo do not load them as context. Target paths are fixed (`~/.pi/agent`, `~/.claude`, `~/.codex`).

## Layout

`.chezmoiroot` points chezmoi at `home/`, which mirrors `~` using chezmoi's [source naming](https://www.chezmoi.io/reference/source-state-attributes/) (`dot_` → `.`, `private_` → mode 0700/0600, `executable_`, `create_`, `empty_`, `modify_`, `.tmpl`). `~/.pi/agent` and its `extensions/` stay private because they sit next to Pi credentials. Plain files are copied as-is (and support `chezmoi re-add`); only generated files are templates.

- `home/dot_local/bin/executable_prompt-opt`, `prompt-opt-history.mjs`: the prompt optimizer CLI (`~/.local/bin`).
- `home/ai/prompt_engineering/`: canonical prompt-engineering lab (`~/ai/prompt_engineering`, the `prompt-opt` default; `PROMPT_LAB_DIR` overrides at runtime).
- `home/dot_pi/private_agent/private_extensions/`: prompt-opt Pi adapter plus permission-system, RTK optimizer, and subagent settings.
- `home/dot_pi/private_agent/skills/prompt-engineering/`: Pi skill generated from the lab (`SKILL.md` = Pi metadata + lab `AGENTS.md`; references included from the lab).
- `home/dot_pi/private_agent/create_empty_MEMORY.md`: memory template, created only when absent (an existing file, even an empty one, is kept).
- `home/dot_pi/private_agent/modify_settings.json.tmpl`, `modify_mcp.json.tmpl`: merge repo defaults into the live files via `scripts/merge-json.mjs` (stdin → stdout). Unrelated settings, extra packages, other MCP servers, and keys Pi writes itself are kept; conflicting local values win and are reported. The `claude`/`codex` profile replaces only subagent model/thinking fields; `none` leaves models untouched. The Claude profile adds `npm:pi-claude-agent-sdk` (packages are not installed; use `pi update --extensions` after review).
- `home/.chezmoitemplates/instructions.tmpl`: composes the per-harness instruction files.
- `instructions/`: core and per-harness instruction sources.
- `agent/settings.json`, `agent/mcp.json`, `agent/providers/`: merge inputs (package list and portable `pi-subagents` role defaults; Context7 only, no personal MCP headers; opt-in `codex` and `claude` subagent profiles).
- Graphify skill: not vendored. Install it with `graphify install --platform pi` (and `--platform claude`) and re-run after upgrading graphify.
- `tests/`: `sh tests/prompt-opt.sh` and `sh tests/chezmoi.sh` (applies into throwaway homes; never touches `~`).

### Prompt optimizer

`prompt-opt --model=sol` now selects GPT-6.1 Sol (`gpt-6.1-sol`). Use `--model=sol-6` for GPT-6 Sol (`gpt-6-sol`) or `--model=sol-6.1` explicitly for GPT-6.1 Sol.

Run `prompt-opt` for interactive prompt editing or pass a task file/stdin. Use `/prompt-opt` inside Pi to insert optimized output into the editor. Use `prompt-opt --history` to list recorded request hashes and `prompt-opt --history HASH` (or `/prompt-opt --history=HASH`) to display original and optimized prompts. `--no-cache` forces another run while preserving prior records. Cache identity includes the exact request bytes, seven resolved settings, prompt-lab files, Pi version, and contract revision. The optimizer run loads only the lab `AGENTS.md` (`--no-context-files`), so global or ancestor `AGENTS.md`/`CLAUDE.md` files do not affect results. Legacy results remain visible as unverified. Add `--debug` (alias `--verbose`) to log phase timings; the extension records metadata-only `prompt-opt-debug` entries in the current session. Run `prompt-opt --help` for options. The command needs `~/.local/bin` on `PATH`; clipboard copy uses `xclip` when available, otherwise `pbcopy`.

Provider profiles set scout to a low-cost model, worker to a mid-tier model, reviewer to Opus 5.5 at medium effort, and oracle to Opus 5.5 at high effort for Claude. Use per-run thinking overrides for oracle `xhigh` when task warrants it. No provider option leaves existing models untouched.

The package list follows the currently selected npm/Git extensions. `pi-session-inspector` uses its published package (`@twkrash/pi-session-inspector@1.5.3`), not a development checkout. Pi packages can execute code; review them before installing.

The permission template follows `@gotgenes/pi-permission-system`'s config format. It keeps the plugin's allow-within-project default, denies secret-like `.env` files, asks before shell commands and external-directory access, and grants only explicit global tool paths. Reads and writes use separate external-directory rules. Debug and review logs are disabled to avoid retaining prompts and tool inputs.

## Repository protection

`main` is protected: changes require a pull request; force pushes and branch deletion are disabled; administrators are subject to the rule. No approval count is required so a sole maintainer can merge their own PR. Public users can submit PRs but have no direct write access. Only maintainers with repository write permission can merge.

## License

Repository config is MIT licensed.
