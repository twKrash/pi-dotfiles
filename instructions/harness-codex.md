# Codex harness addendum

This section specializes the shared instructions for Codex.

## Orchestrator and workers

- Treat the main chat as the orchestrator. By default, delegate substantive investigation and implementation to bounded subagent tasks; choose the number and roles based on task needs and available capabilities. Use a routing/evaluation tool such as Jev or Clef only when installed and useful; otherwise choose directly.
- Keep trivial, tightly coupled, or faster-to-complete work in the main chat. The orchestrator owns scope, decisions, integration, final verification, and user communication.
- Give each worker a clear objective, scope, constraints, and expected concise deliverable. Avoid overlapping writes; use separate worktrees or exclusive file ownership when parallel edits are justified. Ask for findings and file references, not raw logs or broad copied context.
- Delegation does not expand authorization. Existing safety, approval, and Git boundaries apply equally to workers.
