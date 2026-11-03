// Blocks writing Python or TypeScript while the code-standards skill is not in the model's
// context: read it once per session, again only after compaction drops it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODE_FILE = /\.(py|pyi|ts|tsx|mts|cts)$/;
const SKILL_FILE = /(^|\/)code-standards\/SKILL\.md$/;
const SKILL_PATH = path.join(os.homedir(), ".pi/agent/skills/code-standards/SKILL.md");

const textOf = (content) =>
  typeof content === "string" ? content : (content ?? []).map((block) => block.text ?? "").join("");

// Context entries already honor compaction, so a load the summary dropped no longer counts.
function skillInContext(sessionManager) {
  for (const entry of sessionManager.buildContextEntries()) {
    const message = entry.type === "message" ? entry.message : undefined;
    if (message?.role === "user" && textOf(message.content).startsWith('<skill name="code-standards"')) return true;
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "toolCall" && block.name === "read" && SKILL_FILE.test(block.arguments?.path ?? "")) return true;
    }
  }
  return false;
}

export default function (pi) {
  pi.on("tool_call", (event, ctx) => {
    if (!["write", "edit"].includes(event.toolName) || !CODE_FILE.test(event.input?.path ?? "")) return;
    // A missing skill must not wedge every edit.
    if (!fs.existsSync(SKILL_PATH) || skillInContext(ctx.sessionManager)) return;
    return {
      block: true,
      reason: `Read ${SKILL_PATH} and apply it before writing Python or TypeScript code, then retry this edit.`,
    };
  });
}
