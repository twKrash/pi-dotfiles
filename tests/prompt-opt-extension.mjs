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
await mkdir(bin);
const executable = path.join(bin, "prompt-opt");
await writeFile(executable, `#!/bin/sh
printf '%s\n' "$@" > "$PROMPT_OPT_TEST_ARGS"
cat >/dev/null
if [ "\${1:-}" = --help ] || [ "\${1:-}" = -h ]; then
  printf 'prompt-opt usage\n'
  exit 0
fi
if [ "\${1:-}" = --history ]; then
  [ "$#" -gt 1 ] && printf 'optimized result\n'
  exit 0
fi
printf 'prompt-opt[debug] phase=pi_complete elapsed_s=2\n' >&2
printf 'optimized result\n'
`);
await chmod(executable, 0o755);

const oldPath = process.env.PATH;
const oldArgsFile = process.env.PROMPT_OPT_TEST_ARGS;
process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ""}`;
process.env.PROMPT_OPT_TEST_ARGS = argsFile;

try {
  let handler;
  const entries = [];
  const notifications = [];
  let editorText = "";
  promptOptExtension({
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
      assert.deepEqual(
        definition.getArgumentCompletions("--debug --opt-effort=med"),
        [{ value: "--debug --opt-effort=medium", label: "medium" }],
      );
    },
    appendEntry(type, data) { entries.push({ type, data }); },
  });
  const ctx = {
    hasUI: true,
    ui: {
      async editor() { return "sample task"; },
      notify(message) { notifications.push(message); },
      setEditorText(value) { editorText = value; },
    },
  };

  await handler("--help", ctx);
  assert.equal(editorText, "prompt-opt usage");

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
