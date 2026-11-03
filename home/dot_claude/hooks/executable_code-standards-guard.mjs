#!/usr/bin/env node
// PreToolUse hook: blocks writing Python or TypeScript until the transcript shows the
// code-standards skill loaded since the last compaction (Skill tool, /code-standards, a Read of
// its SKILL.md, or Claude Code re-attaching the invoked skill after compaction).
import fs from 'node:fs';

const CODE_FILE = /\.(py|pyi|ts|tsx|mts|cts)$/;
const SKILL_FILE = /(^|\/)code-standards\/SKILL\.md$/;

function loadedIn(transcriptPath) {
  let text;
  try { text = fs.readFileSync(transcriptPath, 'utf8'); } catch { return false; }
  let loaded = false;
  for (const line of text.split('\n')) {
    if (!line.includes('code-standards') && !line.includes('compact_boundary')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    // Compaction summarizes earlier loads away; only later ones count.
    if (entry.subtype === 'compact_boundary') { loaded = false; continue; }
    if (entry.attachment?.type === 'invoked_skills' && entry.attachment.skills?.some((skill) => skill.name === 'code-standards')) loaded = true;
    const content = entry.message?.content;
    if (typeof content === 'string' && content.includes('<command-name>/code-standards</command-name>')) loaded = true;
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'Skill' && block.input?.skill === 'code-standards') loaded = true;
      if (block.name === 'Read' && SKILL_FILE.test(block.input?.file_path ?? '')) loaded = true;
    }
  }
  return loaded;
}

let input;
// Unreadable hook input fails open: the guard must never wedge every edit.
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const target = input.tool_input?.file_path ?? '';
if (!CODE_FILE.test(target)) process.exit(0);
// Subagents have their own transcript; fall back to the session one.
const transcripts = [input.agent_transcript_path, input.transcript_path].filter(Boolean);
if (transcripts.some(loadedIn)) process.exit(0);
process.stderr.write('Load the code-standards skill (Skill tool) and apply it before writing Python or TypeScript code, then retry this edit.\n');
process.exit(2);
