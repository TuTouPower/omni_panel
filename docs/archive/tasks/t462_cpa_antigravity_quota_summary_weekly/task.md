---
tid: "t462"
slug: "cpa_antigravity_quota_summary_weekly"
title: "CPA Antigravity 改走 quota-summary：gemini/claude 五小时加周用量，去 GPT，全新 id"
status: "done"
branch: "t462_cpa_antigravity_quota_summary_weekly"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "7a5619cc6b65e185469114995ba9dab5e1af4495"
depends_on: ""
conflicts_with: ""
note: "参考 CPA-Manager-Plus antigravity 用量查询；quota-summary 主路径加 fetchAvailableModels 回退；gemini/claude 各 5h+weekly 共 4 条观测；去 GPT；全新 metric_id 不兼容旧数据"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 红：旧“两条 five-hour 观测”用例整体删除（语义变更，见测试内 t462 注）；新增 summary 主路径 4 条、回退共享组、缺字段跳过三组用例，初跑 3 红 14 绿。
- 实现：`connectors/cpa/connector.ts` antigravity 改 summary 三 endpoint 主路径（`{project}` 请求体＋`antigravity/cli` UA）＋模型列表回退；`groups` 形态走 summary 解析、`models` 形态走共享组；OPENAI 系匹配与 GPT 分组删除，Claude 组仅 anthropic；缺 `remainingFraction` 的 bucket 跳过、回退模型缺字段有 `resetTime` 按耗尽、无则跳过；未知窗口以无周期观测保留（不丢数据）。
- 回退 id 取 `{family}_shared`＋`window: second`＋`cycleDurationMs: null`（不用 5h 周期，避免错误 upcoming-reset）。
- 绿：cpa-connector 17/17；`tsc`、`eslint`、`prettier`（写后重验）、`git diff --check` 干净。
- 全量 `pnpm test`：worktree 初装缺 electron 二进制致 17 文件 collection 失败（环境问题），按 testing.md worktree 条从主仓复制同版本（42.2.0）`dist`＋`path.txt` 后 285 文件通过；中途出现 1 单用例瞬时失败（未定位），连续两次全量重跑全绿（286 文件/3553 用例），记 flaky 未深究。
- 黑盒：按 testing.md 默认层 `pnpm test`（API 型 task；live 上游需凭据未跑 `test:contract:live`）；web e2e 未跑（仅改一行注释，fixture 为静态 mock 未动）。
- 文档：`docs/specs/connector-cpa-runtime.md` 新增 Antigravity 用量（t462）小节；`multi_account.spec.ts` 注释同步新分组；`connector-direct.md` 无 CPA 分组描述，无需动。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

Round 1 零 finding，未进处置表（`review_general.md` verdict: PASS，critical 0 / important 0 / minor 0）。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：cpa-connector 17/17；全量 `pnpm test` 286 文件/3553 用例绿（含一次瞬时单用例失败，重跑两次全绿，记 flaky）；`tsc`、`eslint`、`prettier`、`git diff --check` 干净；`pnpm check` 全绿
- 黑盒：按 testing.md 默认层 `pnpm test`（API 型 task；`test:contract:live` 需真实凭据未跑；web e2e 未跑，仅改一行注释）
- review：single Round 1 general PASS（零 finding）
- AC 证据：见 `handoff.json`

### 结果摘要

- CPA antigravity 改走 quota-summary：gemini/claude 各五小时加周用量共 4 条观测，全新 id，去 GPT；无数据回退模型列表；遗留无
