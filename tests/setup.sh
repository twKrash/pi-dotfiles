#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
AGENT="$TMP/agent"

PI_CODING_AGENT_DIR="$AGENT" "$ROOT/scripts/setup.sh" --dry-run >"$TMP/dry-run.log"
test ! -e "$AGENT/settings.json"
PI_CODING_AGENT_DIR="$AGENT" "$ROOT/scripts/setup.sh" >"$TMP/install.log"
node - "$AGENT/settings.json" "$AGENT/mcp.json" <<'NODE'
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mcp = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (!settings.packages.includes('npm:@twkrash/pi-session-inspector@1.5.3')) throw new Error('missing published session-inspector');
if (!mcp.mcpServers.context7?.url) throw new Error('missing Context7');
NODE

# Preserve unrelated user values, merge package additions, and keep local conflicts.
node - "$AGENT/settings.json" "$AGENT/mcp.json" <<'NODE'
const fs = require('fs');
const p = process.argv[2]; const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.userSetting = 'keep'; fs.writeFileSync(p, JSON.stringify(s));
const m = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
m.mcpServers.local = {url: 'http://localhost'}; fs.writeFileSync(process.argv[3], JSON.stringify(m));
NODE
printf '%s\n' '{"local":true}' > "$AGENT/extensions/pi-permission-system/config.json"
PI_CODING_AGENT_DIR="$AGENT" "$ROOT/scripts/setup.sh" >"$TMP/update.log"
node - "$AGENT/settings.json" "$AGENT/mcp.json" <<'NODE'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const m = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (s.userSetting !== 'keep') throw new Error('settings overwritten');
if (!m.mcpServers.local) throw new Error('unrelated MCP config overwritten');
NODE
grep -q 'CONFLICT' "$TMP/update.log"
test -f "$AGENT/extensions/pi-permission-system/config.json.pi-dotfiles-new"

# Explicit Claude profile updates only model and thinking; existing tool limits stay.
CLAUDE_AGENT="$TMP/claude-agent"
mkdir -p "$CLAUDE_AGENT"
node - "$CLAUDE_AGENT/settings.json" <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  packages: ['npm:custom-package'],
  defaultProvider: 'keep-provider',
  defaultModel: 'keep-model',
  subagents: {agentOverrides: {
    scout: {model: 'local/old', thinking: 'high', tools: ['read', 'grep']},
    worker: {tools: ['read', 'edit', 'write']}
  }}
}));
NODE
PI_CODING_AGENT_DIR="$CLAUDE_AGENT" "$ROOT/scripts/setup.sh" --provider=claude >"$TMP/claude.log"
node - "$CLAUDE_AGENT/settings.json" <<'NODE'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const roles = s.subagents.agentOverrides;
if (!s.packages.includes('npm:custom-package')) throw new Error('custom package removed');
if (!s.packages.includes('npm:pi-claude-agent-sdk')) throw new Error('Claude SDK package missing');
if (s.defaultProvider !== 'keep-provider' || s.defaultModel !== 'keep-model') throw new Error('main model defaults changed');
if (roles.scout.model !== 'claude-bridge/claude-haiku-4-5' || roles.scout.thinking !== 'low') throw new Error('Claude scout profile missing');
if (roles.worker.model !== 'claude-bridge/claude-sonnet-5-5' || roles.worker.thinking !== 'medium') throw new Error('Claude worker profile missing');
if (roles.reviewer.model !== 'claude-bridge/claude-opus-5-5' || roles.reviewer.thinking !== 'medium') throw new Error('Claude reviewer profile missing');
if (roles.oracle.model !== 'claude-bridge/claude-opus-5-5' || roles.oracle.thinking !== 'high') throw new Error('Claude oracle profile missing');
if (JSON.stringify(roles.scout.tools) !== JSON.stringify(['read', 'grep'])) throw new Error('scout tools changed');
if (JSON.stringify(roles.worker.tools) !== JSON.stringify(['read', 'edit', 'write'])) throw new Error('worker tools changed');
NODE
if PI_CODING_AGENT_DIR="$CLAUDE_AGENT" "$ROOT/scripts/setup.sh" --provider=unknown >"$TMP/invalid.log" 2>&1; then
  echo 'unknown provider unexpectedly accepted' >&2
  exit 1
fi
grep -q 'Unsupported provider' "$TMP/invalid.log"
CODEX_AGENT="$TMP/codex-agent"
PI_CODING_AGENT_DIR="$CODEX_AGENT" "$ROOT/scripts/setup.sh" --provider=codex >"$TMP/codex.log"
node - "$CODEX_AGENT/settings.json" <<'NODE'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const roles = s.subagents.agentOverrides;
if (roles.scout.model !== 'openai-codex/gpt-6-luna') throw new Error('Codex scout profile missing');
if (roles.oracle.model !== 'openai-codex/gpt-6.1-sol') throw new Error('Codex oracle profile missing');
if (s.packages.includes('npm:pi-claude-agent-sdk')) throw new Error('Claude SDK added to Codex profile');
NODE
printf 'setup tests passed\n'
