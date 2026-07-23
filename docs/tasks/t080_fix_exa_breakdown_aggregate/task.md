---
tid: t080
slug: fix_exa_breakdown_aggregate
diff_anchor: "<SHA>"
branch: t080_fix_exa_breakdown_aggregate
---

# Task t080_fix_exa_breakdown_aggregate

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户反馈 exa 用量面板显示乱七八糟；提供线上真实返回 `exa-api-response.json`：cost_breakdown 7 项仅 3 个 price_name（同名多 price_id），逐项发行导致面板重名行堆叠。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t080` 查，不在此记。

### 验收标准勾选

- [ ] 真实形态输入聚合为每类一行：Search $0.231 / Contents endpoint $0.004 / Answer $0.010（数额对得上 `exa-api-response.json`），total 行 $0.245 不变。
- [ ] 聚合各类之和 = `total_cost_usd`（舍入误差内），测试显式断言。
- [ ] 聚合后 `metric_id` 稳定（同 price_name 多次请求产出同 id），测试断言无 price_id 混入。
- [ ] fixture 已脱敏并移入测试目录；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
