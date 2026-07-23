---
tid: t057
slug: connector_stable_account_id
diff_anchor: "416e789d58daa11382f6a5e99a864fd38675baee"
branch: t057_connector_stable_account_id
---

# Task t057_connector_stable_account_id

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 评估 P2 collapse 前提：核实 `observation-store.ts` insert（line 135）+ get_latest（line 151,223）key = `(provider, account_id, metric_id, source_instance_id)`，含 source_instance_id。
- 同 provider 多 API key 实例 = 不同 source_instance_id（host-authority），store 不 collapse；UI 多实例 separate（provider-usage.test:956 firecrawl 2 实例验证）。
- 结论：**review P2 collapse 前提不成立**--account_id 固定 + source_instance_id 区分，功能正常。本 task 无 bug 可修，收尾为评估型（同 t054）。

## Review 处置

未改代码/测试（评估型，review 前提不成立），按 Step 6「否->改必要文档后直接收尾」，不走双审。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t057` 查，不在此记。

### 验收标准勾选

- [x] 核实 store key 含 source_instance_id（observation-store.ts:135,151,223）。
- [x] 同 provider 多 API key 实例不 collapse（source_instance_id 区分）。
- [x] UI 多实例 separate（provider-usage.test:956 firecrawl 2 实例验证）。
- [x] 结论：review P2 前提不成立，无代码改动。

### Reviewer verdict

- 未走双审（评估型，review 前提不成立）。

### 遗留

- 无（t049 exa 用 API_KEY_ID、t051 tikhub 用 email，已主动用稳定远端 id；其余连接器 account_id 固定 + source_instance_id 区分足够）。

### 结果摘要

- P2 评估完成：store key 含 source_instance_id，多实例不 collapse，review 前提不成立，无改动。
