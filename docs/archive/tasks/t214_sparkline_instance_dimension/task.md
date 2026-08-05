---
tid: "t214"
slug: "sparkline_instance_dimension"
title: "修复 sparkline 查询缺 source_instance_id 维度致多账号串接"
status: "done"
branch: "t214_sparkline_instance_dimension"
worktree: ""
review_level: "full"
diff_anchor: "0ddc79d808f4f89548387cd62e9dc6164416a479"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE 核实：account card 恒单 source_instance（accountKey = sourceInstanceId|accountId，gateway = sourceInstanceId|label|accountLabel），bulk 顶层单一 source_instance_id 安全。
- 索引发现：SQL 加 source_instance_id 后 planner 改用 idx_lookup（provider, account_id, metric_id, source_instance_id, observed_at）全覆盖，idx_trend 对本查询冗余但保留（删属 schema 变更，超范围）。EXPLAIN 测试从「必走 idx_trend」放宽为「走 idx_trend|idx_lookup、禁全表」。
- 改动链：store 签名+SQL → IPC trend:get/getBulk → preload → local-api /v1/trend → web get/getBulk → 前端 ProviderAccountRow。test 5 处签名对齐 + 2 处端点/URL 新测试。
- 误写主仓：红测试初写误落主仓 tests/（应写 worktree），mv 到 worktree 并确认主仓干净；build-info.ts 是 generated（gitignore），worktree 手生成。

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

### Round 1 (2026-08-05 11:40 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                                                       | fix_ref                                                                           |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| t214_code_f001 | minor     | 已修   | 注释「范围扫描后 filter」与实际 planner 走 idx_lookup 全覆盖矛盾；schema 处旧注释「idx_lookup 无法覆盖」随 source_instance_id 加入已失效。改 observation-store 接口与 schema 注释反映 idx_lookup 全覆盖、idx_trend 对本查询冗余 | src/main/core/observation/observation-store.ts:16,62                              |
| t214_test_f001 | important | 已修   | AC3 web `/v1/trend` 与 getBulk 透传零测试。补 local-api server.test 端点测试（400 缺 sourceInstanceId + 200 按 percent 隔离）+ web usageboard-web.test get/getBulk URL 含 sourceInstanceId 断言                                 | tests/integration/local-api/server.test.ts、tests/unit/web/usageboard-web.test.ts |

### Round 2 (2026-08-05 11:48 UTC+8)

零 finding（code PASS / test PASS），未进处置表。Round 1 两条均已修且复核消除。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：`trend-instance-isolation.test.ts` 双实例 store 层隔离（AC1/AC4）；local-api `/v1/trend` 端点 400+200 按 percent 隔离 + web bridge URL 含 sourceInstanceId（AC3）；前端 bulk payload 含 source_instance_id（AC2）；EXPLAIN 走覆盖索引。`pnpm test` 209 文件 2190 passed，typecheck/lint 绿。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 见上
