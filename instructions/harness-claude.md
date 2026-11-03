# Claude Code harness addendum

This section only specializes the instructions above for Claude Code.

## Locations

- Instruction files: "global `AGENTS.md`" above means this file (`~/.claude/CLAUDE.md`); a repository's `CLAUDE.md` counts as its repository-local `AGENTS.md`.
- Global memory: see "Memory discipline" above. `CLAUDE.md` files are instructions, not memory.
- Scratch space: the session scratchpad directory when one is provided; otherwise a fresh temporary directory.

## Delegation (Claude Code)

Use Claude Code subagents for delegated work. A fresh subagent does not see the conversation, so give it the self-contained brief described above.

## Skills

When the user types `/<name>` for an installed skill, run that skill before anything else. Invoke the Graphify skill as `/graphify`.

## Plugins

Claude Code plugins are shared across machines through pi-dotfiles: `claude/settings.json` lists `extraKnownMarketplaces` and `enabledPlugins`, merged into `~/.claude/settings.json` by `chezmoi apply`. When I ask you to install a plugin or marketplace, install it, then add its marketplace and `enabledPlugins` entry to `claude/settings.json` in chezmoi's source directory and show me the change. Do not commit or push without my approval. Plugins run code: review one before installing it.
