# Task plan

## 步骤与验证

1. `index.ts` 在 `main_panel_controller` 附近声明 `let agentWin: BrowserWindow | null = null` -> 验证：typecheck。
2. 改 `TOKEN_STATS_OPEN` handler：`if (agentWin && !agentWin.isDestroyed()) { agentWin.show(); agentWin.focus(); } else { agentWin = windowManager.createWindowFor("agent"); agentWin.show(); agentWin.focus(); agentWin.on("closed", () => { agentWin = null; }); }` -> 验证：连续调用只 create 一次。
3. 抽离为小函数 `ensure_agent_window()` 便于测试 -> 验证：单测 mock windowManager，断言多次调用 `createWindowFor` 仅 1 次。
4. `pnpm test` -> 验证：不回归。

## 风险与回退

- 风险：agent 窗口 `showWhenReady: true`（WINDOW_CONFIGS.agent），首次 `createWindowFor` 已绑定 ready-to-show；`show()` 在 ready 前调用可能无效--参考 `main-panel-controller` 用 `open_or_focus` 的 `show+focus`，agent 配置 showWhenReady 会自动在 ready 时 show，显式 show 也兼容。
- 风险：窗口销毁后引用未及时清空--`closed` 事件已绑定清空。
- 回退：恢复每次 `createWindowFor`。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：窗口目录补注 agent 单例。
- `docs/specs/agent_window_singleton.md`：新建累积 spec。
