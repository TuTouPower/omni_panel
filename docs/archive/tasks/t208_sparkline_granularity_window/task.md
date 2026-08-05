---
tid: "t208"
slug: "sparkline_granularity_window"
title: "sparkline 改按采集粒度取点并加 1天/7天/30天 窗口选择"
status: "done"
branch: "t208_sparkline_granularity_window"
worktree: ""
review_level: "full"
diff_anchor: "f91a7603684a4c1a66340231e92ca8e3f9cccd76"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 取点策略：`observations.length <= cap`（cap=120）每点独立（不聚合，保留采集粒度）；超过则 cap 桶均分窗口、每桶取 observed_at 最大。窗口选择 1/7/30 天前端 useState，不持久化（session 内）。
- 旧语义废弃：「按 UTC 天分桶、长度=days、null 填充」→ 固定 ≤120 桶、不 null 填充。observation-store.test 删 null fill 用例（注明理由），trend-query-key.test `toHaveLength(7)`→`2`。
- 索引：t214 的 source_instance_id 过滤 + idx_lookup 全覆盖继承，未改索引。
- 窗口选择器：button group（1天/7天/30天），cache_key 含 days，bulk payload periods 各带 days，useEffect deps 加 trend_days。
- build-info.ts 是 generated（gitignore），worktree 手生成。

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

### Round 1 (2026-08-05 12:12 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                             | fix_ref                                                      |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| t208_code_f001 | minor     | 已修   | ≤cap 分支同 ts 去重 `observed_at > prev` 恒 false（Map key=ts），是 dead branch。简化为 Map 后写覆盖（同 ts 保留最后一条），注释订正                  | src/main/core/observation/observation-store.ts:306           |
| t208_code_f002 | minor     | 已修   | 接口签名 `(Observation\|null)[]` 与实际返回 `Observation[]` 失真。改为 `Observation[]`；下游 mock（grok_oauth/refresh-service）与测试 filter 同步对齐 | src/main/core/observation/observation-store.ts:39            |
| t208_test_f001 | important | 已修   | AC4「切回走缓存」未断言。窗口选择器测试补切回 7 天后 getBulk 调用次数不增加（缓存命中）                                                               | tests/unit/renderer/components/provider_account_row.test.tsx |
| t208_test_f002 | minor     | 已修   | 「同桶取最新」用 2 点（走 ≤cap 非聚合分支），没测聚合。改为 121 点触发聚合（>120），断言最末桶保留 observed_at 最大（used=90）                        | tests/integration/observation/trend-granularity.test.ts      |

范围外（code reviewer 提，非 finding）：`TrendApi.get` 注释「返回长度=days、null 填充」过时；observation-store 接口 docstring 与 t208 补充段矛盾；test reviewer 指窗口选择器测试 setTimeout(50) 负向断言有 CI flaky 风险——均登记 pending。

### Round 2 (2026-08-05 12:22 UTC+8)

零 finding（code PASS / test PASS）。Round 1 四条均已修且复核消除（test f001 降 minor，切回缓存断言已加、setTimeout flaky 记 pending）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：trend-granularity.test 覆盖 AC1（48 点>1）/AC3（≤120）；observation-store.test 同桶取最新（AC 间接）；provider_account_row.test 窗口选择器切换 days + 切回缓存命中（AC2/AC4）。`pnpm test` 210 文件 2194 passed，typecheck/lint 绿。

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
