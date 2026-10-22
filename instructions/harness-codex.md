# Codex harness addendum

This section specializes the shared instructions for Codex.

## Orchestrator and workers

- Treat the main chat as the orchestrator. By default, delegate substantive investigation and implementation to bounded subagent tasks; choose the number and roles based on task needs and available capabilities. Use a routing/evaluation tool such as Jev or Clef only when installed and useful; otherwise choose directly.
- Keep trivial, tightly coupled, or faster-to-complete work in the main chat. The orchestrator owns scope, decisions, integration, final verification, and user communication.
- Give each worker a clear objective, scope, constraints, and expected concise deliverable. Avoid overlapping writes; use separate worktrees or exclusive file ownership when parallel edits are justified. Ask for findings and file references, not raw logs or broad copied context.
- Delegation does not expand authorization. Existing safety, approval, and Git boundaries apply equally to workers.

## Durable task handoff

- For every task, create or update one concise task-specific handoff note outside the repository at `$CODEX_HOME/handoffs/` (`$CODEX_HOME` defaults to `~/.codex`). Use a unique filename based on the session ID when available and a short task slug; otherwise use a timestamp and task slug. Record the exact path in the task's initial progress update. If that directory is unavailable or not writable, use `.codex/handoffs/` in the workspace and do not commit the note unless asked.
- Keep the note concise and current: objective and scope, constraints and decisions, completed work, changed files, verification evidence, unresolved risks, and next action. Use the shared Handoffs guidance above; never include secrets.
- Update the note at meaningful milestones, before compaction or a session transition, and at task completion. After compaction or resuming work, reopen the current note before acting and verify its state against the workspace; if its path was lost, locate it by task slug and session ID or timestamp, and disambiguate before continuing.
- Do not rely on the model observing a context percentage or triggering a handoff automatically. Use Codex's context indicator or `/status` when available; when the operator signals context is getting low, update the note before compaction or starting a fresh chat.
