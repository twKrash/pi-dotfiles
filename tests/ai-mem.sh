#!/bin/sh
# ai-mem: manifest-driven sources, last-line-wins, TTLs, and fail-closed names and manifests.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
AI_MEM_MANIFEST="$TMP/structure.json"
export AI_MEM_MANIFEST
mem() { python3 "$ROOT/home/dot_local/bin/executable_ai-mem" "$@"; }
# code EXPECTED CMD...: CMD exits with EXPECTED.
code() { want=$1; shift; set +e; "$@" >"$TMP/out" 2>"$TMP/err"; got=$?; set -e; [ "$got" -eq "$want" ] || { echo "exit $got, want $want: $*" >&2; cat "$TMP/err" >&2; exit 1; }; }

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
mem sources >"$TMP/sources"
grep -q '"name":"atlassian","purpose":"Jira IDs"' "$TMP/sources"
grep -q '"name":"notes"' "$TMP/sources"

# Records written by other tools (spaced JSON, junk lines) are read; the newest line per key wins.
printf '%s\n' '{"k": "t1", "name": "Auctions", "ts": "2020-01-01T00:00:00Z"}' 'not json' >"$TMP/work/jira/teams.jsonl"
mem put atlassian/jira/teams '{"k":"t2","name":"CoMa"}' >/dev/null
mem put atlassian/jira/teams '{"k":"t1","name":"Auctions v2","_stale":true}' >/dev/null
mem get atlassian/jira/teams t1 | grep -q '"name":"Auctions v2"'
if mem get atlassian/jira/teams t1 | grep -q _stale; then exit 1; fi
test "$(mem find atlassian/jira/teams auctions | wc -l)" -eq 1
test "$(mem ls atlassian/jira/teams | wc -l)" -eq 2
code 1 mem get atlassian/jira/teams nope
code 1 mem find atlassian/jira/missing x

# TTL: per-file value, then the source default, then 90 days.
ten_days_ago=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc) - d.timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
printf '{"k":"p1","ts":"%s"}\n' "$ten_days_ago" >"$TMP/work/jira/people.jsonl"
printf '{"k":"x","ts":"%s"}\n' "$ten_days_ago" >"$TMP/work/jira/fields.jsonl"
printf '{"k":"n","ts":"2020-01-01T00:00:00Z"}\n' >"$TMP/home-notes/old.jsonl"
mem get atlassian/jira/people p1 | grep -q '"_stale":true'
if mem get atlassian/jira/fields x | grep -q _stale; then exit 1; fi
mem get notes/old n | grep -q '"_stale":true'

# Bad input exits 2 and writes nothing.
code 2 mem put atlassian/jira/teams '{"name":"no key"}'
code 2 mem put atlassian/jira/teams 'not json'
code 2 mem get jira/teams t1
code 2 mem get atlassian t1
code 2 mem put unknown/x '{"k":"a"}'
code 2 mem put atlassian/../escape '{"k":"a"}'
code 2 mem get atlassian/../../etc/passwd x
test ! -e "$TMP/escape.jsonl"
test ! -e "$TMP/unknown"

# A source whose dir is missing, or a malformed manifest, fails closed.
printf '{"sources": {"gone": {"dir": "%s/nope"}}}\n' "$TMP" >"$AI_MEM_MANIFEST"
code 2 mem put gone/x '{"k":"a"}'
test ! -e "$TMP/nope"
printf '{"sources": {"a": {"dir": "%s", "ttl": {"x": "30"}}}}\n' "$TMP" >"$AI_MEM_MANIFEST"
code 2 mem sources
printf 'not json\n' >"$AI_MEM_MANIFEST"
code 2 mem sources
printf '{"sources": []}\n' >"$AI_MEM_MANIFEST"
code 2 mem sources
echo "ai-mem tests passed"
