---
tid: "t175"
slug: "connector_ctx_status_migrate"
title: "16 个 connector 删内联 helper 改 ctx.status"
status: "done"
branch: "t175_connector_ctx_status_migrate"
worktree: ""
review_level: "full"
diff_anchor: "8ca0ed3bf4b8395310f379dc449b5563d9e9a54b"
depends_on: ""
conflicts_with: ""
note: "p001"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无（testing.md 声明本仓无独立 doctor_cmd）。
- SPIKE 核实（2026-08-01 逐 connector 对照）：宿主 `src/shared/lib/connector-thresholds.ts` 阈值（pct 90/75、ratio 0.9/0.75、balance 反向 0.1/0.2）与 15 个 connector 内联 helper 函数体完全一致。`limit<=0` 语义差异：宿主统一 unknown，kimi/mimo/tavily 内联 normal（深层 API limit 可能缺失）→ 迁移时调用侧 `limit > 0 ? ctx.status.for_* : "normal"` 保留；glm/minimax 调用侧已有 `total<=0 continue` / `interval_total>0` / `weekly_total>0` guard，直接替换安全。is_record/to_number/parse_limit 为 utility（ctx 未暴露、沙箱禁 import），保留本地副本。3 个 SPIKE 改写为结论，preflight --require-verified PASS。
- 迁移（14 connector 改 + codex 无 status helper 硬编码 unknown + antigravity 无 helper）：claude/cpa→for*pct、deepseek→for_balance、exa/firecrawl→for_ratio、grok→for_pct、getoneapi/tikhub→for_balance、glm→for_ratio+for_pct、minimax/opencode_go→for_ratio/for_pct、kimi→for_pct guard、mimo→for_ratio+for_balance guard、tavily→for_ratio guard。删除 13 个 status_for*_/classify*status 定义，26 处 ctx.status 调用。connectors/ 下无 status_for*_/classify_status 残留。
- 补测：kimi/mimo 各加 limit<=0→normal guard 语义回归（锁定 AC2 limit<=0 分支）；tavily limit<=0 已 throw（既有用例覆盖）。
- 环境：worktree 首次 pnpm install 后 src/generated/build-info.ts 缺失（gitignore 生成文件），mkdir src/generated + `tsx scripts/gen-build-info.ts` 补生成。
- 黑盒（`.scratch/t175/blackbox.sh`）：AC1 无 status*for*\* 定义 PASS + 26 处 ctx.status 调用 PASS；AC2/AC3 由 connector-thresholds.test.ts + 212 connector tests 覆盖。全量 `pnpm test` 185 files / 1962 passed / 1 skipped。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

### Round 1 (2026-08-01 09:40 UTC+8)

| finding_id     | severity | status | rationale                                                                            | fix_ref                                                |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| t175_code_f001 | minor    | 已修   | mimo usage 三元组提取 used/limit 局部变量，消除重复 to_number                        | connectors/mimo/connector.ts:131                       |
| t175_code_f002 | minor    | 已修   | 契约区 AC1 收窄（仅删阈值 helper，utility 保留）用户认可；spec 上下文区 SPIKE 已核实 | spec.md 契约区 AC1                                     |
| t175_test_f001 | minor    | 已修   | kimi guard 测试输入改 used=10/limit=0 提供判别力（无 guard 时 Infinity→critical）    | tests/integration/connector/kimi-connector.test.ts:306 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`connectors/` 下无 `status_for_*/classify_status` 定义残留（grep 确认）；14 connector 删 13 个内联阈值 helper，26 处改调 `ctx.status.for_*`；kimi/mimo/tavily 经 `limit > 0 ? ... : "normal"` 保留 limit<=0→normal。codex 本无 status helper（硬编码 unknown）、antigravity 无 helper 未动。
    - AC2：逐 connector 对照迁移前后阈值语义无漂移（host `connector-thresholds.ts` 与旧内联函数体逐字一致）；kimi/mimo guard 新用例 + tavily throw 用例锁 limit<=0 分支。
    - AC3：`pnpm test` 185 files / 1962 passed / 1 skipped；connector 套件 25 files / 243 passed；`tsc --noEmit`、`eslint connectors/` 通过。
    - 黑盒（`.scratch/t175/blackbox.sh`）：AC1 结构 grep + 26 处 ctx.status 调用 PASS。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（2 minor：f001 已修、f002 用户认可收窄）
- Round 1 test：PASS（1 minor：f001 已修）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

15 connector 内联 status 阈值 helper 迁移至 `ctx.status.for_pct/for_ratio/for_balance`，阈值语义零漂移（含 limit<=0 分支 guard 保留）；p001 闭环。
