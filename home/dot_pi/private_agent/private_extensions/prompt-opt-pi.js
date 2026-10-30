// Pi adapter for the standalone prompt-opt CLI.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const allowedFlag =
  /^(?:--goal|--debug|--verbose|--(?:provider|model|effort|environment|opt-provider|opt-model|opt-effort)=[A-Za-z0-9._/-]+)$/;
const completionFlags = [
  "-h",
  "--help",
  "--history",
  "--goal",
  "--debug",
  "--verbose",
  "--context",
  "--provider=",
  "--model=",
  "--effort=",
  "--environment=",
  "--opt-provider=",
  "--opt-model=",
  "--opt-effort=",
];
const thinkingLevels = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const targetModels = [
  "luna",
  "sol",
  "sol-6",
  "sol-6.1",
  "astra",
  "opus-5.5",
  "sonnet-5.5",
  "haiku-5.5",
];
const optimizerModels = [
  ...targetModels,
  "gpt-6-luna",
  "gpt-6.1-sol",
  "gpt-6-sol",
  "gpt-6-astra",
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
];
const valueCompletions = {
  "--provider=": ["openai", "anthropic"],
  "--model=": targetModels,
  "--opt-provider=": ["openai", "anthropic"],
  "--opt-model=": optimizerModels,
  "--opt-effort=": thinkingLevels,
};

function getArgumentCompletions(prefix) {
  const separator = prefix.lastIndexOf(" ") + 1;
  const previous = prefix.slice(0, separator);
  const current = prefix.slice(separator);
  const optionValue = /^(--(?:opt-)?(?:provider|model|effort)=)(.*)$/.exec(
    current,
  );
  const values = optionValue && valueCompletions[optionValue[1]];
  const candidates = values
    ? values
        .filter((value) => value.startsWith(optionValue[2]))
        .map((value) => ({
          value: `${previous}${optionValue[1]}${value}`,
          label: value,
        }))
    : completionFlags
        .filter((flag) => flag.startsWith(current))
        .map((flag) => ({ value: `${previous}${flag}`, label: flag }));
  return candidates.length ? candidates : null;
}

function tokenizeArguments(input) {
  const tokens = [];
  let token = "",
    quote = "",
    started = false;
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (quote === "'") {
      if (character === "'") quote = "";
      else token += character;
    } else if (quote === '"') {
      if (character === '"') quote = "";
      else if (character === "\\" && ['"', "\\"].includes(input[i + 1]))
        token += input[++i];
      else token += character;
    } else if (character === "\\") {
      if (i + 1 >= input.length)
        throw new Error("trailing escape in command options");
      token += input[++i];
      started = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) tokens.push(token);
      token = "";
      started = false;
    } else {
      token += character;
      started = true;
    }
  }
  if (quote) throw new Error("unclosed quote in command options");
  if (started) tokens.push(token);
  return tokens;
}

function parseArguments(input) {
  const tokens = tokenizeArguments(input);
  const flags = [];
  let context = "",
    hasContext = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--context") {
      if (hasContext) throw new Error("use --context only once");
      if (i + 1 >= tokens.length)
        throw new Error("--context requires instructions");
      context = tokens[++i];
      hasContext = true;
    } else if (token.startsWith("--context=")) {
      if (hasContext) throw new Error("use --context only once");
      context = token.slice("--context=".length);
      hasContext = true;
    } else if (allowedFlag.test(token)) flags.push(token);
    else throw new Error(`unsupported option: ${token}`);
  }
  return { flags, context, hasContext };
}

function runOptimizer(task, flags, debugLog, cwd = process.cwd(), env) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("prompt-opt", [...flags, "-"], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      errors = "",
      pendingErrorLine = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
      if (debugLog) {
        const lines = `${pendingErrorLine}${chunk}`.split("\n");
        pendingErrorLine = lines.pop() ?? "";
        for (const line of lines)
          if (line.startsWith("prompt-opt[debug] "))
            debugLog("cli_debug", {
              message: line.slice("prompt-opt[debug] ".length),
            });
      }
    });
    child.on("spawn", () => debugLog?.("child_spawned", { pid: child.pid }));
    child.on("error", (error) => {
      debugLog?.("child_error", { name: error.name });
      reject(error);
    });
    child.on("close", (code) => {
      if (pendingErrorLine.startsWith("prompt-opt[debug] "))
        debugLog?.("cli_debug", {
          message: pendingErrorLine.slice("prompt-opt[debug] ".length),
        });
      debugLog?.("cli_exit", {
        exit_code: code,
        child_elapsed_ms: Date.now() - startedAt,
      });
      if (code !== 0)
        reject(
          new Error(errors.trim() || `prompt-opt exited with code ${code}`),
        );
      else if (!output.trim())
        reject(new Error("prompt-opt returned an empty prompt"));
      else resolve(output.trim());
    });
    child.stdin.on("error", () => {});
    child.stdin.end(task);
  });
}

function retrieveHistory(hash, ctx) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("prompt-opt", [hash ? `--history=${hash}` : "--history"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      ctx.ui.notify(
        `Could not retrieve prompt history: ${String(error)}`,
        "error",
      );
      resolve();
      return;
    }
    let output = "",
      errors = "",
      settled = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      errors += chunk;
    });
    child.once("error", (error) => {
      settled = true;
      ctx.ui.notify(
        `Could not retrieve prompt history: ${String(error)}`,
        "error",
      );
      resolve();
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0)
        ctx.ui.notify(errors || "No request history found", "warning");
      else if (!output.trim())
        ctx.ui.notify("No request history found", "info");
      else ctx.ui.setEditorText(output);
      resolve();
    });
  });
}

// pi-goal managed-run RPC: subscribe to the run channel, then emit the start request.
const GOAL_START_CHANNEL = "pi-goal:start";
const GOAL_EVENT_PREFIX = "pi-goal:event:";
const GOAL_CONFIRM_TIMEOUT_MS = 10_000;
// pi-goal publishes the active state before it delivers the kickoff prompt, so a delivery failure
// arrives as a later error. Keep listening briefly so a rolled-back Goal is not reported as started.
const GOAL_SETTLE_MS = 500;

function positiveEnvMs(name, fallback) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function goalConfirmTimeoutMs() {
  return positiveEnvMs(
    "PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS",
    GOAL_CONFIRM_TIMEOUT_MS,
  );
}

function goalSettleMs() {
  return positiveEnvMs("PROMPT_OPT_GOAL_SETTLE_MS", GOAL_SETTLE_MS);
}

// The command context owns the authoritative session identity; ambient env may be stale or unset.
function currentSessionId(ctx) {
  try {
    const id = ctx.sessionManager?.getSessionId?.();
    return typeof id === "string" && id.trim() ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

function parseGoalHandoff(output) {
  let value;
  try {
    value = JSON.parse(output.trim());
  } catch {
    throw new Error("prompt-opt returned an unreadable goal handoff result");
  }
  if (
    !value ||
    value.status !== "handoff-written" ||
    typeof value.handoff_path !== "string" ||
    !value.handoff_path ||
    typeof value.objective !== "string" ||
    !value.objective
  ) {
    throw new Error("prompt-opt did not confirm a persisted goal handoff");
  }
  return value;
}

function describeGoalFailure({ code, message }) {
  switch (code) {
    case "GOAL_ALREADY_EXISTS":
      return "a Goal already exists in this session and was left unchanged; run /goal clear before retrying";
    case "RPC_DISABLED":
      return "managed-run RPC is disabled; enable it in /goal → Settings";
    case "NO_CONFIRMATION":
      return "Goal activation unconfirmed.\nCheck /goal status before retrying.";
    case "RPC_UNAVAILABLE":
      return `the Goal event bus is unavailable (${message})`;
    default:
      return `${code}: ${message}`;
  }
}

function activateGoal(pi, objective, debugLog) {
  const events = pi.events;
  if (!events?.on || !events?.emit)
    return Promise.resolve({
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "pi.events is missing",
    });
  const runId = `prompt-opt-${randomUUID()}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      unsubscribe();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          code: "NO_CONFIRMATION",
          message: "no managed-run event arrived",
        }),
      goalConfirmTimeoutMs(),
    );
    let settleTimer;
    let unsubscribe = () => {};
    try {
      unsubscribe = events.on(`${GOAL_EVENT_PREFIX}${runId}`, (event) => {
        if (!event || event.runId !== runId) return;
        if (event.type === "error" && event.operation === "start") {
          finish({
            ok: false,
            code: event.error?.code ?? "RPC_ERROR",
            message: event.error?.message ?? "unknown error",
          });
        } else if (event.type === "state" && event.status === "active") {
          settleTimer ??= setTimeout(
            () => finish({ ok: true, goalId: event.goalId }),
            goalSettleMs(),
          );
        } else if (event.type === "state") {
          finish({
            ok: false,
            code: "NOT_ACTIVE",
            message: `Goal reported status ${event.status}`,
          });
        }
      });
    } catch (error) {
      finish({ ok: false, code: "RPC_UNAVAILABLE", message: String(error) });
      return;
    }
    debugLog?.("goal_start_emit", { runId });
    try {
      events.emit(GOAL_START_CHANNEL, { runId, objective });
    } catch (error) {
      finish({ ok: false, code: "RPC_UNAVAILABLE", message: String(error) });
    }
  });
}

export default function (pi) {
  pi.registerCommand("prompt-opt", {
    description:
      "Optimize a prompt, optionally gathering read-only context with configured Pi tools",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const raw = args?.trim() ?? "";
      if (raw === "--help" || raw === "-h") {
        try {
          ctx.ui.notify(await runOptimizer("", [raw]), "info");
        } catch (error) {
          ctx.ui.notify(
            `Could not retrieve prompt-opt help: ${String(error)}`,
            "error",
          );
        }
        return;
      }
      const history = raw.match(/^--history(?:=([a-f0-9]{64}))?$/);
      if (history) {
        await retrieveHistory(history[1], ctx);
        return;
      }
      if (raw.startsWith("--history")) {
        ctx.ui.notify(
          "Use --history or --history=<64-character request hash>",
          "warning",
        );
        return;
      }
      let parsed;
      try {
        parsed = parseArguments(raw);
      } catch (error) {
        ctx.ui.notify(
          `${String(error)}. Quote free-form context with --context "...".`,
          "warning",
        );
        return;
      }
      const { flags, context, hasContext } = parsed;
      const goalMode = flags.includes("--goal");
      let goalSessionId;
      if (goalMode) {
        goalSessionId = currentSessionId(ctx);
        if (!goalSessionId) {
          ctx.ui.notify(
            "Goal mode needs the current Pi session ID; nothing was written and no Goal was started.",
            "error",
          );
          return;
        }
      }
      const cliFlags = hasContext ? [...flags, "--context", context] : flags;
      const debugFlags = hasContext
        ? [...flags, "--context=<redacted>"]
        : flags;
      const debug = flags.some(
          (flag) => flag === "--debug" || flag === "--verbose",
        ),
        startedAt = Date.now();
      const debugLog = debug
        ? (event, details = {}) =>
            pi.appendEntry("prompt-opt-debug", {
              timestamp: new Date().toISOString(),
              event,
              elapsed_ms: Date.now() - startedAt,
              ...details,
            })
        : undefined;
      debugLog?.("command_start", { flags: debugFlags });
      debugLog?.("editor_open");
      const task = await ctx.ui.editor("Task to optimize", "");
      debugLog?.("editor_ready", {
        editor_elapsed_ms: Date.now() - startedAt,
        task_chars: task?.length ?? 0,
      });
      if (!task?.trim()) return;
      ctx.ui.notify(
        hasContext
          ? "Optimizing with configured tools under a read-only context policy..."
          : "Optimizing with isolated Pi runner...",
        "info",
      );
      debugLog?.("spawn_start", {
        command: "prompt-opt",
        flags: [...debugFlags, "-"],
      });
      try {
        const optimizerCwd =
          hasContext && typeof ctx.cwd === "string" && ctx.cwd
            ? ctx.cwd
            : process.cwd();
        const optimized = await runOptimizer(
          task,
          cliFlags,
          debugLog,
          optimizerCwd,
          goalMode
            ? { ...process.env, PI_SESSION_ID: goalSessionId }
            : undefined,
        );
        if (goalMode) {
          const handoff = parseGoalHandoff(optimized);
          const authorityStart = handoff.objective.indexOf(
            " The authoritative task specification is at: ",
          );
          const handoffInstructions =
            authorityStart >= 0
              ? handoff.objective.slice(authorityStart)
              : ` The authoritative task specification is at: ${JSON.stringify(handoff.handoff_path)}. Read it fully before execution; after compaction or whenever requirements become unclear, consult it again to preserve its requirements; verify its acceptance criteria before completing the goal.`;
          let objective = handoff.objective;
          while (true) {
            const preview =
              `Goal preview:\n- Handoff file: ${handoff.handoff_path}\n- Goal: ${objective}`;
            const choice = await ctx.ui.select(preview, [
              "proceed",
              "edit",
              "cancel",
            ]);
            if (choice === "proceed") break;
            if (choice !== "edit") {
              ctx.ui.notify("Goal handoff saved; Goal not started.", "info");
              return;
            }
            const edited = await ctx.ui.editor("Edit Goal", objective);
            if (!edited?.trim()) {
              ctx.ui.notify("Goal handoff saved; Goal not started.", "info");
              return;
            }
            const editedSummary = edited
              .trim()
              .replace(handoffInstructions, "")
              .trim();
            if (!editedSummary) {
              ctx.ui.notify("Goal handoff saved; Goal not started.", "info");
              return;
            }
            objective = editedSummary + handoffInstructions;
            if (objective.length > 4000) {
              ctx.ui.notify(
                "Edited Goal exceeds pi-goal's 4000-character limit; Goal not started.",
                "error",
              );
              return;
            }
          }
          if (currentSessionId(ctx) !== goalSessionId) {
            ctx.ui.notify(
              "Session changed during optimization; Goal not started.",
              "error",
            );
            return;
          }
          const activation = await activateGoal(pi, objective, debugLog);
          const status = activation.ok
            ? `Goal started (goal ${activation.goalId})`
            : activation.code === "NO_CONFIRMATION"
              ? describeGoalFailure(activation)
              : `Goal not started: ${describeGoalFailure(activation)}`;
          debugLog?.("goal_activation", {
            ok: activation.ok,
            code: activation.code,
            total_elapsed_ms: Date.now() - startedAt,
          });
          ctx.ui.notify(
            `Goal handoff: ${handoff.handoff_path}; ${status}`,
            activation.ok ? "info" : "error",
          );
          return;
        }
        ctx.ui.setEditorText(optimized);
        debugLog?.("complete", {
          output_chars: optimized.length,
          total_elapsed_ms: Date.now() - startedAt,
        });
        ctx.ui.notify(
          debug
            ? `Prompt optimized in ${((Date.now() - startedAt) / 1000).toFixed(1)}s; debug events saved in session`
            : "Optimized prompt is ready in editor and clipboard",
          "info",
        );
      } catch (error) {
        debugLog?.("failed", { total_elapsed_ms: Date.now() - startedAt });
        if (!goalMode) ctx.ui.setEditorText(task);
        ctx.ui.notify(`Prompt optimization failed: ${String(error)}`, "error");
      }
    },
  });
}
