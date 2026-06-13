# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

## 待办

> 暂无待办项。

---

## 待办（测试盲区审查 — 2026-06-12，27 项中已完成 26 项）

> 全部 26 个问题已详细记录至 `docs/review-issues.md`。

> 10 子代理并行审查 76 个测试文件，发现以下测试通过但生产可能失败的问题。

### 高危（生产可能崩溃/数据丢失）

- [x] **CpaConnectorSettings 测试无 `window.usageboard` mock**：已加 mock，防御子组件访问。
- [x] **TrayMenu 测试 mock 含 `auth`，真实 tray preload 不暴露**：确认 TrayMenu 不使用 auth，无需修改。
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

- [x] **`use_config` 被整体 mock，真实 hook 的串行化队列和生命周期不可见**：已文档化限制。
- [x] **`Tray.getBounds()` Windows 返回零坐标**：已加零值防护，回退到主显示器中心。
- [x] **`queueMicrotask` vs `setImmediate` 时序差异掩盖竞态**：已文档化限制。
- [x] **Windows 无 Unix 信号**：已改用 fd 3 quit 管道协议，跨平台行为一致。
- [x] **`userData` 路径含 Unicode/空格**：已加 Unicode 路径测试。
- [x] **`echo` 在 Windows 不是独立 exe**：已改为平台感知 (`cmd /c echo` on Windows)。
- [x] **esbuild 编译 vs 打包 ASAR 执行路径完全不同**：已加 `tests/packaged_smoke/plugin_execution.test.ts`。
- [x] **plugin-ipc sender 校验未测试**：已加全部 sender 校验测试。

### 低危

- [x] **button 测试不验证 CSS 类名**：已加 ghost/outline 变体 CSS 类验证。
- [x] **usage_rows 硬编码 clipPath 值**：已改为计算值断言。
- [x] **provider_account_row 只断言负面**：已加正向断言。
- [x] **refresh-service 不测试失败后恢复**：已加 failed→ready 恢复测试。
- [x] **http_stub 绕过 TLS/DNS/重定向/gzip**：已加 HTTPS stub + 自签证书 + 5 个覆盖测试。
- [x] **Settings save 端到端从未测试**：已覆盖设置页保存链路；renderer smoke 断言 `config.saveSecrets`、`config.save` 和刷新调用，Electron E2E 覆盖真实设置窗口保存密钥、重启后显示 `***`、`config.json` 不写入明文 secret。`tests/smoke/renderer-smoke.test.tsx:61-114`，`tests/user_e2e/specs/settings_provider_accounts.spec.ts`
- [x] **Hash 编码不一致**：已对齐为 Buffer。
- [x] **config-store-debounce 全部 fs 函数被 mock**：已文档化 ENOSPC/EACCES 限制。

---

## 已完成

### 架构重构代码审查修复（2026-06-13）

> 两轮审查发现的问题中，以下已修复并提交：

- [x] **A. parse_body 内存泄漏** — `local-api/server.ts` oversized body 后调用 `req.pause()` 防止流继续缓冲。`50d059d`
- [x] **D1/E1. observation_store.insert 失败处理** — `refresh-service.ts` insert 失败时记日志并抛错，状态标记为 failed 而非 ready。`2ccb87b`
- [x] **D3. connector observation 静默丢弃** — `runtime.ts` 无效 observation 跳过而非整体返回空，保留有效数据。`1d8e5d9`
- [x] **R1. vault 并发写竞态** — `file-vault-backend.ts` set/delete 加 per-key 锁防止 read-modify-write 覆盖。`dd4d414`
- [x] **B1. HTTP 响应体大小限制** — `net-client.ts` 增加 10MB 上限，content-length 和实际 body 双重检查。`d7e5fe2` `a0be15e`
- [x] **B4. HTTP 204 空响应崩溃** — `net-client.ts` 空响应返回 null 而非 JSON.parse 崩溃。`d7e5fe2`
- [x] **E3. HTTP 请求失败错误处理** — `tier1-poll-executor.ts` 网络错误抛出而非静默返回空数组，使 connector 状态正确标记 failed。`387f1d5`
- [x] **E4. configStore.load() 错误处理** — `scheduler-orchestrator.ts` resume 路径增加 catch，防止 unhandled rejection。`3d0f7a2`

### 架构重构审查第二批修复（2026-06-13）

> 并行子代理修复的剩余审查问题：

- [x] **E2. cookie 值日志脱敏** — `cookie-refresh-service.ts` 对 Error message/stack 中的 `key=VALUE` 模式脱敏。`50514f2`
- [x] **R2/B3. observation store busy_timeout** — `observation-store.ts` 显式设置 `busy_timeout=5000`，多连接并发不丢数据。`a9ed1cb`
- [x] **R3. config store 串行化** — `config-store.ts` 已有 saveTail 队列，补测试验证并发 save 一致性。`5572887`
- [x] **B2. connector 超时错误处理** — `runtime.ts` async 脚本超时返回明确 "timeout" 错误而非静默挂起。`1d9d300`
- [x] **E5/B5. vault key 名脱敏 + JSON 损坏处理** — `file-vault-backend.ts` 日志 key 脱敏，损坏 JSON 抛错而非静默返回 `{}`。`a102bf0`
- [x] **D2. config 日志 secret 脱敏** — `config_redaction.ts` 对 secrets 字段和 secret-like 参数名值脱敏为 `***`。`25f6da0`
- [x] **E6/B/R4. session manager** — cookie 内存清理、大小写不敏感 header 查找、并发登录 guard。`a102bf0`
- [x] **B6. HTTP 错误响应体** — `net-client.ts` >= 400 时 body 前 200 字符加入错误消息。`0664781`
- [x] **D4. secret 缺失抛错** — `refresh-service.ts` required secret 缺失时抛 `Missing required secret` 而非空字符串。`5438c07`
- [x] **F. refreshIntervalSeconds 范围 clamp** — `config types.ts` 用 z.preprocess 将超范围值 clamp 到 [60,3600]，避免整份配置被丢弃。`0800426`
- [x] **C. sandbox ctx 深 freeze** — `runtime.ts` deep_freeze 递归冻结 ctx 数据对象，防止 connector 脚本修改。`f3af5a4`

### 未修复（已知限制/推测性）

- **E. secrets 无迁移** — 从 safeStorage 切 file-vault，commit-notes 已文档化 clean break。
- **G. scheduler 并发启动** — 无证据 connector 间有依赖，纯推测。

### 其他已完成

- [x] 使用 WSL 目录 `\\wsl.localhost\Ubuntu-22.04\home\testuser\testuser_ubuntu\get_official_logo\lobehub_icons` 中的 AI logo，替换当前应用使用的 logo。
- [x] 重新梳理 CPA 数据标签映射：CPA 标签映射按厂商过滤，CPA 账号名不进入标签映射。
- [x] 修复 CPA 数据源管理归属错误：从 Gemini 等厂商入口编辑 CPA 数据源时，只显示当前厂商账号。
- [x] 调整 CPA 数据标签映射规则：同一厂商下多个账号合并到厂商维度，重复标签去重。
- [x] 调整 Codex CPA 数据映射：Codex CPA 标签映射只保留"5 小时"和"一周"两类，不按账号重复生成。
- [x] 移除"外观"里的全局用量标签映射设置。
- [x] 移除通知设置入口；当前没有通知投递实现。
- [x] 移除"设置"里的匿名使用统计开关；当前产品没有匿名使用统计功能。
- [x] 在设置中增加"导出运行日志"按钮，用于导出应用运行日志。
