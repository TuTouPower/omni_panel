"""s034: drill into user/assistant message bodies, token_count payload, user envelope filtering."""
import json, glob

files = sorted(glob.glob("/home/karon/.codex/sessions/2026/09/04/*.jsonl"))
recs = []
for f in files[:40]:
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line=line.strip()
            if line: recs.append(json.loads(line))

print("=== one user response_item (truncated 800) ===")
for r in recs:
    p = r.get("payload", {})
    if r.get("type")=="response_item" and p.get("type")=="message" and p.get("role")=="user":
        print(json.dumps(r, ensure_ascii=False)[:800]); print(); break

print("=== one assistant response_item (truncated 800) ===")
for r in recs:
    p = r.get("payload", {})
    if r.get("type")=="response_item" and p.get("type")=="message" and p.get("role")=="assistant":
        print(json.dumps(r, ensure_ascii=False)[:800]); print(); break

print("=== one event_msg token_count (full-ish 1200) ===")
for r in recs:
    p = r.get("payload", {})
    if p.get("type")=="token_count":
        print(json.dumps(r, ensure_ascii=False)[:1200]); print(); break

print("=== reasoning / function_call payload types ===")
for r in recs:
    p = r.get("payload", {})
    if r.get("type")=="response_item" and p.get("type") in ("reasoning","function_call"):
        print(p.get("type"), "->", json.dumps(r, ensure_ascii=False)[:300]); break

print("=== user text: envelope markers? ===")
import re
n_env = n_cmd = n_total = 0
for r in recs:
    p = r.get("payload", {})
    if r.get("type")=="response_item" and p.get("type")=="message" and p.get("role")=="user":
        for c in (p.get("content") or []):
            if isinstance(c, dict) and c.get("type")=="input_text":
                n_total += 1
                t = c.get("text","")
                if "<environment_context>" in t or "<skills_instructions>" in t: n_env += 1
                if "<command-name>" in t: n_cmd += 1
print(f"user input_text parts: {n_total}, with env/skills envelope: {n_env}, with <command-name>: {n_cmd}")

print("=== assistant text empty? ===")
n_empty = n_nonempty = 0
for r in recs:
    p = r.get("payload", {})
    if r.get("type")=="response_item" and p.get("type")=="message" and p.get("role")=="assistant":
        txt = "".join(c.get("text","") for c in (p.get("content") or []) if isinstance(c, dict))
        if txt.strip(): n_nonempty += 1
        else: n_empty += 1
print(f"assistant messages nonempty={n_nonempty} empty={n_empty}")

print("=== token_count cumulative? first file ===")
f0 = files[0]; print("file:", f0)
with open(f0, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if r.get("payload",{}).get("type")=="token_count":
            print(json.dumps(r.get("payload"), ensure_ascii=False)[:500])
            break
