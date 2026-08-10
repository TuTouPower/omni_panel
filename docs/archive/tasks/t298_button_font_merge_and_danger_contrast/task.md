---
tid: "t298"
slug: "button_font_merge_and_danger_contrast"
title: "修复 standard Button 字号被 tailwind-merge 吞 + danger 按钮暗色对比不达标"
status: "done"
branch: "t298_button_font_merge_and_danger_contrast"
worktree: ""
review_level: "full"
diff_anchor: "f777c0f5a6bc66956e106772ce1baefd06197f88"
depends_on: ""
conflicts_with: ""
note: "p115（t283 review Round 2 提示）：base text-body-md 被 twMerge 当颜色吞、standard 字号 fallback 继承值，与已修 sm 同根因（d032）；p116（t283 review Round 2 提示）：danger bg-error(#ff6b6b 暗色) 白字 2.78 < 3.0；合并同组件修复"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

1. Button base 用裸 `text-body-md`，tailwind-merge 误判为颜色类吞掉 `text-[var(--color-on-primary)]`（d032）；standard 档 sizes 无字号类。
2. danger 暗色 `--color-error-dark` = #ff6b6b，白字对比 2.78 < 3.0。

## 方案

1. Button：base 移除 `text-body-md`，sizes.standard 加 `text-[length:var(--text-body-md)]`（sm 档 t283 已改）。字号与文字色类经 twMerge 共存。
2. error-dark 调暗 #ff6b6b → #f0564d（暗色 danger 背景，白字对比 3.42 ≥ 3.0）；暗背景错误文字对比仍 4.85，可读性不受损。改 DESIGN.md（token 源）→ `designmd:export` 重生成 globals.css → `designmd:check` drift 过。

## 顺手发现

ui 组件库多组件（Input/SecretInput/Textarea/Select/ListRow/PanelTitleBar 等）cn() base 内 `text-body-md` + 颜色类并存，同受 d032 影响。非本 task 范围，登记 p126。

## 验证记录

- RED：ui.test.tsx 2 新用例失败（standard 字号 class 缺 + danger 暗色对比 <3.0）。
- GREEN：ui 22 测试全过；designmd:check drift passed；全量 `pnpm test` 2857 passed。
- typecheck：`tsc --noEmit` 0 错误。

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

### Round 1 (2026-08-11 04:15 UTC+8)

| finding_id     | severity | status | rationale                                                      | fix_ref                                       |
| -------------- | -------- | ------ | -------------------------------------------------------------- | --------------------------------------------- |
| t298_code_f001 | minor    | 已修   | p126 措辞修正：ListRow 精确到 subtitle div，补全受影响组件清单 | docs/pending/todo/p126                        |
| t298_test_f001 | minor    | 已修   | Test 1 循环渲染 primary/secondary/danger 三 variant 断言       | tests/unit/renderer/components/ui/ui.test.tsx |
| t298_test_f002 | minor    | 已修   | Test 2 补 danger bg/text 类链断言 + 删死代码                   | tests/unit/renderer/components/ui/ui.test.tsx |

| t000_test_f002 | minor | 遗留 | 一句话 | pNNN |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 由 `ui.test.tsx` standard 字号用例（primary/secondary/danger 三 variant 断言 `text-[length:var(--text-body-md)]` + 文字色共存）；AC-002 由同文件 danger 暗色对比用例（#f0564d 白字对比 3.42 ≥ 3.0）；AC-003 由 `pnpm designmd:check` drift passed + 全量 `pnpm test` 2857 passed

### Reviewer verdict

`full`：

- Round 1 code：PASS（1 minor）
- Round 1 test：PASS（2 minor）
- Round 2 code：PASS（f001 已修）
- Round 2 test：PASS（f001/f002 已修）

### 结果摘要

Button standard 字号改显式 `text-[length:var(--text-body-md)]` 免 twMerge 吞色；error-dark 调暗 #ff6b6b → #f0564d（danger 暗色白字对比 3.42 ≥ 3.0），DESIGN.md 源 + designmd:export 重生成。全量测试 2857 passed + typecheck 绿。
