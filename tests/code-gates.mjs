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
const IGNORE = path.join(HOME, '.config/git/ignore');
const BIN = path.dirname(CODE_GATES);
const WITH_TOOLS = `${FAKES}:${BIN}:${BASE_PATH}`;

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
// Like the real dryer: paths are relative to --root (default: the working directory), absolute outside it.
fake('dryer', `root=$PWD; src=$PWD; prev=; for a in "$@"; do [ "$prev" = --root ] && root=$a; [ "$prev" = -s ] && src=$a; prev=$a; done
if [ "$src" = "$root" ]; then p=; else case "$src" in "$root"/*) p="\${src#"$root"/}/";; *) p="$src/";; esac; fi
cat <<E
DUPLICATE score=0.95
  \${p}app.py:1-4
  \${p}other.py:5-8

DUPLICATE score=0.90
  \${p}x.py:1-4
  \${p}y.py:1-4
E`);
fake('mutator', 'true');
fs.mkdirSync(path.dirname(CODE_GATES), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'home/dot_local/bin/executable_code-gates'), CODE_GATES);
fs.chmodSync(CODE_GATES, 0o755);

const env = (PATH) => {
  // An agent's shell (Pi), with git's global config under HOME.
  const vars = { ...process.env, HOME, PATH, XDG_CACHE_HOME: path.join(TMP, 'cache'), PI_CODING_AGENT: 'true' };
  for (const name of ['XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'CLAUDECODE']) delete vars[name];
  return vars;
};
const gates = (args, { cwd = REPO, PATH = WITH_TOOLS, extra = {} } = {}) => {
  const result = spawnSync(CODE_GATES, args, { cwd, env: { ...env(PATH), ...extra }, encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const sh = (command, extra = {}) => spawnSync('sh', ['-c', command], { cwd: REPO, env: { ...env(WITH_TOOLS), ...extra }, encoding: 'utf8' });
// Fixture commits are a human's, so the gate leaves them alone.
const HUMAN = { PI_CODING_AGENT: '' };
const head = () => sh('git rev-parse HEAD').stdout;
const log = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '');

try {
  fs.mkdirSync(REPO);
  sh('git init -q && git config user.email t@t && git config user.name t && echo x >README.md && git add . && git commit -qm init');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(1)\n');

  // doctor
  const setup = gates(['doctor']);
  assert.equal(setup.status, 1, 'doctor fails until the hook and the git ignore are set up');
  assert.match(setup.out, /git config --global hook\.code-gates\.event pre-commit/, 'doctor prints the hook setup');
  assert.match(setup.out, /\.metrics\/\\ntarget\/[\s\S]*\.config\/git\/ignore/, 'doctor prints the git ignore setup');
  assert.doesNotMatch(setup.out, /uv tool install/, 'installed tools are not reported');
  sh(setup.out.split('\n').filter((line) => line.startsWith('  ')).join(' && '));
  assert.equal(sh('git hook list pre-commit').stdout.trim(), 'code-gates', 'the printed commands set up the hook');
  assert.equal(fs.readFileSync(IGNORE, 'utf8'), '.metrics/\ntarget/\n', 'the printed commands set up the git ignore');
  assert.equal(gates(['doctor']).status, 0, 'doctor passes once everything is set up');
  const doctor = gates(['doctor'], { PATH: BASE_PATH });
  assert.equal(doctor.status, 1, 'doctor fails when tools are missing');
  assert.match(doctor.out, /missing crapper, dryer, mutator[\s\S]*uv tool install/, 'doctor prints install commands');
  const other = path.join(TMP, 'other-ignore');
  sh(`git config --global core.excludesFile ${other}`);
  assert.match(gates(['doctor']).out, new RegExp(`>>'${other}'`), 'doctor checks the ignore file git actually reads');
  sh('git config --global --unset core.excludesFile');

  // quick
  const quick = gates(['quick', path.join(REPO, 'app.py')]).out;
  assert.match(quick, /big_fn \(CC 14\)/, 'complex functions are reported');
  assert.doesNotMatch(quick, /small_fn/, 'simple functions are not');
  assert.match(quick, /app\.py:1-4 ~ other\.py:5-8 \(0\.95\)/, 'duplicates of the file are reported repo-relative');
  assert.doesNotMatch(quick, /x\.py/, 'duplicates of other files are not');
  fs.symlinkSync(REPO, path.join(TMP, 'link'));
  assert.match(gates(['quick', path.join(TMP, 'link/app.py')]).out, /app\.py:1-4 ~ other\.py:5-8/, 'a symlinked path still finds duplicates');
  assert.equal(gates(['quick', path.join(REPO, 'README.md')]).out, '', 'non-code files are skipped');
  fs.mkdirSync(path.join(TMP, 'loose'));
  fs.writeFileSync(path.join(TMP, 'loose', 'free.py'), 'print(1)\n');
  fs.writeFileSync(LOG, '');
  gates(['quick', path.join(TMP, 'loose', 'free.py')]);
  assert.doesNotMatch(log(), /^dryer/m, 'outside a repository quick does not search a tree for duplicates');
  assert.equal(gates(['quick', path.join(REPO, 'app.py')], { PATH: BASE_PATH }).out, '', 'missing tools stay silent');
  assert.equal(sh('git status --porcelain').stdout, '?? app.py\n', 'quick leaves the repository untouched');
  fs.mkdirSync(path.join(REPO, '.worktrees/wt'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'app.py'), path.join(REPO, '.worktrees/wt/app.py'));
  sh('echo .worktrees/ >>.git/info/exclude');
  fs.writeFileSync(LOG, '');
  gates(['quick', path.join(REPO, 'app.py')]);
  assert.match(log(), /^dryer .*app\.py/m, 'dryer gets the source files');
  assert.doesNotMatch(log(), /\.worktrees/, 'dryer does not get git-ignored files');
  sh('rm -r .worktrees && sed -i.bak /worktrees/d .git/info/exclude');

  // check and run
  assert.equal(gates(['check']).status, 0, 'nothing staged passes');
  sh('mkdir -p tests && echo t >tests/test_app.py && git add tests');
  assert.equal(gates(['check']).status, 0, 'staged test files alone pass');
  sh('git add app.py');
  const blocked = gates(['check']);
  assert.equal(blocked.status, 1, 'staged code that was not gated is blocked');
  assert.match(blocked.err, /code-gates run/, 'the block says what to run');
  assert.equal(gates(['check'], { PATH: BASE_PATH }).status, 0, 'missing tools fail open');
  fs.mkdirSync(path.join(REPO, 'sub'), { recursive: true });
  sh('git config diff.relative true');
  assert.equal(gates(['check'], { cwd: path.join(REPO, 'sub') }).status, 1, 'diff.relative does not hide staged code from a subdirectory');
  sh('git config --unset diff.relative');
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
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(5)\n');
  assert.equal(gates(['run', '--no-mutator']).status, 1, 'run refuses while the working tree differs from the staged code');
  assert.equal(gates(['check']).status, 1, 'a refused run does not gate the staged tree');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(2)\n');
  fs.writeFileSync(LOG, '');
  assert.match(gates(['run', '--no-mutator']).out, /mutator skipped/, '--no-mutator is reported');
  assert.doesNotMatch(log(), /^mutator/m, '--no-mutator skips mutator');
  sh('git reset -q');
  fs.writeFileSync(path.join(REPO, 'café.py'), 'print(1)\n');
  sh('git add café.py');
  assert.equal(gates(['check']).status, 1, 'non-ASCII file names are gated');
  sh('git rm -q --cached café.py && rm café.py');

  // git's pre-commit hook (set up by doctor's commands above) sees exactly what each commit records
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(3)\n');
  sh('git add app.py');
  const before = head();
  const refused = sh('git commit -qm x');
  assert.notEqual(refused.status, 0, 'an agent commit of ungated code fails');
  assert.match(refused.stderr, /code-gates run/, 'the agent is told what to run');
  assert.equal(head(), before, 'nothing was committed');
  assert.notEqual(sh('git commit -qm x', { PI_CODING_AGENT: '', CLAUDECODE: '1' }).status, 0, 'Claude Code commits are gated too');
  assert.equal(sh('git commit -qm skip', { CODE_GATES_SKIP: '1' }).status, 0, 'CODE_GATES_SKIP=1 skips the gate');
  sh('git reset -q --soft HEAD~1');
  assert.equal(sh('git commit -qm human', HUMAN).status, 0, 'commits outside an agent are not gated');
  sh('git reset -q --soft HEAD~1');
  gates(['run', '--no-mutator']);
  fs.writeFileSync(path.join(REPO, 'scratch.py'), 'print(1)\n');
  assert.equal(sh('git commit -qm gated').status, 0, 'a gated commit succeeds, with unrelated untracked code around');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(4)\n');
  assert.notEqual(sh('git commit -qam x').status, 0, 'commit -a of ungated changes fails');
  assert.notEqual(sh('git commit -qm x app.py').status, 0, 'commit <paths> of ungated changes fails');
  assert.notEqual(sh('echo scratch.py | xargs git add && git commit -qm x').status, 0, 'code staged in any way is gated');
  sh('git reset -q');
  fs.appendFileSync(path.join(REPO, 'README.md'), 'more\n');
  assert.equal(sh('git add README.md && git commit -qm docs').status, 0, 'a docs commit passes with unrelated dirty code');
  sh('git checkout -q app.py && rm scratch.py');

  fs.mkdirSync(path.join(REPO, 'web/[id]'), { recursive: true });
  fs.mkdirSync(path.join(REPO, 'web/d'), { recursive: true });
  fs.writeFileSync(path.join(REPO, 'web/d/page.tsx'), 'export {}\n');
  sh('git add web && git commit -qm web', HUMAN);
  fs.writeFileSync(path.join(REPO, 'web/[id]/page.tsx'), 'export {}\n');
  fs.writeFileSync(path.join(REPO, 'web/d/page.tsx'), 'export const d = 1\n');
  sh("git --literal-pathspecs add 'web/[id]/page.tsx'");
  assert.equal(gates(['run', '--no-mutator']).status, 0, 'staged paths with glob characters are compared literally');
  sh('git reset -q && git checkout -q web && rm -r "web/[id]"');
  sh('git checkout -q app.py && git mv app.py moved.py && git commit -qm move', HUMAN);
  fs.writeFileSync(path.join(REPO, 'moved.py'), Array.from({ length: 20 }, (_, i) => `x${i} = ${i}\n`).join(''));
  sh('git commit -qam fill && git mv moved.py renamed.py && echo "y = 1" >>renamed.py && git add renamed.py', HUMAN);
  assert.match(sh('git diff --cached --name-status').stdout, /^R/, 'the fixture is a detected rename');
  assert.equal(gates(['check']).status, 1, 'a renamed and edited file must be gated');
  sh('git reset -q && git checkout -q -- . && rm renamed.py && git mv moved.py app.py && git commit -qm back', HUMAN);
  assert.equal(sh('git status --porcelain -uno').stdout, '', 'tracked files are clean again');
  fs.writeFileSync(path.join(REPO, 'app.py'), 'print(5)\n');

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
  await handlers.session_start({}, ctx);
  assert.deepEqual(notes, [], 'no notice when everything is set up');
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
  assert.match(JSON.parse(hook('session-start', {}, BASE_PATH).out).systemMessage, /uv tool install/, 'missing tools are announced');
  assert.equal(hook('session-start', {}).out, '', 'no notice when everything is set up');
  assert.equal(spawnSync('node', [path.join(ROOT, 'home/dot_claude/hooks/executable_code-gates-hook.mjs'), 'post-edit'], { input: 'not json', env: env(WITH_TOOLS) }).status, 0, 'unreadable input fails open');
  fs.rmSync(CODE_GATES);
  assert.equal(hook('post-edit', { tool_input: { file_path: path.join(REPO, 'app.py') } }).status, 0, 'a missing code-gates fails open');
  assert.equal(sh('git add app.py && git commit -qm y').status, 0, 'a missing code-gates does not block commits');
  console.log('code-gates tests passed');
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
