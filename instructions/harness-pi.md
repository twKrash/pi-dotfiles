# Pi harness addendum

This section only specializes the instructions above for Pi.

## Locations

- Global memory: `~/.pi/agent/MEMORY.md`.
- Scratch space: `~/.pi/tmp/`. Never put project worktrees there.

## Handoffs

- For multi-step investigation or implementation work (delegated, spanning many tool calls, or likely to outlive a compaction), when `bash` is listed as callable, run `printf 'PI_SESSION_ID=%s\n' "$PI_SESSION_ID"` with that tool, require a non-empty result, and create a concise note at `~/.pi/tmp/handoffs/<PI_SESSION_ID>/<task-slug>.md` before work. If the current tool list does not expose `bash`, do not claim it is unavailable until checking the callable tools; if genuinely absent, do not substitute a context-mode subprocess for the session ID—explain the missing capability and pause only work that requires the ID. Skip the note for single-step requests and quick checks.
- Keep `~/.pi/tmp/handoffs/<PI_SESSION_ID>/ACTIVE.md` pointed at the current note. Update it at material milestones and completion; after compaction or resuming, use an available file-reading tool to read the pointer and note, then verify against current instructions and repository state.
- Never write under the shared handoffs root when the ID is empty. When a context-mode tool takes a session ID, pass this literal ID. Never include secrets in handoffs.

## Skills

Install the Graphify skill with `graphify install --platform pi` and invoke it as `/skill:graphify`.

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
