// Behavior of code-gates and its Pi/Claude hooks, against fake tools: node tests/code-gates.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'code-gates-')));
const HOME = path.join(TMP, 'home');
const FAKES = path.join(TMP, 'fakes');
const REPO = path.join(TMP, 'repo');
const LOG = path.join(TMP, 'tools.log');
const CODE_GATES = path.join(HOME, '.local/bin/code-gates');
const BASE_PATH = [path.dirname(process.execPath), '/usr/bin', '/bin'].join(':');
const WITH_TOOLS = `${FAKES}:${BASE_PATH}`;

const fake = (name, body) => {
  fs.writeFileSync(path.join(FAKES, name), `#!/bin/sh\necho "${name} $*" >>"${LOG}"\n${body}\n`, { mode: 0o755 });
};
fs.mkdirSync(FAKES, { recursive: true });
fake('crapper', `cat <<'E'
Function   Namespace   CC    Cov%     CRAP
------------------------------------------
big_fn     .x.app      14    N/A      N/A
small_fn   .x.app       6    N/A      N/A
E`);
fake('dryer', `cat <<E
DUPLICATE score=0.95
  ${REPO}/app.py:1-4
  ${REPO}/other.py:5-8

DUPLICATE score=0.90
  ${REPO}/x.py:1-4
  ${REPO}/y.py:1-4
E`);
fake('mutator', 'true');
fs.mkdirSync(path.dirname(CODE_GATES), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'home/dot_local/bin/executable_code-gates'), CODE_GATES);
fs.chmodSync(CODE_GATES, 0o755);

const env = (PATH) => ({ ...process.env, HOME, PATH, XDG_CACHE_HOME: path.join(TMP, 'cache') });
const gates = (args, { cwd = REPO, PATH = WITH_TOOLS } = {}) => {
  const result = spawnSync(CODE_GATES, args, { cwd, env: env(PATH), encoding: 'utf8' });
  return { status: result.status, out: result.stdout };
};
const sh = (command) => spawnSync('sh', ['-c', command], { cwd: REPO, env: env(WITH_TOOLS), encoding: 'utf8' });
const log = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '');

try {
  fs.mkdirSync(REPO);
  sh('git init -q && git config user.email t@t && git config user.name t && echo x >README.md && git add . && git commit -qm init');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(1)\n');

  // doctor
  assert.equal(gates(['doctor']).status, 0, 'doctor passes with every tool installed');
  const doctor = gates(['doctor'], { PATH: BASE_PATH });
  assert.equal(doctor.status, 1, 'doctor fails when tools are missing');
  assert.match(doctor.out, /missing crapper, dryer, mutator[\s\S]*uv tool install/, 'doctor prints install commands');

  // quick
  const quick = gates(['quick', path.join(REPO, 'app.py')]).out;
  assert.match(quick, /big_fn \(CC 14\)/, 'complex functions are reported');
  assert.doesNotMatch(quick, /small_fn/, 'simple functions are not');
  assert.match(quick, /app\.py:1-4 ~ other\.py:5-8 \(0\.95\)/, 'duplicates of the file are reported repo-relative');
  assert.doesNotMatch(quick, /x\.py/, 'duplicates of other files are not');
  assert.equal(gates(['quick', path.join(REPO, 'README.md')]).out, '', 'non-code files are skipped');
  assert.equal(gates(['quick', path.join(REPO, 'app.py')], { PATH: BASE_PATH }).out, '', 'missing tools stay silent');
  assert.equal(sh('git status --porcelain').stdout, '?? app.py\n', 'quick leaves the repository untouched');

  // check and run
  assert.equal(gates(['check']).status, 0, 'nothing staged passes');
  sh('mkdir -p tests && echo t >tests/test_app.py && git add tests');
  assert.equal(gates(['check']).status, 0, 'staged test files alone pass');
  sh('git add app.py');
  const blocked = gates(['check']);
  assert.equal(blocked.status, 1, 'staged code that was not gated is blocked');
  assert.match(blocked.out, /code-gates run/, 'the block says what to run');
  assert.equal(gates(['check'], { PATH: BASE_PATH }).status, 0, 'missing tools fail open');
  fs.writeFileSync(LOG, '');
  const ran = gates(['run', '--test-command', 'pytest -q']);
  assert.equal(ran.status, 0, 'run succeeds');
  assert.match(ran.out, /app\.py:1-4 ~ other\.py:5-8/, 'run reports duplicates of the staged files');
  assert.match(log(), new RegExp(`mutator --test-command pytest -q ${REPO}/app.py\\n`), 'mutator gets the staged source file and test command');
  assert.doesNotMatch(log(), /test_app\.py/, 'test files are not gated');
  assert.equal(gates(['check']).status, 0, 'the gated staged tree passes');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(2)\n');
  sh('git add app.py');
  assert.equal(gates(['check']).status, 1, 'restaged changes must be gated again');
  fs.writeFileSync(LOG, '');
  assert.match(gates(['run', '--no-mutator']).out, /mutator skipped/, '--no-mutator is reported');
  assert.doesNotMatch(log(), /^mutator/m, '--no-mutator skips mutator');
  sh('git reset -q');

  // Pi extension
  process.env.HOME = HOME;
  process.env.PATH = WITH_TOOLS;
  process.env.XDG_CACHE_HOME = path.join(TMP, 'cache');
  const { default: extension } = await import(pathToFileURL(path.join(ROOT, 'home/dot_pi/private_agent/private_extensions/code-gates.js')));
  const handlers = {};
  extension({ on: (name, fn) => { handlers[name] = fn; } });
  const notes = [];
  const ctx = { cwd: REPO, hasUI: true, ui: { notify: (text) => notes.push(text) } };
  const result = await handlers.tool_result({ toolName: 'edit', input: { path: 'app.py' }, content: [{ type: 'text', text: 'ok' }], isError: false }, ctx);
  assert.equal(result.content[0].text, 'ok', 'the tool output is kept');
  assert.match(result.content[1].text, /big_fn \(CC 14\)/, 'findings are appended to the edit result');
  assert.equal(await handlers.tool_result({ toolName: 'edit', input: { path: 'app.py' }, isError: true }, ctx), undefined, 'failed edits are skipped');
  assert.equal(await handlers.tool_result({ toolName: 'write', input: { path: 'README.md' } }, ctx), undefined, 'non-code files are skipped');
  sh('git add app.py');
  const commit = (command, cwd = REPO) => handlers.tool_call({ toolName: 'bash', input: { command } }, { cwd });
  assert.equal((await commit('git commit -m x'))?.block, true, 'an ungated commit is blocked');
  assert.equal((await commit(`git -C ${REPO} commit -m x`, TMP))?.block, true, 'git -C is followed');
  assert.equal(await commit('CODE_GATES_SKIP=1 git commit -m x'), undefined, 'the escape hatch passes');
  assert.equal(await commit('git status && git log'), undefined, 'other git commands pass');
  assert.equal(await commit('git commit-tree HEAD^{tree}'), undefined, 'git commit-tree is not a commit');
  await handlers.session_start({}, ctx);
  assert.deepEqual(notes, [], 'no notice when the tools are installed');
  process.env.PATH = BASE_PATH;
  await handlers.session_start({}, ctx);
  assert.match(notes[0] ?? '', /uv tool install/, 'missing tools are announced at startup');
  await handlers.session_start({}, { ...ctx, hasUI: false });
  assert.equal(notes.length, 1, 'sessions without UI get no notice');
  process.env.PATH = WITH_TOOLS;

  // Claude hook
  const hook = (event, input, PATH = WITH_TOOLS) => {
    const r = spawnSync('node', [path.join(ROOT, 'home/dot_claude/hooks/executable_code-gates-hook.mjs'), event], { input: JSON.stringify({ cwd: REPO, ...input }), env: env(PATH), encoding: 'utf8' });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  const post = JSON.parse(hook('post-edit', { tool_input: { file_path: path.join(REPO, 'app.py') } }).out);
  assert.equal(post.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(post.hookSpecificOutput.additionalContext, /big_fn \(CC 14\)/, 'findings reach the model');
  assert.equal(hook('post-edit', { tool_input: { file_path: 'README.md' } }).out, '', 'non-code edits are silent');
  const pre = hook('pre-commit', { tool_input: { command: 'git commit -m x' } });
  assert.equal(pre.status, 2, 'an ungated commit is blocked');
  assert.match(pre.err, /code-gates run/);
  assert.equal(hook('pre-commit', { tool_input: { command: 'CODE_GATES_SKIP=1 git commit -m x' } }).status, 0, 'the escape hatch passes');
  assert.equal(hook('pre-commit', { tool_input: { command: 'ls' } }).status, 0, 'other commands pass');
  gates(['run', '--no-mutator']);
  assert.equal(hook('pre-commit', { tool_input: { command: 'git commit -m x' } }).status, 0, 'a gated commit passes');
  assert.match(JSON.parse(hook('session-start', {}, BASE_PATH).out).systemMessage, /uv tool install/, 'missing tools are announced');
  assert.equal(hook('session-start', {}).out, '', 'no notice when the tools are installed');
  assert.equal(spawnSync('node', [path.join(ROOT, 'home/dot_claude/hooks/executable_code-gates-hook.mjs'), 'pre-commit'], { input: 'not json', env: env(WITH_TOOLS) }).status, 0, 'unreadable input fails open');
  fs.rmSync(CODE_GATES);
  assert.equal(hook('pre-commit', { tool_input: { command: 'git commit -m y' } }).status, 0, 'a missing code-gates fails open');
  console.log('code-gates tests passed');
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
