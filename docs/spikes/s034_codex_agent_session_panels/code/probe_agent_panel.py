"""s034: 代理面板(codex用量采集)现状核查: codex connector聚合逻辑 vs token-stats四端reader模型差异."""
import json, glob
from collections import Counter, defaultdict

# 1) codex connector现状: 按(model, day)聚合total_tokens差分 — 与四端token-stats模型对比
files = sorted(glob.glob("/home/testuser/.codex/sessions/2026/09/04/*.jsonl"))
day_model = defaultdict(int)
per_file_last_total = {}
for f in files[:40]:
    prev = None
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            r=json.loads(line)
            if r.get("payload",{}).get("type")=="token_count":
                u=r["payload"]["info"]["total_token_usage"]
                tot=u["total_tokens"]
                delta = tot if prev is None else max(tot-prev,0)
                prev = tot
                day = r.get("timestamp","")[:10]
                day_model[day]+=delta
    per_file_last_total[f]=prev
print("per-day totals:", dict(day_model))
print("files with no token_count:", sum(1 for v in per_file_last_total.values() if v is None))

# 2) 按文件(会话)归因是否可行: session_meta session_id + cwd + 首条user = 会话面板/代理面板会话行所需字段
print("=== session row fields available? ===")
with open(files[0], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if r.get("type")=="session_meta":
            p=r["payload"]
            print("session_id:",p.get("session_id"),"| cwd:",p.get("cwd"),"| cli:",p.get("cli_version"),"| model_provider:",p.get("model_provider"))
            break
# 首条user文本
with open(files[0], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        p=r.get("payload",{})
        if r.get("type")=="response_item" and p.get("type")=="message" and p.get("role")=="user":
            t=(p.get("content") or [{}])[0].get("text","")[:80]
            print("first user text:",repr(t))
            break

# 3) reasoning_output_tokens占比 (代理面板calls/tokens口径参考)
tot_in=tot_out=tot_reas=0
for f in files[:40]:
    prev=None
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            r=json.loads(line)
            if r.get("payload",{}).get("type")=="token_count":
                u=r["payload"]["info"]["total_token_usage"]
                if prev is None:
                    tot_in+=u["input_tokens"]; tot_out+=u["output_tokens"]; tot_reas+=u.get("reasoning_output_tokens",0)
                else:
                    tot_in+=max(u["input_tokens"]-prev[0],0); tot_out+=max(u["output_tokens"]-prev[1],0); tot_reas+=max(u.get("reasoning_output_tokens",0)-prev[2],0)
                prev=(u["input_tokens"],u["output_tokens"],u.get("reasoning_output_tokens",0))
print(f"delta sums: in={tot_in} out={tot_out} reasoning={tot_reas} total={tot_in+tot_out}")
