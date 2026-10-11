// Pi adapter for the standalone prompt-opt CLI.
import { spawn } from "node:child_process";

const allowedFlag = /^(?:--debug|--verbose|--(?:provider|model|effort|environment|opt-provider|opt-model|opt-effort)=[A-Za-z0-9._/-]+)$/;

function runOptimizer(task, flags, debugLog) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("prompt-opt", [...flags, "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "", pendingErrorLine = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => {
      errors += chunk;
      if (debugLog) {
        const lines = `${pendingErrorLine}${chunk}`.split("\n"); pendingErrorLine = lines.pop() ?? "";
        for (const line of lines) if (line.startsWith("prompt-opt[debug] ")) debugLog("cli_debug", { message: line.slice("prompt-opt[debug] ".length) });
      }
    });
    child.on("spawn", () => debugLog?.("child_spawned", { pid: child.pid }));
    child.on("error", error => { debugLog?.("child_error", { name: error.name }); reject(error); });
    child.on("close", code => {
      if (pendingErrorLine.startsWith("prompt-opt[debug] ")) debugLog?.("cli_debug", { message: pendingErrorLine.slice("prompt-opt[debug] ".length) });
      debugLog?.("cli_exit", { exit_code: code, child_elapsed_ms: Date.now() - startedAt });
      if (code !== 0) reject(new Error(errors.trim() || `prompt-opt exited with code ${code}`));
      else if (!output.trim()) reject(new Error("prompt-opt returned an empty prompt"));
      else resolve(output.trim());
    });
    child.stdin.on("error", () => {});
    child.stdin.end(task);
  });
}

function retrieveHistory(hash, ctx) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn("prompt-opt", [hash ? `--history=${hash}` : "--history"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      ctx.ui.notify(`Could not retrieve prompt history: ${String(error)}`, "error"); resolve(); return;
    }
    let output = "", errors = "", settled = false;
    child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { output += chunk; });
    child.stderr?.on("data", chunk => { errors += chunk; });
    child.once("error", error => { settled = true; ctx.ui.notify(`Could not retrieve prompt history: ${String(error)}`, "error"); resolve(); });
    child.once("close", code => {
      if (settled) return;
      settled = true;
      if (code !== 0) ctx.ui.notify(errors || "No request history found", "warning");
      else if (!output.trim()) ctx.ui.notify("No request history found", "info");
      else ctx.ui.setEditorText(output);
      resolve();
    });
  });
}

export default function (pi) {
  pi.registerCommand("prompt-opt", {
    description: "Optimize a prompt using the standalone prompt-opt runner",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const raw = args?.trim() ?? "";
      const history = raw.match(/^--history(?:=([a-f0-9]{64}))?$/);
      if (history) { await retrieveHistory(history[1], ctx); return; }
      if (raw.startsWith("--history")) { ctx.ui.notify("Use --history or --history=<64-character request hash>", "warning"); return; }
      const flags = raw ? raw.split(/\s+/) : [];
      if (flags.some(flag => !allowedFlag.test(flag))) {
        ctx.ui.notify("Use --model=sol --effort=high [--opt-model=luna] [--debug]", "warning"); return;
      }
      const debug = flags.some(flag => flag === "--debug" || flag === "--verbose"), startedAt = Date.now();
      const debugLog = debug ? (event, details = {}) => pi.appendEntry("prompt-opt-debug", { timestamp: new Date().toISOString(), event, elapsed_ms: Date.now() - startedAt, ...details }) : undefined;
      debugLog?.("command_start", { flags }); debugLog?.("editor_open");
      const task = await ctx.ui.editor("Task to optimize", "");
      debugLog?.("editor_ready", { editor_elapsed_ms: Date.now() - startedAt, task_chars: task?.length ?? 0 });
      if (!task?.trim()) return;
      ctx.ui.notify("Optimizing with isolated Pi runner...", "info");
      debugLog?.("spawn_start", { command: "prompt-opt", flags: [...flags, "-"] });
      try {
        const optimized = await runOptimizer(task, flags, debugLog);
        ctx.ui.setEditorText(optimized);
        debugLog?.("complete", { output_chars: optimized.length, total_elapsed_ms: Date.now() - startedAt });
        ctx.ui.notify(debug ? `Prompt optimized in ${((Date.now() - startedAt) / 1000).toFixed(1)}s; debug events saved in session` : "Optimized prompt is ready in editor and clipboard", "info");
      } catch (error) {
        debugLog?.("failed", { total_elapsed_ms: Date.now() - startedAt });
        ctx.ui.setEditorText(task);
        ctx.ui.notify(`Prompt optimization failed: ${String(error)}`, "error");
      }
    },
  });
}
