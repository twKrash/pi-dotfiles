import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const GOAL_START_CHANNEL = "pi-goal:start";
const GOAL_EVENT_PREFIX = "pi-goal:event:";
const GOAL_CONFIRM_TIMEOUT_MS = 10_000;
const GOAL_SETTLE_MS = 500;
const GOAL_OBJECTIVE_LIMIT = 4000;
const GOAL_STOP_CONDITION = "Stop when every criterion is verified.";

function positiveEnvMs(name, fallback) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function sessionHandoffDirectory(sessionId) {
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    path.basename(sessionId) !== sessionId ||
    sessionId === "." ||
    sessionId === ".."
  ) {
    throw new Error("current Pi session ID is not a safe handoff directory name");
  }
  return path.resolve(
    process.env.HOME || homedir(),
    ".pi",
    "agent",
    "handoffs",
    sessionId,
  );
}

function parseGoalResult(output, sessionId) {
  let value;
  try {
    value = JSON.parse(output.trim());
  } catch {
    throw new Error("prompt-opt returned an unreadable goal result");
  }
  if (value?.status === "needs-clarification") {
    if (typeof value.question !== "string" || !value.question.trim())
      throw new Error("prompt-opt returned an invalid clarification result");
    return { status: value.status, question: value.question.trim() };
  }
  if (value?.status !== "inline" && value?.status !== "handoff-written")
    throw new Error("prompt-opt returned an invalid goal result");
  if (typeof value.objective !== "string" || !value.objective.trim())
    throw new Error("prompt-opt returned an invalid goal objective");
  if (value.objective.length > GOAL_OBJECTIVE_LIMIT)
    throw new Error("Goal objective exceeds pi-goal's 4000-character limit");
  if (
    !value.objective.includes("Definition of Done:") ||
    !value.objective.includes(GOAL_STOP_CONDITION) ||
    !Array.isArray(value.definition_of_done) ||
    !value.definition_of_done.length ||
    value.definition_of_done.some(
      (criterion) =>
        typeof criterion !== "string" ||
        !criterion.trim() ||
        !value.objective.includes(criterion.trim()),
    )
  ) {
    throw new Error("prompt-opt returned a goal without a complete Definition of Done");
  }
  if (value.status === "inline")
    return {
      status: value.status,
      objective: value.objective,
      definition_of_done: value.definition_of_done.map((criterion) =>
        criterion.trim(),
      ),
    };
  if (
    typeof value.handoff_path !== "string" ||
    !path.isAbsolute(value.handoff_path) ||
    path.dirname(path.resolve(value.handoff_path)) !==
      sessionHandoffDirectory(sessionId) ||
    path.extname(value.handoff_path) !== ".md" ||
    !value.objective.includes(value.handoff_path)
  ) {
    throw new Error("prompt-opt returned an invalid handoff path");
  }
  return {
    status: value.status,
    handoff_path: value.handoff_path,
    objective: value.objective,
    definition_of_done: value.definition_of_done.map((criterion) =>
      criterion.trim(),
    ),
  };
}

async function readGoalHandoff(handoffPath, sessionId, criteria) {
  const directory = sessionHandoffDirectory(sessionId);
  const file = path.resolve(handoffPath);
  if (
    !path.isAbsolute(handoffPath) ||
    path.dirname(file) !== directory ||
    path.extname(file) !== ".md"
  ) {
    throw new Error("Goal handoff is outside the current session directory");
  }
  const home = process.env.HOME || homedir();
  const [directoryStat, fileStat] = await Promise.all([
    lstat(directory),
    lstat(file),
  ]);
  if (
    directoryStat.isSymbolicLink() ||
    !directoryStat.isDirectory() ||
    fileStat.isSymbolicLink() ||
    !fileStat.isFile()
  ) {
    throw new Error("Goal handoff is not a regular file in the current session");
  }
  const [homeReal, directoryReal, fileReal] = await Promise.all([
    realpath(home),
    realpath(directory),
    realpath(file),
  ]);
  const expectedDirectory = path.resolve(
    homeReal,
    ".pi",
    "agent",
    "handoffs",
    sessionId,
  );
  if (
    directoryReal !== expectedDirectory ||
    path.dirname(fileReal) !== directoryReal
  ) {
    throw new Error("Goal handoff resolves outside the current session directory");
  }
  const task = await readFile(file, "utf8");
  const normalizedTask = task.replace(/\s+/gu, " ");
  if (
    !task.trim() ||
    !normalizedTask.includes("Definition of Done:") ||
    !normalizedTask.includes(GOAL_STOP_CONDITION) ||
    criteria.some((criterion) => !normalizedTask.includes(criterion))
  ) {
    throw new Error("Goal handoff does not match its validated Definition of Done");
  }
  return task;
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
      positiveEnvMs(
        "PROMPT_OPT_GOAL_CONFIRM_TIMEOUT_MS",
        GOAL_CONFIRM_TIMEOUT_MS,
      ),
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
            positiveEnvMs("PROMPT_OPT_GOAL_SETTLE_MS", GOAL_SETTLE_MS),
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

export async function runGoalFlow({
  pi,
  ctx,
  task,
  flags,
  debugLog,
  debugFlags,
  startedAt,
  cwd,
  sessionId,
  runOptimizer,
  currentSessionId,
}) {
  let currentTask = task;
  while (true) {
    debugLog?.("spawn_start", {
      command: "prompt-opt",
      flags: [...debugFlags, "-"],
    });
    const output = await runOptimizer(currentTask, flags, debugLog, cwd, {
      ...process.env,
      PI_SESSION_ID: sessionId,
    });
    const result = parseGoalResult(output, sessionId);
    if (currentSessionId(ctx) !== sessionId) {
      ctx.ui.notify("Session changed during optimization; Goal not started.", "error");
      return;
    }
    if (result.status === "needs-clarification") {
      ctx.ui.notify(result.question, "warning");
      const answer = await ctx.ui.editor("Answer Goal clarification", "");
      if (!answer?.trim()) {
        ctx.ui.notify("Goal not started; clarification was cancelled.", "info");
        return;
      }
      currentTask = `${currentTask}\n\nClarification: ${result.question}\nAnswer: ${answer.trim()}`;
      continue;
    }
    const handoffTask =
      result.status === "handoff-written"
        ? await readGoalHandoff(
            result.handoff_path,
            sessionId,
            result.definition_of_done,
          )
        : undefined;
    const handoffDescription =
      result.status === "handoff-written"
        ? result.handoff_path
        : "not needed (the complete task fits within the 4000-character limit)";
    const choice = await ctx.ui.select(
      `Goal preview:\n- Handoff file: ${handoffDescription}\n- Goal: ${result.objective}`,
      ["proceed", "edit", "cancel"],
    );
    if (choice === "proceed") {
      if (currentSessionId(ctx) !== sessionId) {
        ctx.ui.notify("Session changed during optimization; Goal not started.", "error");
        return;
      }
      const activation = await activateGoal(pi, result.objective, debugLog);
      let status;
      if (activation.ok) status = `Goal started (goal ${activation.goalId})`;
      else if (activation.code === "NO_CONFIRMATION")
        status = describeGoalFailure(activation);
      else status = `Goal not started: ${describeGoalFailure(activation)}`;
      debugLog?.("goal_activation", {
        ok: activation.ok,
        code: activation.code,
        total_elapsed_ms: Date.now() - startedAt,
      });
      ctx.ui.notify(
        result.status === "handoff-written"
          ? `Goal handoff: ${result.handoff_path}; ${status}`
          : status,
        activation.ok ? "info" : "error",
      );
      return;
    }
    if (choice !== "edit") {
      ctx.ui.notify(
        result.status === "handoff-written"
          ? "Goal handoff saved; Goal not started."
          : "Goal not started.",
        "info",
      );
      return;
    }
    // Pi's extension editor exposes the configured $VISUAL/$EDITOR keybinding.
    const edited = await ctx.ui.editor(
      "Edit Goal Task",
      handoffTask ?? result.objective,
    );
    if (!edited?.trim()) {
      ctx.ui.notify("Goal not started; the edit was cancelled.", "info");
      return;
    }
    currentTask = edited;
  }
}
