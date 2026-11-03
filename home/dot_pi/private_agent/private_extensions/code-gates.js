// Quality gates from the code-standards skill, run through ~/.local/bin/code-gates:
// complexity and duplicate findings after each Python/TypeScript edit, and the missing setup steps at startup.
// The commit gate itself is git's pre-commit hook (`code-gates check`).
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODE_GATES = path.join(os.homedir(), ".local/bin/code-gates");
const CODE_FILE = /\.(py|pyi|ts|tsx|mts|cts)$/;

// Resolves with exit code and stdout; a missing or failing code-gates is never an error here.
const codeGates = (args, cwd, signal) =>
  new Promise((resolve) => {
    if (!fs.existsSync(CODE_GATES)) return resolve({ code: 0, stdout: "" });
    execFile(CODE_GATES, args, { cwd, signal, timeout: 30000 }, (error, stdout) =>
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 0) : 0, stdout: stdout ?? "" }),
    );
  });

export default function (pi) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const { code, stdout } = await codeGates(["doctor"], ctx.cwd);
    if (code !== 0 && stdout.trim()) ctx.ui.notify(stdout.trim(), "warning");
  });

  pi.on("tool_result", async (event, ctx) => {
    const file = event.input?.path;
    if (event.isError || !["write", "edit"].includes(event.toolName) || !CODE_FILE.test(file ?? "")) return;
    const { stdout } = await codeGates(["quick", path.resolve(ctx.cwd, file)], ctx.cwd, ctx.signal);
    if (stdout.trim()) return { content: [...(event.content ?? []), { type: "text", text: stdout.trim() }] };
  });

}
