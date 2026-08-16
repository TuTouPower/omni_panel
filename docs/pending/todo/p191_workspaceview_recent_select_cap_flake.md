# p191 WorkspaceView 最近会话选满 8 上限用例偶发失败

- 现象：`WorkspaceView.test.tsx`「recent：选择第 9 个被拒（上限 8）」偶发 `querySelectorAll('[data-testid="session-recent…')` 计数 0（期望 8）；单测重跑即过。
- 影响：全量 `pnpm test` 偶红；与 t423 Card/StatusDot 改动无关（未触 workspace）。
- 根因：疑似异步渲染 / 事件批处理竞态，尚未定位。
- 测试缺口：用例依赖同步 fireEvent 后 DOM 立即就绪，缺 waitFor / findBy 稳定化。
- 线索：t423 全量首跑 FAIL、同进程单测重跑 PASS；路径 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:573`。
- 处理：未开
