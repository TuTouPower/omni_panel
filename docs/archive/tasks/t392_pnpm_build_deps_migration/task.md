---
tid: "t392"
slug: "pnpm_build_deps_migration"
title: "pnpm onlyBuiltDependencies 迁移到 pnpm-workspace.yaml"
status: "done"
branch: "t392_pnpm_build_deps_migration"
worktree: ""
review_level: "single"
diff_anchor: "73cc495810a20f24eada26e5012d3093b36fc07f"
depends_on: ""
conflicts_with: ""
note: "来源 p153；工具链配置，single"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-15 05:50 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t392_gen_f001|important|已修|electron@42.2.0 无 postinstall scripts（实测），AC-002 措辞改惰性下载机制 | spec.md:42 |
|t392_gen_f002|important|已修|AC-004 证据重做：fresh 独立 install 验证 better-sqlite3 放行生效 | .scratch/fresh |
|t392_gen_f003|important|已修|证据改 fresh 真实 install（非主仓过期产物） | .scratch/fresh |
|t392_gen_f004|minor|已修|.gitignore node_modules/ 去尾斜杠，软链被忽略 | .gitignore:2 |
|t392_gen_f005|minor|已修|.scratch 冒烟验证清理，结论入 handoff | handoff.json |

### Round 2 (2026-08-15 05:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t392_gen_f006|critical|已修|迁移 workspace.yaml 与 pnpm 9.15.4 半支持 overrides 冲突（frozen-lockfile mismatch）：升级 pnpm 10.34.5（用户拍板豁免非范围） | package.json:128 |
|t392_gen_f007|critical|已修|pnpm 9 no-frozen re-lock 丢锁文件补丁段：pnpm 10 完整支持，补丁保留（hash a644a4ca...） | pnpm-lock.yaml |

### Round 3 (2026-08-15 06:00 UTC+8)

- 复核：code PASS（f006/f007 消除，pnpm 10 frozen install 通过 + 补丁保留；esbuild/unrs-resolver 观察项非回归）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001（WARN 消除 + pnpm 10）、AC-002（electron 惰性下载 [deploy]）、AC-003（better-sqlite3 放行生效）、AC-004（20 electron 测试）均列于 `handoff.json` 的 `ac_evidence`

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL（f001-f005）
- Round 2 general：FAIL（f006/f007 critical）
- Round 3 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- package.json pnpm 字段迁 pnpm-workspace.yaml + 升级 pnpm 10.34.5（用户拍板）；WARN 消除、better-sqlite3 放行、锁文件补丁保留；三轮 review 全消除。
