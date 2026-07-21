---
tid: t039
slug: grok_empty_observation_failure
diff_anchor: "ad3048a"
branch: t039_grok_empty_observation_failure
---

# Task t039_grok_empty_observation_failure

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 诊断来源：`docs/bugs.md`「Grok 采集正常但主面板显示暂无账号」。
- 根因已确认（diagnosing-bugs Phase 1-3，真实打包实例 + 日志）：
    - 上游 `GET /v1/billing` → 200 body=413 字节，解析得 0 有效字段 → connector 返回空 observations、未 report_failed_account。
    - `refresh-service` 把零观测成功返回写成 `ready + items:[]`，runtime-store 清空，主面板无 MetricRecord。
- Phase 1 反馈环（真实 local-api :17863）稳定复现两次：`{"enabled":true,"status":"ready","items":0,"error":null}` → throw。
- 日志关键行：trace `refresh-mruvrlja-4xsmfo`：`0 valid observations (from 0 raw)` → `refreshed: 0 items`；对照 trace `refresh-mrulikm1` 有数据时 `3 items`。
- Phase 3 排除：UI 聚合非根因（snapshot items 本就 0）；observation 映射非根因（原始观测为 0）；401/token 失效非此路径。
- 开干时填 `diff_anchor`。

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 (2026-07-22 01:45 UTC+8)

code=FAIL（2 finding），test=PASS（0 finding）。

| finding_id     | severity | status | rationale                                                                                                                                                                                                                                    | fix_ref                                                                                                 |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| t039_code_f001 | critical | 已修   | 分支条件 `items.length===0 && failed_accounts.length===0` 漏盖生产契约（Grok `return [] + report_failed_account`，failed 非空不触发，仍写 ready+空）。改 `items.length===0`，failed 时 error 取 failed_accounts[0].error；补生产契约形状测试 | `src/main/core/scheduler/refresh-service.ts:307`、`tests/integration/scheduler/refresh-service.test.ts` |
| t039_code_f002 | minor    | 遗留   | `refresh-service.ts` 445 行超 400 阈值；本 task 净增 27 行，文件本已偏大，拆分属独立重构，不绑本 task                                                                                                                                        | `src/main/core/scheduler/refresh-service.ts`                                                            |

### Round 2 (2026-07-22 02:10 UTC+8)

code=PASS（f001 已修确认，0 新发现），test=PASS（0 新发现）。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t039` 查。

### 验收标准勾选

- [x] Grok billing 200 但零有效指标时 connector 上报 failed_account（单测：`grok_connector.test.ts` "no usable usage fields"）
- [x] refresh-service 零观测不得写 ready+空 items 清空历史（单测：`refresh-service.test.ts` "zero observations and zero failures" + "marks failed ... empty with no history"）
- [x] 设置页该场景不再显示"采集正常"（零字段路径走 failed/stale，非 ready；自动化覆盖，真实上游本次返回有效数据未触发空路径）
- [x] `pnpm test` 全绿（1435 passed）；`pnpm typecheck` / `pnpm lint` / `pnpm format:check` 过
- [x] 真实打包启动验证：`pnpm package` exit 0，exe 启动、local-api health ok、Grok 正常采集 ready+3 items（正常路径无回归）；零字段失败路径由自动化测试覆盖（真实上游本次未返回空，packaged 行为"零字段路径未在真实上游触发，自动化已覆盖"）

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- `t039_code_f002`（minor）：`refresh-service.ts` 445 行超 400 阈值；拆分属独立重构，不绑本 task。

### 结果摘要

Grok 零有效字段时 connector `report_failed_account` + refresh-service 零观测不写 ready+空（有历史保留、无历史标 failed），修 domain 不变量 2 违反与主面板"暂无账号"。

- 见上
