# p268 花云快照窗口在 macOS 上无法完全隐藏

- 现象：`src/main/index.ts` 的 `present_for_capture()` 用 `setSkipTaskbar(true)` + `showInactive()` + `setOpacity(0)` 让隐藏窗渲染页面（Cloudflare 质询需要 `document.hidden === false`）。Electron 的 `setSkipTaskbar` 只在 Windows/Linux 生效，macOS 是 no-op，透明窗口仍可能进入 Dock/窗口切换器，定时刷新时用户可能看到幽灵窗口。
- 影响：macOS 上每轮花云刷新（快照新鲜期外）都可能短暂出现一个透明窗口；只影响观感与「抢占注意力」，不影响取数。代码已加 `process.platform !== "darwin"` 守卫避免无意义调用，但 macOS 的替代方案尚未确定。
- 根因：Electron API 平台差异；透明窗口在 macOS 仍参与窗口层级与 Mission Control。未找到等价 Electron API（`setVisibleOnAllWorkspaces`、`app.dock.hide()` 都会影响主窗口）。已扫：`src/main/index.ts` 中 `present_for_capture` / `reveal` 两处，均已在非 darwin 平台才调用 `setSkipTaskbar`。
- 测试缺口：无自动化覆盖——`is_e2e_headless()` 下这两个方法直接 return，Playwright 也观察不到真实窗口层级。需要 macOS 真机手动验证（观察 Dock/切换器/截图），再决定是否改用 `type: "panel"` + 更高窗口层级，或直接复用主窗口分区。
- 线索：无。
- 处理：t535
