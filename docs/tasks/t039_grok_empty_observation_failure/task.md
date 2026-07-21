---
tid: t039
slug: grok_empty_observation_failure
diff_anchor: "<SHA>"
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

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t039` 查。

### 验收标准勾选

- [ ] Grok billing 200 但零有效指标时 connector 上报 failed_account（单测）
- [ ] refresh-service 对"零观测零失败"不得写 ready+空 items 清空历史（单测）
- [ ] 设置页该场景不再显示"采集正常"
- [ ] `pnpm test` 全绿；`pnpm typecheck` 过
- [ ] 真实打包启动验证：Grok 场景主面板显示失败状态而非"暂无账号"

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 见上
