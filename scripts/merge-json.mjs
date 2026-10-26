#!/usr/bin/env node
// chezmoi modify_ helper: reads the live JSON file on stdin, writes the merged file to stdout.
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const [kind, sourcePath, profilePath] = process.argv.slice(2);
if (!['settings', 'mcp', 'pi-goal'].includes(kind) || !sourcePath) {
  console.error('usage: merge-json.mjs settings|mcp|pi-goal SOURCE [PROFILE] <current.json >merged.json');
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
