#!/bin/sh
# ai-mem: manifest-driven sources, last-line-wins, TTLs, and fail-closed input.
# Exit 1 must only ever mean a miss: every broken input exits 2 or is skipped.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'chmod -R u+rwx "$TMP"; rm -rf "$TMP"' EXIT HUP INT TERM
AI_MEM_MANIFEST="$TMP/structure.json"
export AI_MEM_MANIFEST
mem() { python3 "$ROOT/home/dot_local/bin/executable_ai-mem" "$@"; }
# code EXPECTED CMD...: CMD exits with EXPECTED.
code() {
  want=$1; shift
  set +e; "$@" >"$TMP/out" 2>"$TMP/err"; got=$?; set -e
  [ "$got" -eq "$want" ] || { echo "exit $got, want $want: $*" >&2; cat "$TMP/err" >&2; exit 1; }
  if grep -q Traceback "$TMP/err"; then echo "traceback: $*" >&2; cat "$TMP/err" >&2; exit 1; fi
}
# days_ago N: UTC timestamp N days back.
days_ago() { python3 -c 'import datetime as d, sys; print((d.datetime.now(d.timezone.utc) - d.timedelta(days=int(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
# manifest JSON: replace the manifest.
manifest() { printf '%s\n' "$1" >"$AI_MEM_MANIFEST"; }

# The cache rules live in --help (core instructions only point to it), including write approval.
mem --help >"$TMP/help"
grep -q 'get-or-else' "$TMP/help"
grep -q 'if local rules' "$TMP/help"

# Without a manifest every command fails closed.
code 2 mem sources
grep -q 'no manifest' "$TMP/err"

mkdir -p "$TMP/work/jira" "$TMP/home-notes"
cat >"$AI_MEM_MANIFEST" <<EOF
{"sources": {
  "atlassian": {"dir": "$TMP/work", "doc": "$TMP/work/README.md", "purpose": "Jira IDs", "ttl": {"jira/people": 5}},
  "notes": {"dir": "$TMP/home-notes", "defaultTtl": 1000}
}}
EOF
cp "$AI_MEM_MANIFEST" "$TMP/good-manifest.json"
mem sources >"$TMP/sources"
grep -q '"name":"atlassian","purpose":"Jira IDs"' "$TMP/sources"
grep -q '"name":"notes"' "$TMP/sources"

# Records written by other tools (spaced JSON, junk lines) are read; the newest line per key wins.
printf '%s\n' '{"k": "t1", "name": "Auctions", "ts": "2020-01-01T00:00:00Z"}' 'not json' >"$TMP/work/jira/teams.jsonl"
mem put atlassian/jira/teams '{"k":"t2","name":"CoMa"}' >/dev/null
mem put atlassian/jira/teams '{"k":"t1","name":"Auctions v2","_stale":true}' >/dev/null
out=$(mem get atlassian/jira/teams t1)
echo "$out" | grep -q '"name":"Auctions v2"'
if echo "$out" | grep -q _stale; then exit 1; fi
test "$(mem find atlassian/jira/teams auctions | wc -l)" -eq 1
# find needs every term.
test "$(mem find atlassian/jira/teams auctions v2 | wc -l)" -eq 1
code 1 mem find atlassian/jira/teams auctions coma
test "$(mem ls atlassian/jira/teams | wc -l)" -eq 2
code 1 mem get atlassian/jira/teams nope
code 1 mem find atlassian/jira/missing x

# Lines that are valid JSON but not a record (non-object, missing or non-string k, NaN,
# nested too deep) are skipped with a note; the good records still read.
python3 -c 'print("[" * 100000 + "]" * 100000)' >"$TMP/deep"
{
  printf '%s\n' '[]' '"x"' '3' 'null' 'true' '{"no":"k"}' '{"k":["a"]}' '{"k":{"a":1}}' '{"k":5}' '{"k":""}' \
    '{"k":"nan","v":NaN}' '{"k":"lone","v":"\ud800"}'
  cat "$TMP/deep"
  printf '{"k":"ok","ts":"%s"}\n' "$(days_ago 1)"
} >"$TMP/work/jira/mixed.jsonl"
code 0 mem get atlassian/jira/mixed ok
grep -q '"k":"ok"' "$TMP/out"
test "$(grep -c 'skip bad line' "$TMP/err")" -eq 13
code 1 mem get atlassian/jira/mixed nan
code 1 mem get atlassian/jira/mixed lone
test "$(mem ls atlassian/jira/mixed 2>/dev/null | wc -l)" -eq 1

# A ts that is missing, not a string, without timezone or in the future counts as stale.
printf '%s\n' '{"k":"none"}' '{"k":"num","ts":5}' '{"k":"naive","ts":"2026-10-30T00:00:00"}' \
  '{"k":"date","ts":"2026-10-30"}' '{"k":"future","ts":"2999-01-01T00:00:00Z"}' >"$TMP/work/jira/stamps.jsonl"
for key in none num naive date future; do
  code 0 mem get atlassian/jira/stamps "$key"
  grep -q '"_stale":true' "$TMP/out"
done

# TTL precedence: per-file value, then the source default, then 90 days; looked up by the
# normalised name as given, not a symlink's target.
printf '{"k":"p1","ts":"%s"}\n' "$(days_ago 10)" >"$TMP/work/jira/people-2026.jsonl"
ln -s people-2026.jsonl "$TMP/work/jira/people.jsonl"
printf '{"k":"x","ts":"%s"}\n{"k":"old","ts":"%s"}\n' "$(days_ago 10)" "$(days_ago 200)" >"$TMP/work/jira/fields.jsonl"
printf '{"k":"n","ts":"%s"}\n{"k":"ancient","ts":"2020-01-01T00:00:00Z"}\n' "$(days_ago 200)" >"$TMP/home-notes/old.jsonl"
for name in atlassian/jira/people atlassian/jira//people atlassian/./jira/people; do
  mem get "$name" p1 | grep -q '"_stale":true'
done
out=$(mem get atlassian/jira/fields x)
echo "$out" | grep -q '"k":"x"'
if echo "$out" | grep -q _stale; then exit 1; fi
mem get atlassian/jira/fields old | grep -q '"_stale":true'
out=$(mem get notes/old n)
echo "$out" | grep -q '"k":"n"'
if echo "$out" | grep -q _stale; then exit 1; fi
mem get notes/old ancient | grep -q '"_stale":true'

# Bad records and names exit 2 and leave the cache untouched.
cp "$TMP/work/jira/teams.jsonl" "$TMP/teams-before"
for record in '{"name":"no key"}' '{"k":null}' '{"k":5}' '{"k":true}' '{"k":[1]}' '{"k":{}}' '{"k":""}' \
  '{"k":"  "}' '{"k":"a","v":NaN}' '{"k":"a","v":"\ud800"}' '{"k":"\udcff"}' 'not json' '[]'; do
  code 2 mem put atlassian/jira/teams "$record"
  code 2 mem put atlassian/jira/new "$record"
done
cmp "$TMP/teams-before" "$TMP/work/jira/teams.jsonl"
test ! -e "$TMP/work/jira/new.jsonl"
code 2 mem get jira/teams t1
code 2 mem get atlassian t1
code 2 mem put unknown/x '{"k":"a"}'
code 2 mem put atlassian/../escape '{"k":"a"}'
code 2 mem get atlassian/../../etc/passwd x
test ! -e "$TMP/escape.jsonl"
test ! -e "$TMP/unknown"

# Broken cache files exit 2, never 1 (which would read as a miss).
printf '\377\376\n' >"$TMP/work/jira/latin.jsonl"
code 2 mem get atlassian/jira/latin x
mkdir "$TMP/work/jira/dir.jsonl"
code 2 mem get atlassian/jira/dir x
code 2 mem put atlassian/jira/dir '{"k":"a"}'
printf '%s\n' '{"k":"a"}' >"$TMP/work/jira/locked.jsonl"
chmod 000 "$TMP/work/jira/locked.jsonl"
code 2 mem get atlassian/jira/locked a
mkdir "$TMP/work/readonly"
chmod 555 "$TMP/work/readonly"
code 2 mem put atlassian/readonly/x '{"k":"a"}'
# A folder that cannot be entered, or a symlink loop, exits 2 instead of reading as a miss.
mkdir "$TMP/work/sealed"
chmod 000 "$TMP/work/sealed"
code 2 mem get atlassian/sealed/x a
code 2 mem put atlassian/sealed/x '{"k":"a"}'
chmod 755 "$TMP/work/sealed"
ln -s loop-b.jsonl "$TMP/work/loop-a.jsonl"
ln -s loop-a.jsonl "$TMP/work/loop-b.jsonl"
code 2 mem get atlassian/loop-a x

# Broken manifests exit 2: missing source dir, bad fields, wrong types, unreadable or non-UTF-8.
manifest "{\"sources\": {\"gone\": {\"dir\": \"$TMP/nope\"}}}"
code 2 mem put gone/x '{"k":"a"}'
test ! -e "$TMP/nope"
for bad in \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"ttl\": {\"x\": \"30\"}}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"ttl\": {\"x\": true}}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"ttl\": {\"x\": -1}}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"defaultTtl\": 10000000000}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"ttl\": []}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"$TMP\", \"doc\": 5}}}" \
  "{\"sources\": {\"a\": {\"dir\": \"relative/dir\"}}}" \
  "{\"sources\": {\"a\": {\"dir\": 5}}}" \
  "{\"sources\": {\"a\": \"$TMP\"}}" \
  "{\"sources\": {\"\": {\"dir\": \"$TMP\"}}}" \
  "{\"sources\": {\"a/b\": {\"dir\": \"$TMP\"}}}" \
  '{"sources": []}' '[]' '{"sources": {"a": {"dir": "/x", "v": NaN}}}' 'not json'; do
  manifest "$bad"
  code 2 mem sources
done
printf '\377\376\n' >"$AI_MEM_MANIFEST"
code 2 mem sources
rm "$AI_MEM_MANIFEST"
mkdir "$AI_MEM_MANIFEST"
code 2 mem sources
rmdir "$AI_MEM_MANIFEST"
# A manifest inside a folder that cannot be entered.
mkdir "$TMP/sealed-config"
cp "$TMP/good-manifest.json" "$TMP/sealed-config/structure.json"
chmod 000 "$TMP/sealed-config"
code 2 env AI_MEM_MANIFEST="$TMP/sealed-config/structure.json" python3 "$ROOT/home/dot_local/bin/executable_ai-mem" sources
chmod 755 "$TMP/sealed-config"
cp "$TMP/good-manifest.json" "$AI_MEM_MANIFEST"
chmod 000 "$AI_MEM_MANIFEST"
code 2 mem sources
chmod 644 "$AI_MEM_MANIFEST"
echo "ai-mem tests passed"
