---
tid: "t418"
slug: "usage_color_single_source"
title: "用量九色与 accent 预设颜色收口单一来源"
status: "done"
branch: "t418_usage_color_single_source"
worktree: ""
review_level: "single"
diff_anchor: "22d51152b6a411c104c7568c5727e1460305c7dd"
depends_on: ""
conflicts_with: "t420,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无
- 九色：与 RISK_TOKENS 同模式，注入 `var(--color-usage-N)` 而非 getComputedStyle 解析；hex 仅留 globals.css / DESIGN.md
- accent：`theme.ts` 导出 `ACCENT_PRESET_LIST` 派生表；appearance 只引用导出
- about：tint 改 `var(--color-accent-*)`；update 图标 `#fff` → `var(--color-on-primary)`
- 预存 lint 红（session-resume / general_section dynamic-delete）在 base 已存在，本 task 未引入
- review 2 minor 已修：settings mock 改 importOriginal；九色 hex 清零改正则全覆盖

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-16 05:35 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t418_gen_f001|minor|已修|theme mock 改 importOriginal，只覆盖 useTheme/apply_accent|settings_view_general.test.tsx|
|t418_gen_f002|minor|已修|九色清零断言改为 `#[0-9a-fA-F]{6}` 正则全覆盖|usage-colors.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~003 源码 grep + 单测；AC-004 单测观感不回归（deploy 目检留给合并后）；AC-005 全量 3326 passed

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS
- Round 3 general：PASS

### 结果摘要

九色/accent 预设/about tint 收口单一 token 来源；全量单测绿；review Round 3 PASS；finding d044。
