# Prompt-opt Goal Inline/Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inline complete Goal tasks up to pi-goal's 4,000-character limit, safely hand off longer tasks, and require a clear DoD before activation.

**Architecture:** The prompt-opt CLI validates a structured optimizer result, rejects omission markers, leaves only the exact `Goal handof` label in the main editor, and returns either an inline Goal objective, a handoff-backed objective, or a clarification question. The Pi extension handles clarification, previews and edits the complete authority, and starts a Goal only after validation and user approval. Its extension editor exposes Pi's configured external editor (`$VISUAL`/`$EDITOR`) for edits.

**Tech Stack:** Bash CLI with embedded Node.js validation; JavaScript Pi extension; Node test harnesses.

**Spec:** `docs/superpowers/specs/2026-10-30-prompt-opt-goal-design.md`

## Global Constraints

- Preserve pi-goal's 4,000-character objective limit.
- Do not create a handoff unless the complete optimized task plus DoD exceeds the limit.
- Never activate a Goal from malformed output, omission-marked task data, or unresolved clarification.
- Every ready Goal must carry observable acceptance criteria and a stop condition.
- In Goal mode, put only the exact label `Goal handof` in the main prompt editor; never put the task or goal value there.
- Do not add dependencies or modify pi-goal itself.

## Review Focus

- Exact 4,000-character boundary after DoD and stop text: test inline at the limit and handoff one character over.
- Omission markers in any generated field: test rejection before file creation or Goal activation.
- Missing DoD or clarification response: test no handoff/activation until an answer is supplied; cancellation must preserve the editor.
- Editing a long task: test the new objective points to the newly written complete handoff, not the stale one.
- Malformed or oversized structured output and unsafe handoff paths: retain existing fail-closed coverage and prove no Goal starts.

---

### Task 1: Define and validate the CLI Goal result

**Files:**
- Modify: `home/dot_local/bin/executable_prompt-opt`
- Test: `tests/prompt-opt.sh`

**Interfaces:**
- Consumes: optimizer JSON with either `status: "ready"`, `optimized_prompt`, `goal_objective`, `definition_of_done: string[]`, or `status: "needs_clarification"`, `question`.
- Produces: JSON `status: "inline"` with the complete objective and DoD, `status: "handoff-written"` with handoff path and DoD-bearing objective, or `status: "needs-clarification"` with the question.

- [x] Write failing CLI tests for inline short task (no file), exactly-at-limit task, one-character-over handoff, missing DoD, clarification response, and omission markers; verify no handoff artifact is written for rejected/clarification output.
- [x] Run `sh tests/prompt-opt.sh` and confirm new cases fail against the current always-handoff contract.
- [x] Implement the discriminated optimizer-result parser, canonical DoD/stop-condition handling, length-based inline/handoff choice, marker rejection, and existing secure file creation for the long path.
- [x] Run `sh tests/prompt-opt.sh` and confirm all CLI tests pass.

### Task 2: Integrate clarification, preview, and synchronized edits

**Files:**
- Modify: `home/dot_pi/private_agent/private_extensions/prompt-opt-pi.js`
- Add: `home/dot_pi/private_agent/private_extensions/prompt-opt-pi/goal-flow.js`
- Modify: `docs/superpowers/specs/2026-10-30-prompt-opt-goal-design.md`
- Modify: `docs/superpowers/plans/2026-10-30-prompt-opt-goal.md`
- Test: `tests/prompt-opt-extension.mjs`

**Interfaces:**
- Consumes: the three CLI result statuses from Task 1.
- Produces: a preview with a first handoff-status/path bullet, a DoD-bearing objective, clarification and edit loops that rerun optimization, and one activation only after Proceed.

- [x] Write failing extension tests for the exact editor label, inline versus handoff parsing/preview, clarification answer/cancel, invalid result rejection, direct edits, and long-task edits that generate a new authoritative handoff.
- [x] Run `node tests/prompt-opt-extension.mjs` and confirm the new cases fail against the handoff-only parser and objective-only edit flow.
- [x] Implement result-status handling and modal clarification/edit behavior. For long tasks, read the current handoff as edit prefill, re-run prompt-opt with edited full text, and preview the returned new handoff.
- [x] Run `node tests/prompt-opt-extension.mjs` and confirm all extension tests pass.

### Task 3: Verify integration and update the PR

**Files:**
- Verify: `home/dot_local/bin/executable_prompt-opt`, `home/dot_pi/private_agent/private_extensions/prompt-opt-pi.js`, `home/dot_pi/private_agent/private_extensions/prompt-opt-pi/goal-flow.js`, `tests/prompt-opt.sh`, `tests/prompt-opt-extension.mjs`, both design artifacts.

- [x] Run `node tests/prompt-opt-extension.mjs`, `sh tests/prompt-opt.sh`, and `git diff --check`.
- [x] Review the full diff for the inline/handoff boundary, DoD coverage, omission-marker rejection, prompt-editor non-mutation, and objective/handoff consistency.
- [x] Run diagnostics on changed source paths and record unrelated findings separately.
- [x] Commit and push the completed change to `feat/prompt-opt-goal-preview`; confirm PR #24 remains open and report CI status.
