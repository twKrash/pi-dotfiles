#!/usr/bin/env node
// Register the MCP servers in SOURCE with Claude Code at user scope. Servers already known are left alone.
// Uses the `claude` CLI (not ~/.claude.json, which Claude Code rewrites while running); skips when it is absent.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const [sourcePath] = process.argv.slice(2);
if (!sourcePath) {
  console.error('usage: claude-mcp-sync.mjs SOURCE');
  process.exit(2);
}
const servers = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).mcpServers ?? {};
const claude = (...args) => spawnSync('claude', args, { stdio: 'pipe', encoding: 'utf8' });

if (claude('--version').error) {
  console.error('pi-dotfiles: claude CLI not found, skipping MCP sync');
  process.exit(0);
}
for (const [name, server] of Object.entries(servers)) {
  if (claude('mcp', 'get', name).status === 0) continue;
  const added = claude('mcp', 'add-json', '--scope', 'user', name, JSON.stringify(server));
  if (added.status !== 0) {
    console.error(`pi-dotfiles: failed to add MCP server ${name}: ${added.stderr.trim()}`);
    process.exit(1);
  }
  console.error(`pi-dotfiles: added Claude Code MCP server ${name}`);
}
