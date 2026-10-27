import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import promptOptExtension from "../home/dot_pi/private_agent/private_extensions/prompt-opt-pi.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep the caller's prompt-opt defaults out of the assertions.
for (const name of Object.keys(process.env)) if (/^PROMPT_OPT_(TARGET|RUNNER|PI|ANTHROPIC)_/.test(name)) delete process.env[name];
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "prompt-opt-extension-")));
const bin = path.join(temp, "bin");
const argsFile = path.join(temp, "args.txt");
const cwdFile = path.join(temp, "cwd.txt");
const sessionIdFile = path.join(temp, "session-id.txt");
const contextWorkspace = path.join(temp, "context-workspace");
await mkdir(bin);
await mkdir(contextWorkspace);
const executable = path.join(bin, "prompt-opt");
await writeFile(executable, `#!/bin/sh
printf '%s\n' "$@" > "$PROMPT_OPT_TEST_ARGS"
printf '%s' "${'${PI_SESSION_ID:-}'}" > "$PROMPT_OPT_TEST_SESSION_ID"
pwd -P > "$PROMPT_OPT_TEST_CWD"
cat >/dev/null
if [ "\${1:-}" = --help ] || [ "\${1:-}" = -h ]; then
  printf 'prompt-opt usage\n'
  exit 0
fi
if [ "\${1:-}" = --history ]; then
  [ "$#" -gt 1 ] && printf 'optimized result\n'
  exit 0
fi
goal=0
for arg do [ "$arg" = --goal ] && goal=1; done
if [ "${'${PROMPT_OPT_TEST_FAIL:-0}'}" = 1 ]; then printf 'prompt-opt: goal handoff failed\n' >&2; exit 1; fi
printf 'prompt-opt[debug] phase=pi_complete elapsed_s=2\n' >&2
if [ "$goal" = 1 ]; then printf '%s\n' "$PROMPT_OPT_TEST_GOAL_RESULT"; else printf 'optimized result\n'; fi
`);
await chmod(executable, 0o755);

const oldPath = process.env.PATH;
const oldArgsFile = process.env.PROMPT_OPT_TEST_ARGS;
const oldCwdFile = process.env.PROMPT_OPT_TEST_CWD;
const oldSessionIdFile = process.env.PROMPT_OPT_TEST_SESSION_ID;
const oldPiSessionId = process.env.PI_SESSION_ID;
const oldGoalResult = process.env.PROMPT_OPT_TEST_GOAL_RESULT;
const oldGoalTimeout = process.env.PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS;
const oldGoalSettle = process.env.PROMPT_OPT_GOAL_SETTLE_MS;
process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ""}`;
process.env.PROMPT_OPT_TEST_ARGS = argsFile;
process.env.PROMPT_OPT_TEST_CWD = cwdFile;
process.env.PROMPT_OPT_TEST_SESSION_ID = sessionIdFile;
process.env.PROMPT_OPT_GOAL_SETTLE_MS = "10";
const goalObjective = "Complete this task: rewrite the importer and keep its error contract.";
process.env.PROMPT_OPT_TEST_GOAL_RESULT = JSON.stringify({
  status: "handoff-written",
  handoff_path: path.join(temp, "handoffs", "session-a", "goal-1.md"),
  objective: goalObjective,
});

try {
  let handler;
  const entries = [];
  const notifications = [];
  let editorText = "";
  let taskText = "sample task";
  let activeSessionId = "01a17a4d-c236-7573-b7e3-60a763bbbec8";
  const bus = createEventBus();
  promptOptExtension({
    events: bus.api,
    registerCommand(name, definition) {
      assert.equal(name, "prompt-opt");
      handler = definition.handler;
      assert.deepEqual(
        definition.getArgumentCompletions("--opt-effort=med"),
        [{ value: "--opt-effort=medium", label: "medium" }],
      );
      assert.deepEqual(
        definition.getArgumentCompletions("--provider=a"),
        [{ value: "--provider=anthropic", label: "anthropic" }],
      );
      assert.deepEqual(
        definition.getArgumentCompletions("--model=sol"),
        ["sol", "sol-6", "sol-6.1"].map(value => ({ value: `--model=${value}`, label: value })),
      );
      assert.deepEqual(
        definition.getArgumentCompletions("--debug --opt-model=gpt-6-l"),
        [{ value: "--debug --opt-model=gpt-6-luna", label: "gpt-6-luna" }],
      );
      assert.ok(definition.getArgumentCompletions("--help").some(({ value }) => value === "--help"));
      assert.ok(definition.getArgumentCompletions("--context").some(({ value }) => value === "--context"));
      assert.ok(definition.getArgumentCompletions("--go").some(({ value }) => value === "--goal"));
      assert.deepEqual(
        definition.getArgumentCompletions("--debug --opt-effort=med"),
        [{ value: "--debug --opt-effort=medium", label: "medium" }],
      );
    },
    appendEntry(type, data) { entries.push({ type, data }); },
  });
  const ctx = {
    hasUI: true,
    sessionManager: { getSessionId() { return activeSessionId; } },
    cwd: contextWorkspace,
    ui: {
      async editor() { return taskText; },
      notify(message) { notifications.push(message); },
      setEditorText(value) { editorText = value; },
    },
  };

  editorText = "keep editor draft";
  await handler("--help", ctx);
  assert.equal(editorText, "keep editor draft");
  assert.ok(notifications.includes("prompt-opt usage"));

  await handler("--debug", ctx);
  const args = await readFile(argsFile, "utf8");
  assert.match(args, /--debug/);
  assert.equal(args.split("\n").at(-2), "-");
  assert.equal(editorText, "optimized result");
  assert.ok(entries.some(({ type, data }) => type === "prompt-opt-debug" && data.event === "cli_exit"));
  assert.ok(entries.some(({ type, data }) => type === "prompt-opt-debug" && data.event === "cli_debug" && /pi_complete/.test(data.message)));

  entries.length = 0;
  await handler("--verbose", ctx);
  const verboseArgs = await readFile(argsFile, "utf8");
  assert.match(verboseArgs, /--verbose/);
  assert.ok(entries.some(({ type }) => type === "prompt-opt-debug"));

  entries.length = 0;
  const context = 'Read "ADR-17" and Jira ABC-123; do not update either.';
  taskText = "optimize using source context";
  await handler(`--debug --context '${context}'`, ctx);
  const contextArgs = await readFile(argsFile, "utf8");
  assert.match(contextArgs, /--context/);
  assert.match(contextArgs, /Read "ADR-17" and Jira ABC-123; do not update either\./);
  assert.equal((await readFile(cwdFile, "utf8")).trim(), contextWorkspace);
  assert.ok(notifications.some(message => /configured tools/i.test(message)));
  assert.ok(!JSON.stringify(entries).includes(context), "debug metadata must redact free-form context");

  assert.equal(bus.emits.length, 0, "ordinary /prompt-opt runs never start a Goal");
  process.env.PI_SESSION_ID = "stale-ambient-session";
  bus.respondOnStart(({ runId }) => ({ type: "state", runId, goalId: "goal-1", status: "active" }));
  await handler(`--goal --context '${context}'`, ctx);
  const goalArgs = await readFile(argsFile, "utf8");
  assert.equal(await readFile(sessionIdFile, "utf8"), activeSessionId, "goal mode must override ambient session IDs with the current session");
  assert.match(goalArgs, /--goal/);
  assert.match(goalArgs, /--context/);
  assert.equal(bus.emits.length, 1, "exactly one managed-run start request");
  assert.equal(bus.emits[0].channel, "pi-goal:start");
  assert.match(bus.emits[0].data.runId, /^prompt-opt-[0-9a-f-]{36}$/);
  assert.equal(bus.emits[0].data.objective, goalObjective);
  const firstRunId = bus.emits[0].data.runId;
  assert.equal(bus.emits[0].subscribedBeforeEmit, true, "the run channel must be subscribed before the start request");
  assert.match(editorText, /Goal handoff: /);
  assert.ok(editorText.includes(path.join(temp, "handoffs", "session-a", "goal-1.md")), "the handoff location is reported");
  assert.ok(!editorText.includes(goalObjective), "the prompt itself is not re-printed");
  assert.ok(notifications.some(message => /Goal started \(goal goal-1\)/.test(message)), "activation requires the managed-run confirmation");
  assert.ok(!notifications.some(message => /Goal not started/.test(message)));

  // An existing Goal is reported, never replaced: one emit, no second request.
  bus.reset();
  bus.respondOnStart(({ runId }) => ({ type: "error", runId, operation: "start", error: { code: "GOAL_ALREADY_EXISTS", message: "A Goal already exists." } }));
  await handler("--goal", ctx);
  assert.equal(bus.emits.length, 1);
  assert.match(editorText, /Goal not started: a Goal already exists in this session and was left unchanged/);
  assert.ok(notifications.some(message => /already exists/.test(message)));

  // RPC disabled is an honest failure, not a silent success.
  bus.reset();
  bus.respondOnStart(({ runId }) => ({ type: "error", runId, operation: "start", error: { code: "RPC_DISABLED", message: "Managed run RPC is disabled." } }));
  await handler("--goal", ctx);
  assert.match(editorText, /managed-run RPC is disabled/);
  assert.ok(notifications.some(message => /RPC is disabled/.test(message)));

  // No activation event must never be reported as a started Goal.
  bus.reset();
  process.env.PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS = "50";
  await handler("--goal", ctx);
  delete process.env.PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS;
  assert.match(editorText, /Goal activation unconfirmed\.\nCheck \/goal status before retrying\./);
  assert.ok(notifications.some(message => /Goal activation unconfirmed\.\nCheck \/goal status before retrying\./.test(message)));

  // If the session switches while the optimizer runs, do not activate in the new session.
  bus.reset();
  const sessionBeforeOptimization = activeSessionId;
  const editor = ctx.ui.editor;
  ctx.ui.editor = async (...args) => {
    const task = await editor(...args);
    activeSessionId = "session-switched-during-optimization";
    return task;
  };
  await handler("--goal", ctx);
  ctx.ui.editor = editor;
  activeSessionId = sessionBeforeOptimization;
  assert.equal(bus.emits.length, 0, "a session change must prevent Goal activation");
  assert.ok(notifications.some(message => /Session changed during optimization; Goal not started\./.test(message)));

  assert.equal(bus.outstandingSubscriptions(), 0, "the run channel subscription is released");

  // A failed handoff must never reach activation.
  bus.reset();
  process.env.PROMPT_OPT_TEST_FAIL = "1";
  editorText = "preserve draft";
  await handler("--goal", ctx);
  delete process.env.PROMPT_OPT_TEST_FAIL;
  assert.equal(bus.emits.length, 0, "persistence failure must not emit a start request");
  assert.ok(notifications.some(message => /Prompt optimization failed/.test(message)));
  assert.equal(editorText, taskText, "the draft is restored when the handoff fails");

  // A runtime without the event bus must fail honestly instead of claiming a Goal.
  let buslessHandler;
  promptOptExtension({ registerCommand(name, definition) { buslessHandler = definition.handler; }, appendEntry() {} });
  notifications.length = 0;
  await buslessHandler("--goal", ctx);
  assert.ok(notifications.some(message => /Goal not started: the Goal event bus is unavailable/.test(message)));

  // An unreadable handoff result must never be activated either.
  bus.reset();
  const validResult = process.env.PROMPT_OPT_TEST_GOAL_RESULT;
  process.env.PROMPT_OPT_TEST_GOAL_RESULT = "not a handoff";
  await handler("--goal", ctx);
  process.env.PROMPT_OPT_TEST_GOAL_RESULT = validResult;
  assert.equal(bus.emits.length, 0, "an unconfirmed handoff must not emit");
  assert.ok(notifications.some(message => /unreadable goal handoff/i.test(message)));

  bus.reset();
  bus.respondOnStart(({ runId }) => [
    { type: "state", runId, goalId: "goal-2", status: "active" },
    { type: "error", runId, operation: "start", error: { code: "SUPERSEDED", message: "The managed Goal was superseded." } },
  ]);
  editorText = "preserve draft";
  await handler("--goal", ctx);
  assert.match(editorText, /Goal not started: SUPERSEDED: The managed Goal was superseded\./, "a rolled-back activation is not reported as started");

  bus.reset();
  bus.respondOnStart(({ runId }) => ({ type: "state", runId, goalId: "goal-3", status: "active" }));
  await handler("--goal", ctx);
  const secondRunId = bus.emits[0]?.data.runId;
  assert.ok(secondRunId && secondRunId !== firstRunId, "each run uses a fresh runId");
  assert.match(editorText, /Goal started \(goal goal-3\)/);

  const argsBeforeMissingSession = await readFile(argsFile, "utf8");
  activeSessionId = undefined;
  editorText = "preserve draft";
  await handler("--goal", ctx);
  assert.equal(editorText, "preserve draft");
  assert.equal(await readFile(argsFile, "utf8"), argsBeforeMissingSession, "missing current session must not spawn the optimizer");
  assert.ok(notifications.some(message => /current Pi session ID/i.test(message)));
  activeSessionId = "01a17a4d-c236-7573-b7e3-60a763bbbec8";

  const callsBeforeBadContext = entries.length;
  editorText = "preserve editor draft";
  await handler('--context "unterminated', ctx);
  assert.equal(editorText, "preserve editor draft");
  assert.ok(notifications.some(message => /quote|context/i.test(message)));
  assert.equal(entries.length, callsBeforeBadContext);

  entries.length = 0;
  await handler(`--history=${"a".repeat(64)}`, ctx);
  const historyArgs = await readFile(argsFile, "utf8");
  assert.match(historyArgs, /--history=a{64}/);
  assert.equal(editorText, "optimized result\n");
  editorText = "keep editor draft";
  await handler("--history", ctx);
  assert.equal(editorText, "keep editor draft");
  assert.ok(notifications.some(message => /no .*history/i.test(message)));

  await rm(executable);
  process.env.PATH = bin;
  await handler("--history", ctx);
  assert.ok(notifications.some(message => /Could not retrieve prompt history/.test(message)));

  entries.length = 0;
  await handler("", ctx);
  assert.equal(entries.length, 0);
} finally {
  if (oldPath === undefined) delete process.env.PATH;
  else process.env.PATH = oldPath;
  if (oldArgsFile === undefined) delete process.env.PROMPT_OPT_TEST_ARGS;
  else process.env.PROMPT_OPT_TEST_ARGS = oldArgsFile;
  if (oldCwdFile === undefined) delete process.env.PROMPT_OPT_TEST_CWD;
  else process.env.PROMPT_OPT_TEST_CWD = oldCwdFile;
  if (oldSessionIdFile === undefined) delete process.env.PROMPT_OPT_TEST_SESSION_ID;
  else process.env.PROMPT_OPT_TEST_SESSION_ID = oldSessionIdFile;
  if (oldPiSessionId === undefined) delete process.env.PI_SESSION_ID;
  else process.env.PI_SESSION_ID = oldPiSessionId;
  if (oldGoalResult === undefined) delete process.env.PROMPT_OPT_TEST_GOAL_RESULT;
  else process.env.PROMPT_OPT_TEST_GOAL_RESULT = oldGoalResult;
  if (oldGoalTimeout === undefined) delete process.env.PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS;
  else process.env.PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS = oldGoalTimeout;
  if (oldGoalSettle === undefined) delete process.env.PROMPT_OPT_GOAL_SETTLE_MS;
  else process.env.PROMPT_OPT_GOAL_SETTLE_MS = oldGoalSettle;
  await rm(temp, { recursive: true, force: true });
}

async function testPipedCliCloseAfterCompletion() {
  const pipeTemp = await realpath(await mkdtemp(path.join(os.tmpdir(), "prompt-opt-pipe-close-")));
  const pipeBin = path.join(pipeTemp, "bin");
  const daemonPidFile = path.join(pipeTemp, "xclip-child.pid");
  const piCallsFile = path.join(pipeTemp, "pi-calls");
  await mkdir(pipeBin);
  const piStub = path.join(pipeBin, "pi");
  const xclipStub = path.join(pipeBin, "xclip");
  await writeFile(piStub, `#!/bin/sh
if [ "${'${1:-}'}" = --version ]; then echo 1.1.0; exit 0; fi
printf '%s\\n' called >> "$PROMPT_OPT_TEST_PI_CALLS"
printf '%s\\n' 'optimized prompt'
`);
  await writeFile(xclipStub, `#!/bin/sh
(sleep 7) &
printf '%s\n' "$!" > "$PROMPT_OPT_TEST_BG_PID"
`);
  await chmod(piStub, 0o755);
  await chmod(xclipStub, 0o755);

  let completeAt;
  const child = spawn(path.join(root, "home/dot_local/bin/executable_prompt-opt"), ["--debug", "-"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: pipeTemp,
      PATH: `${pipeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      PROMPT_OPT_TEST_BG_PID: daemonPidFile,
      PROMPT_OPT_TEST_PI_CALLS: piCallsFile,
      PROMPT_LAB_DIR: path.join(root, "home/ai/prompt_engineering"),
      XDG_STATE_HOME: path.join(pipeTemp, "state"),
    },
  });
  child.stdout.resume();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (completeAt === undefined && chunk.includes("phase=complete")) completeAt = performance.now();
  });

  try {
    const closedAt = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        assert.equal(code, 0);
        resolve(performance.now());
      });
      child.stdin.end("task for close-event regression");
    });
    assert.notEqual(completeAt, undefined, "CLI should mark optimization complete");
    assert.ok(closedAt - completeAt < 5000, `close lagged completion by ${Math.round(closedAt - completeAt)}ms`);
    try { process.kill(Number(await readFile(daemonPidFile, "utf8")), "SIGTERM"); } catch {}

    completeAt = undefined;
    const warm = spawn(path.join(root, "home/dot_local/bin/executable_prompt-opt"), ["--debug", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HOME: pipeTemp, PATH: `${pipeBin}${path.delimiter}${process.env.PATH ?? ""}`, PROMPT_OPT_TEST_BG_PID: daemonPidFile, PROMPT_OPT_TEST_PI_CALLS: piCallsFile, PROMPT_LAB_DIR: path.join(root, "home/ai/prompt_engineering"), XDG_STATE_HOME: path.join(pipeTemp, "state") },
    });
    warm.stdout.resume(); warm.stderr.setEncoding("utf8");
    let cacheHitSeen = false;
    warm.stderr.on("data", chunk => {
      if (completeAt === undefined && chunk.includes("phase=complete")) completeAt = performance.now();
      if (chunk.includes("phase=cache_hit")) cacheHitSeen = true;
    });
    const warmClosed = await new Promise((resolve, reject) => {
      warm.once("error", reject); warm.once("close", code => { assert.equal(code, 0); resolve(performance.now()); }); warm.stdin.end("task for close-event regression");
    });
    assert.notEqual(completeAt, undefined, "warm cache should complete");
    assert.ok(cacheHitSeen, "warm invocation should report phase=cache_hit");
    assert.equal((await readFile(piCallsFile, "utf8")).trim().split("\n").length, 1, "warm cache must not call optimizer again");
    assert.ok(warmClosed - completeAt < 5000, `warm-cache close lagged by ${Math.round(warmClosed - completeAt)}ms`);
  } finally {
    try {
      const pid = Number(await readFile(daemonPidFile, "utf8"));
      process.kill(pid, "SIGTERM");
    } catch {}
    await rm(pipeTemp, { recursive: true, force: true });
  }
}

await testPipedCliCloseAfterCompletion();
console.log("prompt-opt extension and pipe-close tests passed");

function createEventBus() {
  const handlers = new Map();
  const bus = {
    emits: [],
    responder: undefined,
    subscribersFor(channel) { return [...(handlers.get(channel) ?? [])]; },
    reset() { bus.emits.length = 0; bus.responder = undefined; },
    respondOnStart(responder) { bus.responder = responder; },
    outstandingSubscriptions() {
      let count = 0;
      for (const set of handlers.values()) count += set.size;
      return count;
    },
    api: {
      on(channel, handler) {
        if (!handlers.has(channel)) handlers.set(channel, new Set());
        handlers.get(channel).add(handler);
        return () => handlers.get(channel)?.delete(handler);
      },
      emit(channel, data) {
        const replyChannel = `pi-goal:event:${data?.runId}`;
        bus.emits.push({ channel, data, subscribedBeforeEmit: (handlers.get(replyChannel)?.size ?? 0) > 0 });
        if (channel !== "pi-goal:start" || !bus.responder) return;
        const reply = bus.responder(data);
        for (const event of Array.isArray(reply) ? reply : [reply]) {
          if (event) for (const handler of bus.subscribersFor(replyChannel)) handler(event);
        }
      },
    },
  };
  return bus;
}
