---
tid: "t177"
slug: "setupfiles_split_renderer"
title: "setupFiles 拆 renderer-only"
status: "done"
branch: "t177_setupfiles_split_renderer"
worktree: ""
review_level: "full"
diff_anchor: "d1bd8940ff6b05e1985e470c3b58396b234a2b4a"
depends_on: ""
conflicts_with: ""
note: "p005"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无（testing.md 声明本仓无独立 doctor_cmd）。
- SPIKE 实验（2026-08-01）：临时 node 配置实跑全部 108 个非 renderer 测试文件（1185 tests）全绿——无测试隐式依赖 jsdom 或 setup.ts mock；grep 确认非 renderer 无 window/document/react。决定：vitest.config.mts 用 `projects` 拆两个项目——renderer（jsdom + setup.ts，含 tests/unit/renderer/**, tests/smoke/**, tests/unit/web/\*\*）与 node（node 环境无 setupFiles，含其余全部）；`globals: true` 须每项目单独声明（root 不继承）。SPIKE 改写为结论，preflight --require-verified PASS。
- 拆分后全量 `pnpm test` 186 files / 1963 passed / 1 skipped（较拆分前 185 files 增 1 个 AC1 回归测试）。
- 补 `tests/unit/main/node_env_isolation.test.ts`：断言 node 项目 `typeof window === "undefined"`，锁定 AC1（拆分回退为全局 jsdom 时该测试失败）。
- 环境：worktree 需 `pnpm install` + `pnpm rebuild better-sqlite3` + `tsx scripts/gen-build-info.ts`（见 findings d006）。

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

### Round 1 (2026-08-01 11:35 UTC+8)

| finding_id     | severity | status | rationale                                                                | fix_ref                                         |
| -------------- | -------- | ------ | ------------------------------------------------------------------------ | ----------------------------------------------- |
| t177_code_f001 | minor    | 已修   | 删 root 死 include（被两项目 include 覆盖，新目录会被静默跳过）          | vitest.config.mts:13                            |
| t177_test_f001 | minor    | 已修   | 补 renderer 项目对称 guard（断言 usageboard/#root 注入），与 node 侧对称 | tests/unit/renderer/setup_env_isolation.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：node 项目 `environment: "node"` 无 setupFiles；`tests/unit/main/node_env_isolation.test.ts` 断言 `typeof window === "undefined"`（旧全局 jsdom 配置下该测试失败）。
    - AC2：renderer 项目 jsdom + setup.ts；`tests/unit/renderer/setup_env_isolation.test.ts` 断言 usageboard/#root 注入；75 个渲染侧文件经 setup.ts 运行。
    - AC3：`pnpm test` 187 files / 1964 passed / 1 skipped（较拆分前 185 files 增 2 个 guard）；全部 187 文件恰好命中一项目 include 无重复/遗漏；`pnpm test:coverage` exit 0。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（1 minor：f001 已修）
- Round 1 test：PASS（1 minor：f001 已修）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

vitest.config.mts 拆 renderer/jsdom + node 双项目，node 测试不再被注入 renderer-only setupFiles；p005 闭环。
