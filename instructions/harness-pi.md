# Pi harness addendum

This section only specializes the instructions above for Pi. Setup appends it to the installed global `AGENTS.md`, which Pi always loads; a project's `.pi/APPEND_SYSTEM.md` would replace a global `APPEND_SYSTEM.md`.

- Graphify: install the skill with `graphify install --platform pi`; invoke it as `/skill:graphify`.

## Locations

- Global memory: `~/.pi/agent/MEMORY.md`.
- Scratch space: `~/.pi/tmp/`. Never put project worktrees there.

## Delegation

Use `pi-subagents` for delegated agent work. Do not use Herdr agent spawns for implementation, review, or other delegation unless the user explicitly requests Herdr or `pi-subagents` is unavailable.

## Worktrees

When a task needs a managed worktree and Herdr is available, create or open it with `herdr worktree list`, `herdr worktree create`, or `herdr worktree open` so it stays visible in the Herdr UI. Do not use `herdr_spawn_agent` for this, and do not combine worktree creation with delegated execution: run `pi-subagents` with that worktree as its working directory.

If Herdr is expected to be available but fails, report the failure rather than silently changing mechanisms.

## Tool orchestration

- Use `codemode` to orchestrate:
  - two or more independent tool operations (use `Promise.allSettled()` where failures should be isolated);
  - dependent or chained tool operations;
  - repeated queries, bulk work, or large outputs that need filtering or summarizing.
- Inside `codemode`, prefer `ctx_*` tools for context-heavy work so raw output remains in the sandbox and only the derived result returns. Typical order of preference:
  `codemode` → `ctx_batch_execute` → `ctx_execute` / `ctx_execute_file` → `ctx_search`.
  This orchestration rule takes precedence over context-mode's standalone tool-selection hierarchy.
- Use tools directly when:
  - the operation is a single short call;
  - a tool's contract requires direct invocation (for example, native `subagent`);
  - performing file mutations with `edit` or `write`;
  - the operation must continue after the `codemode` script exits.
- Prefer `ctx_batch_execute` for independent or parallel gathering, `ctx_execute` for computation/filtering, `ctx_execute_file` for analyzing file contents without exposing raw data to the parent context, and `ctx_search` for targeted retrieval from already indexed context.
- Do not invoke native `subagent` through `codemode`. Launch `pi-subagents` directly so supervision, progress, lifecycle, and completion semantics remain visible to the parent. `herdr_*` tools may be orchestrated through `codemode` when appropriate.
