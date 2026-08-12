---
tid: "t305"
slug: "provider_tab_active_state"
title: "概览/N账号 tab 选中态修复（l2Open 双高亮）"
status: "done"
branch: "t305_provider_tab_active_state"
worktree: ""
review_level: "single"
diff_anchor: "507fcedb9659cc0b29dc1610f5650374da549179"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 复现定位：`ProviderCard.tsx` 两个分段 tab 按钮 className 均只依赖 `l2Open` 单一布尔，选中态不互斥（l2Open=true 双高亮、false 双透明），与 p134 一致。
- 修复：概览 tab 高亮条件改为 `!l2Open`，账号明细 tab 保持 `l2Open`，两分支互斥；onClick 切换逻辑与 l2Open 语义未动。
- 测试：`provider_card_overview.test.tsx` 新增 2 条用例，在 l2Open 两态下断言激活 tab 类含 `bg-[var(--color-surface-window)]`+`text-[var(--color-accent)]`、非激活 tab 含 `bg-transparent`。
- 环境：worktree 首次安装缺 electron 二进制（pnpm 忽略 build scripts），手动复制主仓 `node_modules/electron/dist` + `path.txt` 补齐；`src/generated/build-info.ts` 由 `pnpm exec tsx scripts/gen-build-info.ts` 生成（gitignore 产物）。
- 验证：单文件 12/12 通过；全量 `pnpm test` 2861 passed / 1 failed / 9 skipped，唯一失败为 `designmd.test.ts` drift 门禁——主仓同基线复现（diff 0 行），属存量漂移，登记 p142。typecheck、lint 通过。
- 顺手发现：designmd drift 门禁存量失败（globals.css 导出区 vs DESIGN.md 漂移），登记 p142。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/AC-002 由新增两态选中态单测覆盖（`provider_card_overview.test.tsx`）；AC-003 全量 `pnpm test` 通过（除存量 designmd drift 失败，登记 p142）。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- ProviderCard 概览/N账号 tab 选中态互斥修复完成，2 条新单测覆盖两态，review 零 finding。登记 p142（designmd drift 存量失败）。
