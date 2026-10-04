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
printf 'setup tests passed\n'
