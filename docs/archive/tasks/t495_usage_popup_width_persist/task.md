---
tid: "t495"
slug: "usage_popup_width_persist"
title: "用量面板（popup）宽度持久化：用户拉伸后记住宽度"
status: "done"
branch: "t495_usage_popup_width_persist"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "e9d3356d1bc953fe1e04399e52b1ac765a0eb649"
depends_on: ""
conflicts_with: ""
note: "来源：用户实测用量面板拉伸后不被记住（popup 模式从未持久化宽度）; 与 t493/t494 文件不重叠，可并行"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 在 `AppConfiguration` 与 Zod schema 中新增可选字段 `usagePopupWidth`（正整数）。
- 在 `main-panel-controller.ts` 中为 popup 模式注册 `resize` 事件监听器，通过 `save_popup_width` 将用户拉伸宽度持久化，并做 `[USAGE_MIN_WIDTH, display.workArea.width]` 范围钳制。
- 在 `position_popup` 与 `create_panel_window` 中优先读取并钳制 `usagePopupWidth`，无配置时回退默认宽度（482）。在 `position_popup` 内部设置 bounds 时同步抑制，防止程序化定位误触发保存。
- 门禁全通：typecheck、lint、format:check、designmd:check、pnpm test（3832 passed）。更新 `docs/specs/window-management.md` 规范。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-17 08:54 UTC+8)

Round 1 零 finding

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` (3832 passed, 9 skipped)；`pnpm run typecheck` / `lint` / `format:check` / `designmd:check` 全部通过。
- 黑盒：不涉及外部 CLI / 黑盒脚本；各 AC 均有严格单元测试覆盖。
- review：Round 1 零 finding PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 完成用量面板（popup 模式）宽度持久化：用户调整宽度后保存至配置 `usagePopupWidth`；应用重启或隐藏重开时恢复并双向 clamp 到 `[USAGE_MIN_WIDTH, display.workArea.width]`。缺键时安全回退默认 482 宽度；托盘锚定与动态高度控制器不受影响。
