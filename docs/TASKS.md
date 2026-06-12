# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

## 待办（测试盲区审查 — 2026-06-12）

> 10 子代理并行审查 76 个测试文件，发现以下测试通过但生产可能失败的问题。

### 高危（生产可能崩溃/数据丢失）

- [ ] **CpaConnectorSettings 测试无 `window.usageboard` mock**：子组件在真实 renderer 访问 `window.usageboard.log` 会抛 TypeError。`tests/unit/renderer/components/cpa_connector_settings.test.tsx`
- [ ] **TrayMenu 测试 mock 含 `auth`，真实 tray preload 不暴露**：调用即 crash。`tests/unit/renderer/views/tray_menu.test.tsx:65`，`src/preload/index.ts:226-239`
- [x] **4 个 `ipcMain.handle` 无 `assert_valid_sender`**：已修复，plugin-ipc 4 个 handler + event-ipc THEME_SET 全部加 assert_valid_sender。
- [x] **`minimalEnv` 未设 `NODE_ENV`**：已修复，runner.ts minimalEnv 加 `NODE_ENV: "production"`。
- [x] **加密后端 mock 用 base64 替代真实加密**：已加 encrypt failure 覆盖测试。
- [x] **`UsageItem.used` schema 允许 null，UI `.toFixed()` 会崩溃**：已加 null used 渲染测试，生产代码已有防护。
- [x] **文件 log transport 从未测试**：已加 createFileTransport 格式化和异常测试。
- [x] **`configure_esbuild_binary_path()` 从未测试**：已导出函数，加 3 个 app.asar 路径解析测试。
- [x] **icon 测试只检查 `<img src>` 属性含字符串，不验证图片实际加载**：MiMo logo 已修复为橙底白字，深色模式可见。
- [x] **`compiler.ts` 空文件被当有效 stale cache**：已修复，加 `.trim()` 检查。
- [x] **worker_threads 无限挂起**：已加 force deadline 定时器，SIGKILL 后仍不退出则强制 reject。

### 中危（行为差异/竞态/平台）

- [ ] **`use_config` 被整体 mock，真实 hook 的串行化队列和生命周期不可见**。`tests/unit/renderer/views/settings_view.test.tsx:41`
- [ ] **`Tray.getBounds()` Windows 返回零坐标**，弹出窗口定位到 (0,0)。`tests/unit/main/main_panel_controller.test.ts:102`
- [ ] **`queueMicrotask` vs `setImmediate` 时序差异掩盖竞态**。`tests/unit/main/popup_suppress_move.test.ts:42`
- [ ] **Windows 无 Unix 信号**：SIGTERM→SIGKILL 升级在 Windows 调用 `TerminateProcess`，行为完全不同。`tests/integration/plugin/runner.test.ts:137`
- [ ] **`userData` 路径含 Unicode/空格**：未正确引用的命令行参数会解析失败。`tests/unit/paths.test.ts`
- [ ] **`echo` 在 Windows 不是独立 exe**：跨平台 spawn 行为不同。`tests/unit/smoke.test.ts:18`
- [ ] **esbuild 编译 vs 打包 ASAR 执行路径完全不同**。`tests/integration/plugin/_helpers/plugin_test_harness.ts:52-81`
- [ ] **plugin-ipc sender 校验未测试**：`log-ipc.test.ts` 仅 2 个测试，都不调用 `assert_valid_sender`。`tests/unit/ipc/log-ipc.test.ts`

### 低危

- [ ] **button 测试不验证 CSS 类名**：Tailwind purge 可能删除变体样式。`tests/unit/renderer/components/button.test.tsx:14-23`
- [ ] **usage_rows 硬编码 clipPath 值**：成为假通过。`tests/unit/renderer/components/usage_rows.test.tsx:46`
- [ ] **provider_account_row 只断言负面**（无 alert class），CSS 变化检测不到。`tests/unit/renderer/components/provider_account_row.test.tsx:143-168`
- [ ] **refresh-service 不测试失败后恢复**。`tests/integration/scheduler/refresh-service.test.ts:283-288`
- [ ] **http_stub 绕过 TLS/DNS/重定向/gzip**。`tests/integration/plugin/_helpers/http_stub.ts`
- [ ] **Settings save 端到端从未测试**。`tests/smoke/renderer-smoke.test.tsx:61-79`
- [ ] **Hash 编码不一致**：compiler 用 utf8 string 而 verifier 用 Buffer。`compiler.ts:63`，`bundled_resource_verifier.ts:52`
- [ ] **config-store-debounce 全部 fs 函数被 mock**，`writeFile` 失败路径（ENOSPC/EACCES）未覆盖。`tests/unit/config/config-store-debounce.test.ts:28-36`

---

## 已完成

- [x] 使用 WSL 目录 `\\wsl.localhost\Ubuntu-22.04\home\testuser\testuser_ubuntu\get_official_logo\lobehub_icons` 中的 AI logo，替换当前应用使用的 logo。
- [x] 重新梳理 CPA 数据标签映射：CPA 标签映射按厂商过滤，CPA 账号名不进入标签映射。
- [x] 修复 CPA 数据源管理归属错误：从 Gemini 等厂商入口编辑 CPA 数据源时，只显示当前厂商账号。
- [x] 调整 CPA 数据标签映射规则：同一厂商下多个账号合并到厂商维度，重复标签去重。
- [x] 调整 Codex CPA 数据映射：Codex CPA 标签映射只保留“5 小时”和“一周”两类，不按账号重复生成。
- [x] 移除“外观”里的全局用量标签映射设置。
- [x] 移除通知设置入口；当前没有通知投递实现。
- [x] 移除“设置”里的匿名使用统计开关；当前产品没有匿名使用统计功能。
- [x] 在设置中增加“导出运行日志”按钮，用于导出应用运行日志。
