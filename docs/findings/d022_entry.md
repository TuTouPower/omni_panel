# d022 会话窗口应复用全局主题通道（2026-08-07）

- 来源：s016
- 结论：会话窗口的 `history` 路由必须显式调用共享 `useTheme()`；该 hook 通过 `window.usageboard.config.get()` 读取全局主题，订阅 `event.onThemeChange`，首帧由 preload 的 `ou_theme` 参数设置。会话壳不应再维护 `omni_session_theme` 独立存储。
- 证据：检查 `src/renderer/App.tsx` 的 history 路由、`src/renderer/lib/theme.ts`、`src/main/window/window-manager.ts`、`src/preload/index.ts` 与会话测试 mock，确认现有全局通道完整覆盖配置读取、首帧和运行时变更。
- 影响：移除会话窗口独立主题 hook 与顶栏主题按钮时，不需新增 IPC 或主题状态存储。
- 现状：有效
