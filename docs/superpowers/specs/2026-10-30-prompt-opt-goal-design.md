# Prompt-opt Goal Design

## Intent

Make Goal activation preserve the complete task and give pi-goal a finite, verifiable Definition of Done (DoD). Avoid writing handoff files for tasks that fit in pi-goal's 4,000-character objective limit.

## Goals and non-goals

- Inline the complete optimized task when it fits the 4,000-character limit; create a handoff only when the full task exceeds it.
- Every ready result must contain observable acceptance criteria and a stopping condition. Derive a minimal DoD when the request makes it clear; otherwise ask the user and do not offer activation until clarified.
- Reject omission-marker or malformed optimizer output before writing a handoff or starting a Goal.
- Keep edits and the authoritative task in sync. Editing a handoff-backed task edits the full specification and re-optimizes it before the next preview.
- Do not change pi-goal's limit or claim the model can be made immune to false completion; verify the final response against the DoD.

## Approaches

1. Always hand off and improve validation. This preserves one path but still creates unnecessary files for short requests.
2. Inline complete tasks that fit; hand off only oversized tasks. This avoids indirection for small tasks while retaining a durable authority for long ones. **Selected.**
3. Always inline. This fails for tasks exceeding pi-goal's objective limit.

## Behavior

The optimizer returns either a ready result (`optimized_prompt`, concise `goal_objective`, and non-empty `definition_of_done`) or a clarification result (`question`). The CLI rejects known omission markers in generated task data. A ready optimized prompt that fits, including its DoD and stop condition, is returned inline without creating a file. A longer prompt is persisted as the authoritative handoff; its concise objective carries the DoD and handoff path. Both the direct objective and the handoff-backed objective must remain within the limit.

Goal mode never writes the main prompt editor: it stays clean and exactly as the user left it, with no label, task, objective, or handoff contents inserted. The extension asks a clarification question through its editor and retries optimization with the answer before showing the preview. For an inline task, Edit re-optimizes the edited complete task. For a handoff-backed task, Edit opens the complete authoritative specification and re-optimizes it to a new handoff, avoiding an edited objective that disagrees with its authority. Preview puts the handoff location first when a file exists; inline preview says no handoff is needed. Edits use Pi's extension editor, whose configured external-editor keybinding opens `$VISUAL`/`$EDITOR` when available. Proceed is unavailable while clarification or validation remains unresolved.
