// Behavior of the code-standards guards: node tests/code-standards-guard.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-guard-'));
const HOME = path.join(TMP, 'home');
const SKILL = path.join(HOME, '.pi/agent/skills/code-standards/SKILL.md');
fs.mkdirSync(path.dirname(SKILL), { recursive: true });
fs.writeFileSync(SKILL, 'rules\n');

try {
  // Pi extension, driven through a fake ExtensionAPI.
  process.env.HOME = HOME;
  const { default: guard } = await import(pathToFileURL(path.join(ROOT, 'home/dot_pi/private_agent/private_extensions/code-standards-guard.js')));
  const handlers = {};
  guard({ on: (name, fn) => { handlers[name] = fn; } });
  // `context` stands in for what buildContextEntries() returns (compaction already applied).
  let context = [];
  const ctx = { sessionManager: { buildContextEntries: () => context } };
  const call = (toolName, input) => handlers.tool_call({ toolName, input }, ctx);
  const message = (role, content) => ({ type: 'message', message: { role, content } });
  const readSkill = message('assistant', [{ type: 'toolCall', name: 'read', arguments: { path: SKILL } }]);
  assert.equal(call('write', { path: 'notes.md' }), undefined, 'non-code files pass');
  assert.equal(call('bash', { command: 'ls' }), undefined, 'other tools pass');
  assert.equal(call('edit', { path: 'src/app.py' })?.block, true, 'Python edit blocked before the skill is read');
  assert.equal(call('write', { path: 'src/app.tsx' })?.block, true, 'TypeScript write blocked before the skill is read');
  context = [message('user', 'mentions code-standards/SKILL.md'), message('assistant', [{ type: 'toolCall', name: 'read', arguments: { path: 'other/SKILL.md' } }])];
  assert.equal(call('edit', { path: 'src/app.py' })?.block, true, 'mentions and other skills do not count');
  context = [readSkill];
  assert.equal(call('edit', { path: 'src/app.py' }), undefined, 'edits pass while the read skill is in context');
  context = [{ type: 'compaction', summary: 'earlier work' }];
  assert.equal(call('edit', { path: 'src/app.ts' })?.block, true, 'compaction that dropped the read requires it again');
  context = [message('user', [{ type: 'text', text: '<skill name="code-standards" location="x">\nrules\n</skill>' }])];
  assert.equal(call('edit', { path: 'src/app.ts' }), undefined, '/skill:code-standards counts as loaded');
  context = [];
  fs.rmSync(SKILL);
  assert.equal(call('edit', { path: 'src/app.py' }), undefined, 'a missing skill never wedges edits');

  // Claude hook, run as Claude Code runs it.
  const hook = path.join(ROOT, 'home/dot_claude/hooks/executable_code-standards-guard.mjs');
  const transcript = path.join(TMP, 'transcript.jsonl');
  const run = (input) => spawnSync('node', [hook], { input: typeof input === 'string' ? input : JSON.stringify(input) }).status;
  const edit = (file) => ({ tool_name: 'Edit', tool_input: { file_path: file }, transcript_path: transcript });
  const toolUse = (name, input) => JSON.stringify({ message: { content: [{ type: 'tool_use', name, input }] } });
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: 'mentions code-standards/SKILL.md in prose' } })}\n`);
  assert.equal(run(edit('README.md')), 0, 'non-code files pass');
  assert.equal(run(edit('src/app.py')), 2, 'Python edit blocked before the skill is loaded');
  assert.equal(run('not json'), 0, 'unreadable input fails open');
  fs.appendFileSync(transcript, `${toolUse('Skill', { skill: 'code-standards' })}\n`);
  assert.equal(run(edit('src/app.py')), 0, 'Skill tool load passes');
  fs.writeFileSync(transcript, `${toolUse('Read', { file_path: '/h/.claude/skills/code-standards/SKILL.md' })}\n`);
  assert.equal(run(edit('src/app.ts')), 0, 'reading SKILL.md passes');
  const boundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary' });
  fs.appendFileSync(transcript, `${boundary}\n`);
  assert.equal(run(edit('src/app.ts')), 2, 'a load before compaction no longer counts');
  fs.appendFileSync(transcript, `${JSON.stringify({ type: 'attachment', attachment: { type: 'invoked_skills', skills: [{ name: 'code-standards' }] } })}\n`);
  assert.equal(run(edit('src/app.ts')), 0, 'a skill Claude Code re-attaches after compaction counts');
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: '<command-name>/code-standards</command-name>' } })}\n`);
  assert.equal(run(edit('src/app.ts')), 0, '/code-standards passes');
  const subagent = path.join(TMP, 'agent.jsonl');
  fs.writeFileSync(subagent, `${toolUse('Skill', { skill: 'code-standards' })}\n`);
  fs.writeFileSync(transcript, '');
  assert.equal(run({ ...edit('src/app.py'), agent_transcript_path: subagent }), 0, 'subagent transcript is checked');
  console.log('code-standards guard tests passed');
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
