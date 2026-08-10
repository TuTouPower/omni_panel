---
tid: "t297"
slug: "markdown_link_scheme_allowlist"
title: "MarkdownMessage 链接 scheme 白名单 + 面板 will-navigate 守卫"
status: "done"
branch: "t297_markdown_link_scheme_allowlist"
worktree: ""
review_level: "full"
diff_anchor: "3c7707ba7f885ed9be6d5e215966e7e7b71acb58"
depends_on: ""
conflicts_with: ""
note: "Grok Issue 6：会话历史 markdown 渲染 a href 无 scheme 白名单/rel 加固，内容不可信；panel 窗口无 will-navigate 守卫；仅允许 http/https"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

`MarkdownMessage` 的 `a` renderer 直接 `<a href={href}>`，无 scheme 白名单、无 rel/target。消息内容不可信（user/agent 日志），`javascript:`/`file:` 链接可导航会话历史窗口 webContents（面板窗口仅 `setWindowOpenHandler` 管新窗口，无 `will-navigate` 守卫）。

## 方案

两层防护：

1. **渲染层**：`a` renderer 解析 href，仅 `http:`/`https:` 渲染为 `<a target="_blank" rel="noopener noreferrer">`，其余（含 javascript:/file:/未知 scheme）渲染为纯文本。
2. **主进程**：`createWindowFor` 加 `will-navigate` 守卫，非 http(s) 导航 `event.preventDefault()`，兜底同窗口导航；`loadURL`（file:// 渲染入口）不触发 will-navigate，不受影响。

## 验证记录

- RED：4 渲染用例失败（javascript:/file:/未知 scheme 仍渲染 `<a>`）；window-manager mock 缺 `on` 捕获 will-navigate。
- GREEN：MarkdownMessage 5 测试 + window_manager 9 测试全过。
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

### Round 1 (2026-08-11 03:50 UTC+8)

| finding_id     | severity  | status | rationale                                                                   | fix_ref                                                           |
| -------------- | --------- | ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| t297_code_f001 | important | 已修   | will-navigate 拦生产 file:// reload，守卫放行 file:（渲染入口 reload 场景） | src/main/window/window-manager.ts                                 |
| t297_code_f002 | minor     | 已修   | 补 file:// reload 放行 + data: 拦截用例                                     | tests/unit/main/window_manager.test.ts                            |
| t297_test_f001 | minor     | 已修   | 补 http 链接渲染用例，覆盖 AC-001 两 scheme                                 | tests/unit/renderer/components/workspace/MarkdownMessage.test.tsx |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 由 `MarkdownMessage.test.tsx` http/https/javascript:/file:/未知 scheme 5 用例；AC-002 由 https/http 用例断言 rel="noopener noreferrer" + target="\_blank"；AC-003 由 `window_manager.test.ts` will-navigate 用例（javascript:/data: 拦、http(s)/file:// 放行）

### Reviewer verdict

`full`：

- Round 1 code：FAIL（1 important f001）
- Round 1 test：PASS（1 minor）
- Round 2 code：PASS（f001 已修，真实 Electron 实测 reload 恢复）
- Round 2 test：PASS

### 结果摘要

MarkdownMessage 链接仅 http(s) 渲染为 `<a target="_blank" rel="noopener noreferrer">`，其余 scheme 纯文本；面板 `will-navigate` 守卫拦非 http(s)/file: 导航（file: 放行保 reload）。全量测试 2854 passed + typecheck 绿。
