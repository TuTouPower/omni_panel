# Spike report

## 问题

确认会话窗口是否已有可复用的全局主题通道，以及移除会话窗口独立主题后应接入的位置。

## 成功判据

- 找到主面板设置保存的全局主题读取路径。
- 找到会话窗口 renderer 可复用的主题 hook 或事件订阅路径。
- 确认窗口创建时的首帧主题与运行时主题变更通道。

## 尝试

- 检查 `src/renderer/lib/theme.ts`、`src/renderer/App.tsx`、`src/renderer/components/session-shell/SessionShell.tsx` 和 `src/renderer/lib/session-shell/theme.ts`。
- 检查 `src/main/window/window-manager.ts` 的 renderer URL 参数和 `src/preload/index.ts` 的首帧主题处理。
- 检查会话壳测试 mock 是否已经提供 `config.get` 与 `event.onThemeChange`。

## 证据

- `src/renderer/lib/theme.ts` 通过 `window.usageboard.config.get()` 读取 `config.theme`，处理 `system` 模式，并订阅 `window.usageboard.event.onThemeChange` 更新 `html[data-theme]`。
- `src/renderer/App.tsx` 的 `history` 路由直接渲染 `SessionShell`，因此会话壳需要显式调用该全局 hook；其他 renderer 路由已在各自根视图调用 `useTheme()`。
- `src/main/window/window-manager.ts` 从 Electron `nativeTheme.shouldUseDarkColors` 生成 `ou_theme` URL 参数；`src/preload/index.ts` 在首帧设置 `data-theme`，全局 hook 随后用配置和事件保持一致。
- `SessionShell` 当前调用 `useSessionShellTheme()`，从 `omni_session_theme` 读取并写回独立主题；该路径正是需要移除的旧实现。
- `tests/unit/renderer/views/session_history_test_utils.ts` 已提供全局配置与主题事件 mock，可直接覆盖新路径。

## 结论

会话窗口应移除 `useSessionShellTheme`，改为调用共享的 `useTheme()`。首帧继续由 preload 的 `ou_theme` 参数处理，挂载后由全局 `config.get` 与 `onThemeChange` 负责配置读取和运行时同步。该路径无需新增 IPC 或独立存储。

## 是否采纳

- 决定：是
- 理由：复用现有全局主题实现，删除重复的会话窗口独立主题状态与存储。
- 后续 task：t245
