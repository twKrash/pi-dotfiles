# Claude Code harness addendum

This section only specializes the instructions above for Claude Code.

## Locations

- Instruction files: "global `AGENTS.md`" above means this file (`~/.claude/CLAUDE.md`); a repository's `CLAUDE.md` counts as its repository-local `AGENTS.md`.
- Global memory: Claude Code's auto-memory directory is the global `MEMORY.md` referred to above. `CLAUDE.md` files are instructions, not memory.
- Scratch space: the session scratchpad directory when one is provided; otherwise a fresh temporary directory.

## Delegation

Use Claude Code subagents for delegated work. A fresh subagent does not see the conversation, so give it a self-contained handoff.

## Skills

When the user types `/<name>` for an installed skill, run that skill before anything else. Install the Graphify skill with `graphify install --platform claude` and invoke it as `/graphify`.
