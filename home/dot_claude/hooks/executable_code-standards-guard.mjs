#!/usr/bin/env node
// PreToolUse hook: blocks writing Python or TypeScript until the transcript shows the
// code-standards skill loaded since the last compaction (a successful Skill tool call or Read of
// its SKILL.md, /code-standards, or Claude Code re-attaching the invoked skill after compaction).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CODE_FILE = /\.(py|pyi|ts|tsx|mts|cts)$/;
const SKILL_FILE = /(^|\/)code-standards\/SKILL\.md$/;

function loadedIn(text) {
  let loaded = false;
  // Skill and Read calls count only once their tool result arrives without an error.
  const pending = new Set();
  for (const line of text.split('\n')) {
    if (!line.includes('code-standards') && !line.includes('compact_boundary') && !line.includes('tool_result')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    // Compaction summarizes earlier loads away; only later ones count.
    if (entry.subtype === 'compact_boundary') { loaded = false; pending.clear(); continue; }
    if (entry.attachment?.type === 'invoked_skills' && entry.attachment.skills?.some((skill) => skill.name === 'code-standards')) loaded = true;
    const content = entry.message?.content;
    if (typeof content === 'string' && content.includes('<command-name>/code-standards</command-name>')) loaded = true;
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === 'tool_result' && pending.delete(block.tool_use_id) && !block.is_error) loaded = true;
      if (block.type !== 'tool_use') continue;
      if (block.name === 'Skill' && block.input?.skill === 'code-standards') pending.add(block.id);
      if (block.name === 'Read' && SKILL_FILE.test(block.input?.file_path ?? '')) pending.add(block.id);
    }
  }
  return loaded;
}

// Subagents keep their own transcript in <session>/subagents/agent-<id>.jsonl next to the session one.
function transcriptOf(input) {
  const session = input.transcript_path ?? '';
  if (!session || !input.agent_id) return session;
  return path.join(path.dirname(session), path.basename(session, '.jsonl'), 'subagents', `agent-${input.agent_id}.jsonl`);
}

// The guard must never wedge every edit: unreadable input, a missing skill or a missing transcript fails open.
if (!fs.existsSync(path.join(os.homedir(), '.claude/skills/code-standards/SKILL.md'))) process.exit(0);
let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (!CODE_FILE.test(input.tool_input?.file_path ?? '')) process.exit(0);
let transcript;
try { transcript = fs.readFileSync(transcriptOf(input), 'utf8'); } catch { process.exit(0); }
if (loadedIn(transcript)) process.exit(0);
process.stderr.write('Load the code-standards skill (Skill tool) and apply it before writing Python or TypeScript code, then retry this edit.\n');
process.exit(2);
