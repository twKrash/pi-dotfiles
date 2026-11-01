#!/usr/bin/env node
// chezmoi modify_ helper: reads the live JSON file on stdin, writes the merged file to stdout.
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const [kind, sourcePath, profilePath] = process.argv.slice(2);
if (!['settings', 'mcp', 'pi-goal', 'claude', 'permission'].includes(kind) || !sourcePath) {
  console.error('usage: merge-json.mjs settings|mcp|pi-goal|claude|permission SOURCE [PROFILE] <current.json >merged.json');
  process.exit(2);
}
const targetPath = 'current file';
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
}
const source = readJson(sourcePath);
const profile = profilePath ? readJson(profilePath) : {};
let current = {};
const currentText = fs.readFileSync(0, 'utf8');
try { if (currentText.trim()) current = JSON.parse(currentText); }
catch (error) { throw new Error(`Invalid JSON in ${targetPath}: ${error.message}`); }
if (!current || Array.isArray(current) || typeof current !== 'object') throw new Error(`${targetPath} must contain a JSON object`);
const next = structuredClone(current);

function mergeDefaults(dst, src, prefix = '') {
  for (const [key, value] of Object.entries(src)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (!(key in dst)) dst[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value) && dst[key] && typeof dst[key] === 'object' && !Array.isArray(dst[key])) mergeDefaults(dst[key], value, label);
    else if (JSON.stringify(dst[key]) !== JSON.stringify(value)) {
      console.error(`pi-dotfiles: keeping local ${label}`);
    }
  }
}

// Permission policy merge (pi-permission-system semantics). A rule is "allow" | "ask" | "deny" or
// {action, reason}; a surface is a rule or a pattern map; within a map the last matching rule wins and an
// unmatched surface falls back to permission["*"] ("ask" when absent). A bare path/external_directory key
// expands into its _read/_write keys, its rules running before theirs.
// A fresh install (no live file) gets every repo default. An existing file is only ever tightened: a
// missing repo deny/ask rule is added (appended, so it wins) only if it is stricter than what that
// surface decides by default, and an "ask" never lands where a local deny could match before it.
// Repo allow rules, string-vs-map mismatches, non-permission keys and every local value are left alone.
const RANK = { allow: 0, ask: 1, deny: 2 };
const BARE = { path_read: 'path', path_write: 'path', external_directory_read: 'external_directory', external_directory_write: 'external_directory' };
const isMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !('action' in value);
const action = (rule) => (rule && typeof rule === 'object' ? rule.action : rule);
const hasDeny = (surface) => (isMap(surface) ? Object.values(surface).some((rule) => action(rule) === 'deny') : action(surface) === 'deny');
// What a surface decides when none of its own patterns match.
function fallbackOf(surface, fallback) {
  if (!isMap(surface)) return action(surface);
  return Object.hasOwn(surface, '*') ? action(surface['*']) : fallback;
}
// A rule may be added where `base` is the current decision and a local deny may match earlier (`denied`).
function tightens(rule, base, denied) {
  const wanted = action(rule);
  if (!Object.hasOwn(RANK, wanted) || !Object.hasOwn(RANK, base)) return false;
  return RANK[wanted] > RANK[base] && !(wanted === 'ask' && denied);
}
function tightenMap(local, repo, base, denied, label) {
  const ownBase = fallbackOf(local, base);
  const ownDenied = denied || hasDeny(local);
  for (const [pattern, rule] of Object.entries(repo)) {
    if (Object.hasOwn(local, pattern)) {
      if (!isDeepStrictEqual(local[pattern], rule)) console.error(`pi-dotfiles: keeping local ${label}.${pattern}`);
    } else if (tightens(rule, ownBase, ownDenied)) local[pattern] = rule;
  }
}
function tightenPermission(local, repo) {
  const fallback = Object.hasOwn(local, '*') ? action(local['*']) : 'ask';
  for (const [name, repoSurface] of Object.entries(repo)) {
    const label = `permission.${name}`;
    const bare = Object.hasOwn(local, BARE[name]) ? local[BARE[name]] : undefined;
    const base = bare === undefined ? fallback : fallbackOf(bare, fallback);
    const denied = bare !== undefined && hasDeny(bare);
    if (!Object.hasOwn(local, name)) {
      if (!isMap(repoSurface)) {
        if (tightens(repoSurface, name === '*' ? 'ask' : base, denied)) local[name] = repoSurface;
        continue;
      }
      const added = {};
      tightenMap(added, repoSurface, base, denied, label);
      if (Object.keys(added).length) local[name] = added;
    } else if (isMap(local[name]) && isMap(repoSurface)) tightenMap(local[name], repoSurface, base, denied, label);
    else if (!isDeepStrictEqual(local[name], repoSurface)) console.error(`pi-dotfiles: keeping local ${label}`);
  }
}

  if (kind === 'settings') {
    if (next.packages !== undefined && !Array.isArray(next.packages)) throw new Error(`${targetPath}: packages must be an array`);
    if (source.packages !== undefined && !Array.isArray(source.packages)) throw new Error(`${sourcePath}: packages must be an array`);
    if (profile.packages !== undefined && !Array.isArray(profile.packages)) throw new Error(`${profilePath}: packages must be an array`);
    const oldPackages = Array.isArray(next.packages) ? next.packages : [];
    next.packages = [...new Set([...oldPackages, ...(source.packages ?? []), ...(profile.packages ?? [])])];
    // Existing installs treat the old Git ref and canonical npm ref as separate packages.
    if (next.packages.includes('npm:pi-subagents')) {
      next.packages = next.packages.filter((pkg) => pkg !== 'git:github.com/nicobailon/pi-subagents');
    }
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
  } else if (kind === 'permission') {
    // Only a missing live file is fresh: the plugin reads an existing blank file as "ask everything".
    if (process.env.PI_DOTFILES_FRESH === '1') mergeDefaults(next, source);
    else if (next.permission !== undefined && !isMap(next.permission)) console.error('pi-dotfiles: keeping local permission');
    else {
      const permission = next.permission ?? {};
      tightenPermission(permission, source.permission ?? {});
      if (next.permission !== undefined || Object.keys(permission).length) next.permission = permission;
    }
  } else if (kind === 'claude') {
    // Core instructions forbid harness auto-memory, so this key is enforced, not a default.
    if ('autoMemoryEnabled' in source) next.autoMemoryEnabled = source.autoMemoryEnabled;
    // Add missing repo defaults (plugins, marketplaces, status line); local values win.
    mergeDefaults(next, source);
  } else if (kind === 'pi-goal') {
    // Enforce repo keys (rpc.enabled) and keep every other local setting and unknown field.
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (next[key] !== undefined && (!next[key] || typeof next[key] !== 'object' || Array.isArray(next[key]))) {
          throw new Error(`${targetPath}: ${key} must be an object`);
        }
        next[key] = {...(next[key] ?? {}), ...value};
      } else next[key] = value;
    }
  } else {
    if (next.mcpServers !== undefined && (!next.mcpServers || typeof next.mcpServers !== 'object' || Array.isArray(next.mcpServers))) throw new Error(`${targetPath}: mcpServers must be an object`);
    if (!next.mcpServers) next.mcpServers = {};
    for (const [name, server] of Object.entries(source.mcpServers ?? {})) {
      if (!(name in next.mcpServers)) next.mcpServers[name] = server;
      else if (JSON.stringify(next.mcpServers[name]) !== JSON.stringify(server)) {
        console.error(`pi-dotfiles: keeping local mcpServers.${name}`);
      }
    }
  }

process.stdout.write(isDeepStrictEqual(current, next) ? currentText : `${JSON.stringify(next, null, 2)}\n`);
