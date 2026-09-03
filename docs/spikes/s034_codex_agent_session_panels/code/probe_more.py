"""s034: second token_count in same file (delta vs cumulative), session_index.jsonl vs rollout link,
archived_sessions, history.jsonl, resume mechanics, web_search_call."""
import json, glob, os

files = sorted(glob.glob("/home/karon/.codex/sessions/2026/09/04/*.jsonl"))
print("=== token_count #1 vs #2 in first file (delta or cumulative?) ===")
seen = 0
with open(files[0], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if r.get("payload",{}).get("type")=="token_count":
            u=r["payload"]["info"]["total_token_usage"]
            print("total:",u["total_tokens"],"in:",u["input_tokens"],"out:",u["output_tokens"])
            seen+=1
            if seen>=3: break

print("=== turn_context model changes within one file? ===")
models=set()
with open(files[0], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if r.get("type")=="turn_context":
            models.add(r["payload"].get("model"))
print(models)

print("=== archived_sessions? ===")
print(os.listdir(os.path.expanduser("~/.codex")) )
arch = os.path.expanduser("~/.codex/archived_sessions")
print("archived exists:", os.path.exists(arch))

print("=== session_index entry vs rollout filename link ===")
idx = os.path.expanduser("~/.codex/session_index.jsonl")
ids_rollout = set()
with open(files[0], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if r.get("type")=="session_meta":
            ids_rollout.add(r["payload"].get("session_id")); break
print("rollout session_id:", ids_rollout)
n=0
with open(idx, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        n+=1
        if n<=3: print(line[:300])
print("index lines:", n)

print("=== history.jsonl head ===")
with open(os.path.expanduser("~/.codex/history.jsonl"), encoding="utf-8", errors="replace") as fh:
    for i,line in enumerate(fh):
        if i>=2: break
        print(line[:400])

print("=== web_search_call sample ===")
for f in files[:5]:
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            r=json.loads(line)
            if r.get("payload",{}).get("type")=="web_search_call":
                print(json.dumps(r, ensure_ascii=False)[:500]); print(); break
        else: continue
        break

print("=== session_meta id vs filename uuid ===")
import re
base = os.path.basename(files[0])
print("filename:", base)
