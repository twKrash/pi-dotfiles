Apply these when writing, reviewing, or refactoring production code. A repository's own `AGENTS.md`/`CLAUDE.md` overrides them where it is more specific.

## Code Standards

- Python code must follow PEP 8 and normal Python best practices:
  <https://peps.python.org/pep-0008/>
- Prefer simple, explicit, idiomatic Python over clever
  abstractions or framework-like indirection.
- Apply the Single Responsibility Principle: each module, class, and
  function should have one primary reason to change.
- Apply SOLID principles where they improve separation of responsibilities,
  substitutability, and dependency boundaries. Do not introduce abstractions solely
  to satisfy SOLID mechanically.
- Prefer composition and small focused functions over inheritance.
  Introduce inheritance, `Protocol`, ABCs, registries, factories, or plugin
  abstractions only when an actual interchangeable implementation boundary exists.
- Preserve existing architecture and infrastructure by default. Do not introduce
  a new dependency, storage mechanism, framework, persistence model, or
  architectural layer unless the existing capabilities are demonstrably insufficient.
- Keep public modules and interfaces small. Implementation details should
  remain private unless they are intentionally part of the supported contract.
- Avoid circular imports and bidirectional module dependencies. Dependencies
  should flow from higher-level orchestration toward focused lower-level components.
- Keep one source of truth for validation, canonicalization, serialization,
  identity, and protocol semantics. Do not duplicate the same semantic transformation
  in multiple modules.
- Prefer immutable value objects for durable identities, protocol facts, and
  validated domain data when mutation is not part of the contract.
- Model data so illegal states cannot be represented. Prefer a structure or type
  that cannot hold an invalid combination over runtime checks scattered through the code.
- Make operations with persistence, retries, or external effects idempotent:
  running one twice, or rerunning it after a crash midway, ends in the same state.
- Do not share mutable state between concurrent actors that do not need it.
  When they must, enforce a single writer in the structure, not by convention.
- At protocol and persistence boundaries, validate inputs explicitly and
  fail closed. Do not silently normalize, infer, repair, downgrade, or
  reinterpret malformed or unsupported authoritative data unless the governing
  contract explicitly requires it.
- Errors at public or protocol boundaries should be deterministic and intentional.
  Do not leak accidental implementation exceptions where a stable validation or
  domain error is expected.
- Do not rely on process memory, conversational context, caller honesty,
  or mutable derived views for durable authority. Persisted authoritative state
  must remain sufficient for cold restart.
- Every consumed durable artifact must have one explicit earlier producer.
  Generated authority fields must have exactly one owning producer.
- Keep filesystem access, subprocess execution, parsing, canonical encoding,
  validation, policy decisions, state transitions, external effects, and
  presentation concerns separate when they have different reasons to change.
- Pass the narrowest required data between components. Avoid passing broad
  state or context objects when a smaller immutable value or reference is sufficient.
- Do not create speculative abstractions for anticipated future requirements.
  Extract a new module or abstraction when a concrete second responsibility or
  implementation boundary appears.
- Preserve backward or retained-format semantics exactly where compatibility is
  required.
  Never silently reinterpret old persisted data using newer semantics.
- New behavior and bug fixes require focused regression tests. Tests should prove
  the changed behavior and should fail when that behavior is removed or broken.
- Tests call the code the way its caller does and assert the results that caller
  observes, not internal calls or structure. Discard a test that would still pass
  if the code under test returned nothing.
- Test negative, invalid, stale, crash/recovery, and boundary cases for code dealing
  with persistence, authority, concurrency, permissions, identities, or external
  effects.
- Do not weaken a contract, validation rule, safety property, or test merely to
  make an implementation pass.
- When two fixes that rest on the same premise fail the same check, stop.
  State the premise in one sentence and verify it before attempting another fix.
- Keep changes narrowly scoped. Do not perform unrelated cleanup, formatting, refactoring,
  dependency upgrades, or behavior changes in the same task unless they
  are required for correctness.
- Prefer readable names and explicit control flow. Comments should explain invariants,
  ownership, non-obvious constraints, or why a decision exists, not restate
  the code.

## Implementation Structure

- A production module should have one primary responsibility.
- Public facade modules may be intentionally small and delegate implementation
  to focused private modules.
- Reassess module structure when a production module approaches approximately
  350 lines or a function approaches approximately 60 lines. These are review
  triggers, not hard limits.
- Modules above approximately 500 lines or functions above approximately 100
  lines require an explicit justification or decomposition before final review.
- Do not split code mechanically to satisfy line-count targets;
  split only along coherent responsibility boundaries.

## Quality Gates

When [`crapper`](https://github.com/unclebob/crapper),
[`dryer`](https://github.com/unclebob/dryer), or
[`mutator`](https://github.com/unclebob/mutator) are available, run them on the
changed code before final review and report the results:

- `crapper`: keep each changed function's CRAP score below 10 by splitting it,
  testing it, or both.
- `dryer`: review duplicate pairs with similarity 0.8 or above and remove real
  duplication.
- `mutator`: cover uncovered mutants, kill surviving ones, and delete the dead
  code they expose.

Justify any remaining exception. These gates test the tests; they do not replace
the behavioral tests above.

Run them through `code-gates`:

- After each Python or TypeScript edit, a `code-gates` line in the tool result
  lists functions with complexity 10 or above (CRAP is never below complexity)
  and duplicates of the edited file. Fix the ones in code you changed.
- Before committing, stage the change and run `code-gates run` in the repository;
  a commit of staged code files is blocked until it has run on exactly that
  staged content. Pass `--test-command` (for example
  `"uv run pytest -q -x tests/<area>"`) to limit mutator to the matching tests, and
  `--coverage-command` when the default coverage run does not work for the repository.
  Use `--no-mutator` only when you tell the user why.
- Report the results to the user before committing. Only the user may skip the
  gate (`CODE_GATES_SKIP=1 git commit ...`).

The gates are a local aid, not a project dependency. Their output (`.metrics/`,
`target/`) is ignored through git's global ignore file; never add it to `.gitignore`,
and do not add the tools or their configuration to tracked project files.
