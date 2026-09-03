"""s034: sample codex rollout JSONL across files: envelope types, payload types,
roles, content types, token-usage location, timestamps, cwd/model fields."""
import json, glob
from collections import Counter

files = sorted(glob.glob("/home/karon/.codex/sessions/2026/09/04/*.jsonl"))
print("files:", len(files))
etype, ptype, roles, ctypes = Counter(), Counter(), Counter(), Counter()
sess_meta_keys, turn_ctx_keys = Counter(), Counter()
usage_hits, ts_missing = 0, 0
cwd_vals, model_vals = Counter(), Counter()
n_lines = n_bad = 0
for f in files[:40]:
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line: continue
            n_lines += 1
            try: rec = json.loads(line)
            except Exception: n_bad += 1; continue
            t = rec.get("type"); etype[t] += 1
            if "timestamp" not in rec: ts_missing += 1
            p = rec.get("payload", {})
            if isinstance(p, dict):
                ptype[(t, p.get("type"))] += 1
                if t == "response_item":
                    roles[p.get("role")] += 1
                    for c in (p.get("content") or []):
                        if isinstance(c, dict): ctypes[c.get("type")] += 1
                if t == "session_meta":
                    for k in p: sess_meta_keys[k] += 1
                    cwd_vals[str(p.get("cwd"))] += 1
                if t == "turn_context":
                    for k in p: turn_ctx_keys[k] += 1
                    if p.get("model"): model_vals[str(p.get("model"))] += 1
            s = json.dumps(rec)
            if "token" in s.lower() and ("usage" in s.lower()): usage_hits += 1
print("lines:", n_lines, "bad:", n_bad, "ts_missing:", ts_missing)
print("envelope types:", dict(etype))
print("payload types:", dict(ptype))
print("response_item roles:", dict(roles))
print("content types:", dict(ctypes))
print("session_meta keys:", dict(sess_meta_keys))
print("turn_context keys:", dict(turn_ctx_keys))
print("cwd sample:", dict(list(cwd_vals.items())[:5]))
print("model sample:", dict(list(model_vals.items())[:10]))
print("token-usage-ish lines:", usage_hits)
