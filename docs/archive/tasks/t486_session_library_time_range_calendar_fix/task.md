---
tid: "t486"
slug: "session_library_time_range_calendar_fix"
title: "会话面板时间筛选器日历弹层交互修复"
status: "done"
branch: "t486_session_library_time_range_calendar_fix"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "74e51421e576c36e3923d2c3a3e4e80d3a980204"
depends_on: ""
conflicts_with: ""
note: "来源 p230：TimeRangeFilter 补传 zoneRef 并阻断冒泡，解决日历弹层闪退"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 在 `tests/unit/renderer/components/session_library/TimeRangeFilter.test.tsx` 增加组件交互单元测试，覆盖 AC-001 ~ AC-004 以及二次点击日历按钮关闭的场景。
2. 在 `src/renderer/components/session-library/TimeRangeFilter.tsx` 引入 `useRef` 声明 `zoneRef`，挂载在预设模式与自定义胶囊模式的外层容器，并传递给 `RangePicker` 的 `zoneRef` 属性，且为外层容器补充 `relative` 定位。
3. 运行单元测试（5/5 PASS）、关联组件单测（93/93 PASS）、`pnpm typecheck`（0 错误）与 `pnpm lint`（0 警告）全部通过。

## Review 处置

Round 1 零 finding

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`vitest run tests/unit/renderer/components/session_library/TimeRangeFilter.test.tsx` (5/5 PASS)
- 黑盒：组件单元测试交互覆盖
- review：Round 1 general PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复了会话库时间筛选器点击日历图标时因未传递 `zoneRef` 导致原生冒泡误关闭弹层的问题，并补齐了组件交互单元测试。
