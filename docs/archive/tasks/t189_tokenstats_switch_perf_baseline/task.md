---
tid: "t189"
slug: "tokenstats_switch_perf_baseline"
title: "P0 代理面板切换性能基线与查询诊断"
status: "done"
branch: "t189_tokenstats_switch_perf_baseline"
worktree: ""
review_level: "single"
diff_anchor: "f2f372a77e51c4df02e8029e0b3db1f45ab5b9d9"
depends_on: ""
conflicts_with: ""
note: "P0"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

- Step 1：完成序列化边界 spike。采用离线 UTF-8 JSON 字节计数作为稳定 payload 代理，不修改 Electron IPC；真实 IPC 延迟留给 packaged smoke。
- 新增 `scripts/token-stats-baseline.ts`：使用固定 seed 和临时 SQLite，默认生成 600,000 条脱敏合成 records，覆盖 24h/7d/30d × agent/platform 组合，输出查询耗时、行数、序列化字节、renderer 转换耗时与总耗时。
- 新增 node 测试覆盖确定性、600,000 条规模、36 个组合、报告字段与脱敏输出；实际生成 600,000 条报告成功，36 个场景完成。
- 实测最慢场景为 24h/all/all，查询结果规模和 rollup 查询耗时成为后续 dashboard 优化基线；未将绝对耗时写成 CI 门禁。

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

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-02 15:33 UTC+8)

| finding_id    | severity  | status | rationale                                                                       | fix_ref                                                             |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| t189_gen_f001 | important | 已修   | 补写 derived sessions/daily 数据，覆盖 buckets、sessions 与 renderer 查询路径。 | scripts/token-stats-baseline.ts:115-190                             |
| t189_gen_f002 | important | 已修   | 强化测试，精确校验查询集合、非空结果和阶段统计字段。                            | tests/unit/main/core/token-stats/token_stats_baseline.test.ts:22-66 |

### Round 2 (2026-08-02 15:40 UTC+8)

| finding_id    | severity  | status | rationale                                                                   | fix_ref                                                             |
| ------------- | --------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| t189_gen_f003 | important | 已修   | 增加 36 个 `(range, agent, platform)` 组合唯一性与完整 Cartesian Set 校验。 | tests/unit/main/core/token-stats/token_stats_baseline.test.ts:26-40 |

### Round 3 (2026-08-02 15:54 UTC+8)

- 前轮 finding 全部已修；无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：targeted 单测 3 passed；全量测试 196 files passed、1998 passed、1 skipped；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；600,000 条黑盒生成 36 个场景，组合唯一完整，查询与 renderer 输出非空；t189 相关文件 Prettier 检查通过。
- 全量 `pnpm format:check` 仍受既有 `tests/e2e/fixtures/mock_server.mjs` 格式问题阻断；该文件未被本 task 修改。

### Reviewer verdict

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：PASS

### 结果摘要

完成代理面板切换性能基线：固定 seed 生成 600,000 条脱敏 records，覆盖 36 个筛选组合，记录 SQLite 查询、payload、renderer 转换与总耗时指标。
