#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [kind, sourcePath, targetPath, profilePath] = process.argv.slice(2);
if (!['settings', 'mcp'].includes(kind) || !sourcePath || !targetPath) {
  console.error('usage: merge-json.mjs settings|mcp SOURCE TARGET [PROFILE]');
  process.exit(2);
}
const dryRun = process.env.PI_DOTFILES_DRY_RUN === '1';
const force = process.env.PI_DOTFILES_FORCE === '1';
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
}
const source = readJson(sourcePath);
const profile = profilePath ? readJson(profilePath) : {};
let current = {};
try { current = JSON.parse(fs.readFileSync(targetPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error(`Invalid JSON in ${targetPath}: ${error.message}`); }
if (!current || Array.isArray(current) || typeof current !== 'object') throw new Error(`${targetPath} must contain a JSON object`);
const next = structuredClone(current);
let conflicts = false;

function mergeDefaults(dst, src, prefix = '') {
  for (const [key, value] of Object.entries(src)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (!(key in dst)) dst[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value) && dst[key] && typeof dst[key] === 'object' && !Array.isArray(dst[key])) mergeDefaults(dst[key], value, label);
    else if (JSON.stringify(dst[key]) !== JSON.stringify(value)) {
      if (force) dst[key] = value;
      else { conflicts = true; console.log(`CONFLICT retained local ${label}`); }
    }
  }
}

  if (kind === 'settings') {
    if (next.packages !== undefined && !Array.isArray(next.packages)) throw new Error(`${targetPath}: packages must be an array`);
    if (source.packages !== undefined && !Array.isArray(source.packages)) throw new Error(`${sourcePath}: packages must be an array`);
    if (profile.packages !== undefined && !Array.isArray(profile.packages)) throw new Error(`${profilePath}: packages must be an array`);
    const oldPackages = Array.isArray(next.packages) ? next.packages : [];
    next.packages = [...new Set([...oldPackages, ...(source.packages ?? []), ...(profile.packages ?? [])])];
    if (source.subagents) {
      if (next.subagents !== undefined && (!next.subagents || typeof next.subagents !== 'object' || Array.isArray(next.subagents))) throw new Error(`${targetPath}: subagents must be an object`);
      if (!next.subagents) next.subagents = {};
      mergeDefaults(next.subagents, source.subagents, 'subagents');
    }
    const roleOverrides = profile.subagents?.agentOverrides;
    if (roleOverrides !== undefined && (!roleOverrides || typeof roleOverrides !== 'object' || Array.isArray(roleOverrides))) throw new Error(`${profilePath}: subagents.agentOverrides must be an object`);
    if (roleOverrides) {
      if (next.subagents !== undefined && (!next.subagents || typeof next.subagents !== 'object' || Array.isArray(next.subagents))) throw new Error(`${targetPath}: subagents must be an object`);
      if (!next.subagents) next.subagents = {};
      if (next.subagents.agentOverrides !== undefined && (!next.subagents.agentOverrides || typeof next.subagents.agentOverrides !== 'object' || Array.isArray(next.subagents.agentOverrides))) throw new Error(`${targetPath}: subagents.agentOverrides must be an object`);
      if (!next.subagents.agentOverrides) next.subagents.agentOverrides = {};
      for (const [role, values] of Object.entries(roleOverrides)) {
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`${profilePath}: agentOverrides.${role} must be an object`);
        const currentRole = next.subagents.agentOverrides[role] ?? {};
        if (!currentRole || typeof currentRole !== 'object' || Array.isArray(currentRole)) throw new Error(`${targetPath}: subagents.agentOverrides.${role} must be an object`);
        next.subagents.agentOverrides[role] = {...currentRole};
        for (const field of ['model', 'thinking']) {
          if (values[field] !== undefined) next.subagents.agentOverrides[role][field] = values[field];
        }
      }
    }
  } else {
    if (next.mcpServers !== undefined && (!next.mcpServers || typeof next.mcpServers !== 'object' || Array.isArray(next.mcpServers))) throw new Error(`${targetPath}: mcpServers must be an object`);
    if (!next.mcpServers) next.mcpServers = {};
    for (const [name, server] of Object.entries(source.mcpServers ?? {})) {
      if (!(name in next.mcpServers)) next.mcpServers[name] = server;
      else if (JSON.stringify(next.mcpServers[name]) !== JSON.stringify(server)) {
        if (force) next.mcpServers[name] = server;
        else { conflicts = true; console.log(`CONFLICT retained local mcpServers.${name}`); }
      }
    }
  }

const serialized = `${JSON.stringify(next, null, 2)}\n`;
if (serialized === (fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '')) {
  console.log(`UNCHANGED ${targetPath}`);
} else {
  console.log(`${dryRun ? 'WOULD UPDATE' : 'UPDATED'} ${targetPath}`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (fs.existsSync(targetPath)) {
      const backup = `${targetPath}.pi-dotfiles-bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.copyFileSync(targetPath, backup);
      console.log(`BACKUP ${backup}`);
    }
    const temp = `${targetPath}.tmp.${process.pid}`;
    fs.writeFileSync(temp, serialized, { mode: 0o600 });
    fs.renameSync(temp, targetPath);
  }
}
if (conflicts) process.exitCode = 3;
