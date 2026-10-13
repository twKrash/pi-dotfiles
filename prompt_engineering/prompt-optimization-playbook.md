# Prompt Optimization Playbook

**Purpose:** Practical techniques for producing effective prompts for particular models, reasoning settings, and execution environments.

This file supplements the project's **Project Instructions**. Those instructions are the single source of truth for input parameters, defaults, mode selection, deliverables, and response formatting. Do not redefine them here. Use `prompting-references.md` to locate relevant documentation; do not reproduce its link catalog here.

## 1. Model-Aware Adaptation

Identify the exact target model/version and runtime before applying model-specific advice. The following are **working heuristics**, not validated guarantees. Prefer current model-specific vendor guidance where it differs.

| Target        | Starting approach                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPT-6 Luna    | Clear task and input boundaries; explicit decision rules, output contracts, and validation when relevant. Calibrate detail to task complexity and reasoning effort. |
| GPT-6 Sol     | Precise technical context, autonomy boundaries, evidence, proportionate verification                                                                                |
| GPT-6.1 Sol   | Same core prompt approach as GPT-6 Sol; use supported effort levels (`low`, `medium`, `high`, `xhigh`, `max`). `medium` is the model default; `none` and `minimal` are unsupported. |
| GPT-6 Astra   | Clear ownership of longer tasks, milestones only where needed, bounded delegation and checkpoints                                                                   |
| Claude Haiku  | Compact tasks, direct decision rules, uncomplicated output expectations                                                                                             |
| Claude Sonnet | Balanced technical specificity, tool guidance, and verification                                                                                                     |
| Claude Opus   | Outcome-oriented complex tasks, deliberate scope control, independent investigation where valuable                                                                  |

Do not manufacture differences between two models when their relevant documented recommendations are the same. Support newer releases only after checking that their behavior and configuration are actually documented.

### Reasoning Effort

- Low effort: minimize ambiguity, reduce competing objectives, make necessary decisions and expected output explicit.
- Medium effort: specify outcomes and constraints; leave ordinary implementation choices to the model.
- High effort: allow appropriate investigation and judgment on genuinely complex tasks; avoid lengthy prescribed reasoning procedures.
- Check effort compatibility against the actual model/runtime. Vendor effort labels are not necessarily equivalent.
- Prompt text does not change the runtime effort setting. Do not request hidden reasoning traces or generic “think step by step” behavior.

## 2. Prompt Construction

Default to model-calibrated prompting. Choose the structure, specificity, and level of detail that best support reliable task completion for the selected model, reasoning effort, and environment.

Use concise instructions when sufficient, but retain or introduce detailed context, decision rules, examples, validation, and completion criteria when justified by the model's documented behavior or known task failure modes.

Do not optimize prompt length independently of execution quality.

Include only elements that materially improve task completion:

1. **Outcome:** What success looks like, not a list of activities.
2. **Context:** Relevant repository, artifacts, interfaces, or assumptions.
3. **Boundaries:** Essential constraints, non-goals, side effects, and approvals.
4. **Tools:** Explicitly requested capabilities and necessary restrictions.
5. **Verification:** Evidence or checks justified by concrete risks.
6. **Completion:** Observable success criteria and necessary reporting.

Do not impose this structure mechanically. Simple tasks may need only an objective and one constraint.

### Progressive Specificity

For capable reasoning models and coding agents:

- Prefer outcomes over prescribed execution procedures. Leave ordinary planning, investigation, implementation choices, and verification strategies to the agent.
- Do not reproduce standard workflows, repository conventions, or documentation already available in the target environment.
- Preserve explicitly requested tools, delegation requirements, authorization boundaries, and critical success criteria.
- For follow-up tasks, focus on the requested delta, previous findings, and regression risks rather than repeating the entire workflow.
- Add procedural instructions only when explicitly requested, necessary to resolve ambiguity, or justified by a known failure mode.

A self-contained prompt must work independently of the original conversation, but does not need to embed documentation accessible to the executing agent.

For long inputs, distinguish instructions from untrusted source material. Use headings, delimiters, examples, JSON, or XML only when they improve comprehension or satisfy an interface contract.

When shortening an existing prompt, preserve meaningful requirements. Remove redundant explanations, generic checklists, and unnecessary procedural detail.

## 3. Software Engineering and Agentic Work

### Preserve the requested task type

- **Investigation or audit:** Prefer read-only inspection, concrete evidence, and prioritized findings. Do not add a blanket authorization to refactor.
- **Review:** Identify actionable findings with file locations, impact, and confidence. Don't implement fixes unless requested.
- **Implementation:** Permit bounded in-scope edits and focused regression tests when authorized.
- **Planning:** Return a plan; do not silently execute it.
- **Refactoring:** Preserve behavior and contracts unless a breaking change is expressly intended.

For user-supplied suspected bugs, first verify each claim against code, tests, or specifications. Dismiss unsupported findings rather than manufacturing fixes.

### Architecture and cleanup audits

Distinguish **confirmed** from **potential** dead code. Inspect public APIs, reflection, dynamic imports, plugin discovery, generated code, deployment configuration, and indirect consumers before declaring something unused.

Treat DRY, KISS, and SRP as design heuristics, not numeric targets. A little repetition may be simpler than an abstraction; a large function is not automatically a defect. Require a concrete maintainability, correctness, or complexity benefit.

Before removing compatibility layers, determine who consumes them, which versions are supported, whether migration is complete, and what constitutes a breaking change. If removal risk or intended support policy is unclear, present the decision for approval instead of quietly deleting supported behavior.

### Verification and scope

- Match verification to the affected boundary: unit tests for local logic, integration tests for cross-service contracts, and live UAT when mocks cannot prove real behavior.
- Prefer regression tests that fail before the fix and pass afterward, when practical.
- Report checks actually executed, skipped checks, and limitations; never infer an end-to-end pass from mocked unit tests.
- Keep changes focused. Avoid unrelated dependency upgrades, frameworks, migrations, and stylistic rewrites.
- Make external side effects and approval boundaries explicit. Do not silently authorize commits, pushes, merges, deployments, or destructive operations.

### Read-Only Operations and Permission Scope

For code review, audits, and other read-only tasks, distinguish changes to the reviewed source from operational state changes needed to obtain evidence.

- Preserve the working tree and prohibit source modifications, commits, pushes, and destructive repository operations.
- Do not automatically interpret read-only as a prohibition on fetching missing Git objects, creating temporary investigation artifacts, or updating local caches. Determine whether these operations are authorized by the user's constraints and the harness permission policy.
- When Git metadata updates are permitted, allow non-destructive fetches without switching branches or modifying working files.
- When an operation is unavailable to a restricted reviewer, allow the orchestrator to prepare the required evidence within its own permissions, or use a read-only remote API.
- Separate incomplete investigations from negative review conclusions. Missing evidence is a blocker, not proof of a defect.
- Apply permission boundaries to the appropriate actor. A reviewer may be prohibited from publishing while the parent orchestrator is explicitly authorized to publish its result.

## 4. Harnesses, Tools, and Delegation

A model's capabilities do not imply that its harness exposes a particular tool. For Pi, Codex, Claude Code, or other environments, rely on available tool descriptions, installed skills, and repository guidance (`AGENTS.md`, `CLAUDE.md`, etc.).

When subagents are available:

- **scout:** Bounded repository exploration, dependency tracing, and evidence gathering.
- **oracle:** Independent assessment of ambiguous technical findings and trade-offs.
- **reviewer:** Focused independent verification, where available.

Delegate only when it materially helps. State the bounded question, evidence needed, and allowed access; prefer read-only work for investigation. The primary agent owns synthesis, edits, and final verification. Do not spawn agents merely to satisfy a checklist.

Preserve the user's intent regarding tools and delegation. When specific tools are explicitly required, instruct the target agent to use them if available and report blockers. When tools are merely suggested, allow the agent to select the most effective approach. Never invent invocation syntax or capabilities.

## 5. Task-Specific Patterns

- **Research:** Specify the question, source quality, relevant freshness window, how to treat conflicting evidence, and what uncertainty to report.
- **Structured extraction or classification:** Define categories or schema, unknown/ambiguous handling, examples only when helpful, and validation ownership. An API schema is not replaced by prose.
- **Multi-document analysis:** Identify authoritative materials, establish how to handle contradictions, and require traceable evidence for consequential conclusions.
- **Model comparisons:** Hold the task and evaluation criteria constant; change only adaptations supported by the target model/runtime. Don't invent model advantages.
- **Reusable templates:** Use descriptive placeholders only for truly variable inputs, and define each placeholder.

## 6. Evidence and Evaluation

Evaluate prompts by how reliably they complete the intended task, not by elegance or length. Where feasible, compare baseline and optimized prompts with equivalent model settings and representative test cases.

Useful measures include correctness, constraint adherence, completion, unnecessary edits/tool calls, latency, cost, and repeatability. For engineering tasks, use test results and verified findings rather than confidence-sounding prose.

Separate three things in conclusions:

- **Documented behavior:** Supported by accessible authoritative sources.
- **Observed behavior:** Measured in a specific run or evaluation.
- **Hypothesis:** Plausible but not yet verified.

Do not claim that any prompt is universally optimal or that a performance improvement was measured when no evaluation occurred.

## 7. Pre-Delivery Check

Before returning an optimized prompt:

- Check for intent drift, contradictory requirements, imaginary tools, excessive autonomy, and unclear completion criteria.
- Remove overlapping instructions. Each requirement should appear once, in its most relevant location.
- Remove procedural steps and explanations that do not materially improve correctness, safety, or task completion.
- Ensure the prompt is independently usable without unnecessarily repeating information available in the target environment.

Perform this check internally. Do not include it in the generated prompt or output unless requested.

Keep model-selection defaults, mode routing, deliverable definitions, and final response layout in **Project Instructions**, not in this playbook.
