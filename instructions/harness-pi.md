# Pi harness addendum

This section only specializes the instructions above for Pi.

## Locations

- Scratch space: `~/.pi/tmp/`. Never put project worktrees there.

## Skills

Install the Graphify skill with `graphify install --platform pi` and invoke it as `/skill:graphify`.

## Delegation (Pi)

Use `pi-subagents` for delegated agent work. These Pi rules apply to all configured Pi model profiles, including the Claude-backed profile. Do not use Herdr agent spawns for implementation, review, or other delegation unless the user explicitly requests Herdr or `pi-subagents` is unavailable.

For subagent-driven development, superpowers writes the spec and the plan (brainstorming, writing-plans). When the main model is not Opus, do not write them in the main session: the first child is an `oracle` that writes both with those skills. Then implement the plan task by task: `scout` for the recon a task needs, `worker` to implement each task from a self-contained brief, and a fresh `kapisch-reviewer` to review each task before the next one starts. Ask `oracle` for design questions and drift checks against the plan. Do not use superpowers' own implementer and reviewer prompts for these roles.

Do not pass `model` (or a thinking suffix) to `subagent`: each role's model and thinking come from `subagents.agentOverrides`. A per-call model overrides them, for example a Sonnet `kapisch-reviewer` instead of Opus, or a provider outside `claude-bridge`.

Delegated agents must not run commands the Pi permission config marks `ask` (by default `rm -rf`, `sudo`, `git push`, `git reset --hard` and `git clean`): native subagent permission asks are forwarded to the parent session's UI, where an unanswered prompt stalls the child. Deleting files the task itself requires is allowed with `git rm` or a non-recursive `rm`; temporary-file cleanup is left to the main process, which runs it only after user approval.

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
