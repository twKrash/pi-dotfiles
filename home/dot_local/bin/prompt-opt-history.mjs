#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [cmd, ...args] = process.argv.slice(2);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
function safeParents(target) {
  const absolute=path.resolve(target), parts=absolute.split(path.sep).filter(Boolean);
  let current=path.parse(absolute).root;
  for(const part of parts) {
    current=path.join(current,part);
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()) fail('symlink in path');
    if(current!==absolute&&!stat.isDirectory()) fail('non-directory path component');
  }
}
function ensureDirectoryTree(target) {
  const absolute=path.resolve(target), parts=absolute.split(path.sep).filter(Boolean);
  let current=path.parse(absolute).root;
  for(const part of parts) {
    current=path.join(current,part);
    try { const stat=fs.lstatSync(current); if(stat.isSymbolicLink()||!stat.isDirectory()) fail('unsafe directory component'); }
    catch(error) {
      if(error.code!=='ENOENT') throw error;
      fs.mkdirSync(current,{mode:0o700});
    }
  }
}
const regular = file => { safeParents(path.dirname(file)); const s=fs.lstatSync(file); if(!s.isFile()||s.isSymbolicLink()) fail('not a regular file'); return fs.readFileSync(file); };
const directory = dir => { safeParents(dir); const s=fs.lstatSync(dir); if(!s.isDirectory()||s.isSymbolicLink()) fail('not a directory'); };
function parseJson(file) {
  try { return JSON.parse(regular(file).toString('utf8')); }
  catch { fail(`invalid JSON: ${file}`); }
}
function walk(root) {
  directory(root); const rows=[];
  function visit(dir,rel='') {
    for(const ent of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>(a.name>b.name)-(a.name<b.name))) {
      const full=path.join(dir,ent.name), name=path.join(rel,ent.name), s=fs.lstatSync(full);
      if(s.isSymbolicLink()) fail('symlink in prompt lab');
      if(s.isDirectory()) {
        rows.push(['directory',name]);
        visit(full,name);
      } else if(s.isFile()) rows.push(['file',name,hash(regular(full))]);
      else fail('unsupported prompt lab entry');
    }
  }
  visit(root); return hash(JSON.stringify(rows));
}
function fingerprint(lab,version,settings) {
  if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)||settings.length!==7) fail('invalid fingerprint input');
  return hash(JSON.stringify({settings,lab:walk(lab),version,contract:'prompt-opt-contract-1'}));
}
function optionalRegular(file) {
  try { return regular(file); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
function prepareState(state) {
  ensureDirectoryTree(state);
  const history=path.join(state,'history');
  try { const stat=fs.lstatSync(history); if(stat.isSymbolicLink()||!stat.isDirectory()) fail(`unsafe history directory: ${history}`); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  for(const name of ['last-input.md','last-output.md','last-successful-input.md','last-settings.txt','last-successful-settings.txt']) {
    const target=path.join(state,name);
    try {
      const stat=fs.lstatSync(target);
      if(stat.isSymbolicLink()||!stat.isFile()) fail(`unsafe mutable state file: ${target}`);
      regular(target);
    } catch(error) { if(error.code!=='ENOENT') throw error; }
  }
}
function safeEntries(dir) {
  try { directory(dir); return fs.readdirSync(dir); } catch { return []; }
}
function validateRecord(dir,h,compatibility) {
  directory(dir);
  const m=parseJson(path.join(dir,'metadata.json'));
  const original=regular(path.join(dir,'original.md')), output=regular(path.join(dir,'optimized.md'));
  if(m.origin==='legacy') {
    for(const name of m.legacy_settings||[]) regular(path.join(dir,name));
  }
  if(m.schema!==1 || m.request_sha256!==h || hash(original)!==h || hash(output)!==m.optimized_sha256 || m.compatibility!==compatibility || !Array.isArray(m.settings) || m.settings.length!==7 || m.settings.some(value=>typeof value!=='string') || (compatibility!=='unverified'&&(m.contract_revision!=='prompt-opt-contract-1'||typeof m.pi_version!=='string'))) fail('invalid record');
  return {m,original,output};
}
function records(state,wanted=null) {
  const root=path.join(state,'history'), result=[];
  for(const h of safeEntries(root)) {
    if(wanted&&h!==wanted) continue;
    if(!/^[a-f0-9]{64}$/.test(h)) continue;
    const hp=path.join(root,h); try { directory(hp); } catch { continue; }
    for(const c of safeEntries(hp)) {
      if(!/^(?:[a-f0-9]{64}|unverified)$/.test(c)) continue;
      const cp=path.join(hp,c); try { directory(cp); } catch { continue; }
      for(const id of safeEntries(cp)) {
        const dir=path.join(cp,id);
        try {
        const {m,original,output}=validateRecord(dir,h,c);
        result.push({dir,id,hash:h,compat:c,m,original,output});
        } catch { process.stderr.write(`prompt-opt: skipped malformed history record ${dir}\n`); }
      }
    }
  }
  return result;
}
function save(state,request,answer,metadata) {
  const original=regular(request), output=regular(answer), meta=parseJson(metadata);
  const requestHash=hash(original), compatibility=meta.compatibility||'unverified';
  if(!Array.isArray(meta.settings)||meta.settings.length!==7||meta.settings.some(value=>typeof value!=='string')) fail('invalid settings metadata');
  if(compatibility!=='unverified'&&!/^[a-f0-9]{64}$/.test(compatibility)) fail('invalid compatibility key');
  const root=path.join(state,'history',requestHash,compatibility);
  ensureDirectoryTree(root);
  const dir=path.join(root,`${Date.now()}-${crypto.randomUUID()}`); fs.mkdirSync(dir,{mode:0o700});
  fs.writeFileSync(path.join(dir,'original.md'),original,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(dir,'optimized.md'),output,{flag:'wx',mode:0o600});
  Object.assign(meta,{schema:1,compatibility,request_sha256:requestHash,source_context_digest:meta.source_context_digest||requestHash,optimized_sha256:hash(output),created_at:new Date().toISOString()});
  fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify(meta,null,2),{flag:'wx',mode:0o600}); return dir;
}
function archiveLegacy(state) {
  const output=optionalRegular(path.join(state,'last-output.md'));
  if(!output) return;
  const inputs=[];
  for(const name of ['last-input.md','last-successful-input.md']) {
    const original=optionalRegular(path.join(state,name));
    if(original) inputs.push({name,original});
  }
  if(!inputs.length) return;
  const settingsFiles={};
  for(const name of ['last-settings.txt','last-successful-settings.txt']) {
    const bytes=optionalRegular(path.join(state,name));
    if(bytes) settingsFiles[name]=bytes;
  }
  const outputHash=hash(output);
  for(const input of inputs) {
    const requestHash=hash(input.original);
    const pairHash=hash(JSON.stringify([requestHash,outputHash,Object.entries(settingsFiles).map(([name,bytes])=>[name,hash(bytes)])]));
    const root=path.join(state,'history',requestHash,'unverified');
    ensureDirectoryTree(root);
    let found=false;
    for(const id of safeEntries(root)) {
      const dir=path.join(root,id);
      try {
        const {m,original:storedOriginal,output:storedOutput}=validateRecord(dir,requestHash,'unverified');
        if(m.origin!=='legacy'||m.optimized_sha256!==outputHash||!storedOriginal.equals(input.original)||!storedOutput.equals(output)) continue;
        for(const name of ['last-settings.txt','last-successful-settings.txt']) {
          const saved=optionalRegular(path.join(dir,name));
          if(Boolean(saved)!==Boolean(settingsFiles[name])||(saved&&!saved.equals(settingsFiles[name]))) throw new Error('legacy settings mismatch');
        }
        found=true; break;
      } catch { /* Incomplete/corrupt archives are preserved and not deduplicated. */ }
    }
    if(found) continue;
    const baseId=`legacy-${pairHash.slice(0,16)}`;
    let dir=path.join(root,baseId);
    try { fs.lstatSync(dir); dir=path.join(root,`${baseId}-${crypto.randomUUID()}`); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    fs.mkdirSync(dir,{mode:0o700});
    fs.writeFileSync(path.join(dir,'original.md'),input.original,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(dir,'optimized.md'),output,{flag:'wx',mode:0o600});
    for(const [name,bytes] of Object.entries(settingsFiles)) fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx',mode:0o600});
    const meta={schema:1,compatibility:'unverified',settings:Array(7).fill(''),request_sha256:requestHash,optimized_sha256:outputHash,origin:'legacy',legacy_source:input.name,legacy_settings:Object.keys(settingsFiles),legacy_settings_sha256:Object.fromEntries(Object.entries(settingsFiles).map(([name,bytes])=>[name,hash(bytes)])),unverified_reason:'legacy provenance unavailable'};
    fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify(meta,null,2),{flag:'wx',mode:0o600});
  }
}
if(cmd==='fingerprint') {
  try { process.stdout.write(fingerprint(args[0],args[1],args.slice(2,9))); } catch { process.exit(2); }
} else if(cmd==='save') {
  try { process.stdout.write(save(...args)); }
  catch(error) { console.error(`prompt-opt: ${error.message}`); process.exitCode=1; }
}
else if(cmd==='prepare-state') {
  try { prepareState(args[0]); }
  catch(error) { console.error(`prompt-opt: ${error.message}`); process.exitCode=1; }
} else if(cmd==='archive-legacy') {
  try { archiveLegacy(args[0]); }
  catch(error) { console.error(`prompt-opt: ${error.message}`); process.exitCode=1; }
}
else if(cmd==='list'||cmd==='show'||cmd==='lookup') {
  const [state,requestFile,settingsFile,compat]=args;
  let wanted=null;
  if(requestFile!=='-') {
    if(cmd==='show'&&/^[a-f0-9]{64}$/.test(requestFile)) wanted=requestFile;
    else wanted=hash(regular(requestFile));
  }
  const found=records(state,wanted);
  if(cmd==='list') for(const r of found) console.log(`${r.hash} ${r.id} ${(r.m.settings||[]).join('/')}`);
  else if(cmd==='show') {
    if(!found.length) process.exit(1);
    for(const r of found) {
      let label=`settings=${r.m.settings.join('/')}`;
      if(r.m.origin==='legacy') label='legacy/unverified';
      else if(r.m.compatibility==='unverified') label='unverified';
      console.log(`=== ${r.id} ${label} ===`);
      process.stdout.write('\n--- original ---\n'); process.stdout.write(r.original);
      process.stdout.write('\n--- optimized ---\n'); process.stdout.write(r.output);
      if(r.output.at(-1)!==10) console.log();
    }
  } else {
    const settings=regular(settingsFile).toString().trimEnd().split('\n');
    const hit=found.toReversed().find(r=>r.compat===compat&&r.m.compatibility===compat&&JSON.stringify(r.m.settings)===JSON.stringify(settings));
    if(hit) process.stdout.write(hit.output); else process.exit(1);
  }
} else process.exit(2);
