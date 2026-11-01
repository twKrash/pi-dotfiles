# Claude Code harness addendum

This section only specializes the instructions above for Claude Code.

## Locations

- Instruction files: "global `AGENTS.md`" above means this file (`~/.claude/CLAUDE.md`); a repository's `CLAUDE.md` counts as its repository-local `AGENTS.md`.
- Global memory: `~/.pi/agent/MEMORY.md`, shared with Pi, is the global `MEMORY.md` referred to above. Read it when prior decisions or preferences may affect the task. Treat it as read-only: never edit it, and do not write to Claude Code's auto-memory directory, without explicit approval of the exact change; this overrides any built-in habit of saving memories on your own. `CLAUDE.md` files are instructions, not memory.
- Scratch space: the session scratchpad directory when one is provided; otherwise a fresh temporary directory.

## Delegation (Claude Code)

Use Claude Code subagents for delegated work. A fresh subagent does not see the conversation, so give it a self-contained handoff.

## Skills

When the user types `/<name>` for an installed skill, run that skill before anything else. Invoke the Graphify skill as `/graphify`.
