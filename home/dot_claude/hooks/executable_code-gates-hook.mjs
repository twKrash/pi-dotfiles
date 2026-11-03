#!/usr/bin/env node
// Claude Code hooks for the code-standards quality gates, run through ~/.local/bin/code-gates:
//   post-edit       PostToolUse Write|Edit|MultiEdit: complexity and duplicate findings as model context
//   pre-commit      PreToolUse Bash: blocks `git commit` until the staged code has been gated
//   session-start   SessionStart: tells the user which tools are missing
// Every failure fails open: the hook must never wedge edits or commits.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CODE_GATES = path.join(os.homedir(), '.local/bin/code-gates');
const CODE_FILE = /\.(py|pyi|ts|tsx|mts|cts)$/;
// shortcut: `cd dir && git commit` is checked in the hook cwd; only `git -C dir` is followed.
const COMMIT = /(?:^|[\s;&|(])git((?:\s+-[cC]\s+\S+)*)\s+commit(?![-\w])/;

const codeGates = (args, cwd) => {
  if (!fs.existsSync(CODE_GATES)) return { status: 0, stdout: '' };
  const result = spawnSync(CODE_GATES, args, { cwd, encoding: 'utf8', timeout: 30000 });
  return { status: result.status ?? 0, stdout: (result.stdout ?? '').trim() };
};

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const cwd = input.cwd && fs.existsSync(input.cwd) ? input.cwd : process.cwd();
const event = process.argv[2];

if (event === 'post-edit') {
  const file = input.tool_input?.file_path ?? '';
  if (!CODE_FILE.test(file)) process.exit(0);
  const { stdout } = codeGates(['quick', path.resolve(cwd, file)], cwd);
  if (stdout) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: stdout } }));
} else if (event === 'pre-commit') {
  const command = input.tool_input?.command ?? '';
  const commit = command.match(COMMIT);
  // CODE_GATES_SKIP=1 is the user's escape hatch.
  if (!commit || /\bCODE_GATES_SKIP=1\b/.test(command)) process.exit(0);
  const dir = commit[1].match(/-C\s+(\S+)/)?.[1];
  const { status, stdout } = codeGates(['check'], dir ? path.resolve(cwd, dir) : cwd);
  if (status === 1) {
    process.stderr.write(`${stdout}\n`);
    process.exit(2);
  }
} else if (event === 'session-start') {
  const { status, stdout } = codeGates(['doctor'], cwd);
  if (status !== 0 && stdout) process.stdout.write(JSON.stringify({ systemMessage: stdout }));
}
process.exit(0);
