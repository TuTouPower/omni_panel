# Session 多账号隔离失败 + Cookie 捕获代码重复

**日期**: 2026-07-15
**状态**: 已修复 (2026-07-15)

## 受影响范围

3 个 session 能力 provider 全部受影响：

| Provider      | manifest 文件                          | 多账号隔离 | cookie 自动识别            |
| ------------- | -------------------------------------- | ---------- | -------------------------- |
| `opencode_go` | `connectors/opencode_go/manifest.json` | 失败       | 失败（缺 `/_server` 匹配） |
| `kimi`        | `connectors/kimi/manifest.json`        | 失败       | 未验证                     |
| `mimo`        | `connectors/mimo/manifest.json`        | 失败       | 未验证                     |

## 现象

1. **多账号隔离失败**：账号 A 网页登录后，账号 B 再点"网页登录"直接处于已登录态，因为复用账号 A 的持久化 cookies。对所有 session provider 都成立。
2. **cookie 自动识别不工作**（OpenCode Go）：登录成功后不会自动关闭窗口，必须手动关闭才开始识别 cookie。

## 根因分析

### Bug 1：Session partition 按 provider 而非 instance 隔离

**根因**：`get_session_login_partition(provider)` 返回 `persist:<provider>-login`。同一 provider 所有实例共享同一个 Electron session partition，cookies 跨账号泄漏。

`src/main/core/session/session-manager.ts:156`：

```ts
export function get_session_login_partition(provider: string): string {
    return `persist:${provider}-login`;
}
```

账号 A 登录后 cookies 持久化在此 partition。账号 B 打开登录窗口时复用同一 partition → 浏览器携带账号 A 的 cookies → 无需重新登录。

**受影响调用点**（3 处均只用 provider，不区分 instance）：

| 文件                                       | 行号 | 函数                     |
| ------------------------------------------ | ---- | ------------------------ |
| `src/main/core/session/session-manager.ts` | 70   | `start_login`            |
| `src/main/ipc/auth-ipc.ts`                 | 50   | `handleCookieLogin`      |
| `src/main/ipc/auth-ipc.ts`                 | 186  | `trySilentCookieRefresh` |

### Bug 2：两套 cookie 捕获实现，代码重复且行为不一致

项目里存在两条平行的 cookie 捕获路径，逻辑重复且互相不一致：

#### Path A：`session-manager.ts`（`window.usageboard.session.login()`）

调用方：`SettingsView.tsx:420`，mimo / kimi / opencode_go 有 session_meta 的 provider。

- `should_capture_cookie`（第 160-168 行）有 login origin 校验，只捕获同源请求
- 匹配路径：`/api/v1/` **和** `/_server`
- 无 auto-close 机制，依赖用户手动关闭窗口触发 `close` 事件后保存

#### Path B：`auth-ipc.ts handleCookieLogin`（`window.usageboard.auth.cookieLogin()`）

调用方：`SettingsView.tsx:426`，fallback（无 session_meta 的 provider）。

- **无 login origin 校验**，任何域 `/api/v1/` 请求都被捕获
- 匹配路径：仅 `/api/v1/`，**缺少 `/_server`**
- 有 1.5 秒 auto-close 机制

**重复代码对比**：

| 关注点                    | session-manager.ts                                      | auth-ipc.ts handleCookieLogin             |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| 创建窗口 + webPreferences | `create_window(partition)` 回调                         | 内联 `new BrowserWindow(...)`             |
| 创建 session + webRequest | `create_session(partition)` 回调                        | 内联 `session.fromPartition(partition)`   |
| 拦截路径匹配              | `should_capture_cookie`（含 origin 校验 + `/_server`）  | 仅 `/api/v1/`，无 origin 校验             |
| Cookie 头提取             | `extract_cookie_header` + `select_cookie_header_values` | 直接读 `details.requestHeaders["Cookie"]` |
| Cookie 存储               | `vault.set(keyFor(...), ...)`                           | `secretsStore.set(keyFor(...), ...)`      |
| 超时处理                  | `setTimeout` → reject                                   | `setTimeout` → fail                       |
| 并发锁                    | `in_progress` Set per instance_id                       | 无                                        |
| Auto-close                | 无（等用户手动关）                                      | 有（捕获后 1.5s 自动关闭）                |

**Path B 对 OpenCode Go 失效的具体原因**：

`auth-ipc.ts:81` 只匹配 `/api/v1/`。OpenCode Go 后端 RPC 走 `/_server`，session-manager 的 `should_capture_cookie` 已覆盖，但 `handleCookieLogin` 没覆盖。cookie 发出后不被捕获 → auto-close 定时器永不触发 → 用户手动关窗口时 `captured_cookie` 为空 → `saved: false`。

## 修复方案

### 修复 1：partition 加入 instance_id

```ts
export function get_session_login_partition(provider: string, instance_id: string): string {
    return `persist:${provider}-${instance_id}-login`;
}
```

3 个调用点同步传 instance_id。`session-manager.ts` 的 `start_login` 已有 `request.instance_id`。

### 修复 2：抽取公共 cookie 捕获逻辑，删除 Path B 内联代码

将两套实现合并为一个。核心逻辑收口到 `session-manager.ts`：

- `handleCookieLogin` 改为调用 `sessionManager.start_login()`，删除内联的 `BrowserWindow`、`session.fromPartition`、`onBeforeSendHeaders`、`setTimeout` 等与 session-manager 重复的代码
- cookie 路径匹配规则统一走 `should_capture_cookie`
- auto-close 机制作为 `start_login` 的选项开关（或始终启用，因为 session-manager 当前等手动关的行为可升级为自动关）
- origin 校验对 Path B 也是缺失的安全加固

合并后的调用路径：

```
SettingsView → session IPC (统一入口) → session-manager.start_login()
                                         ├── 独立 partition per instance
                                         ├── should_capture_cookie (origin + path)
                                         ├── auto-close on capture
                                         └── vault.set per instance
```

`auth-ipc.ts` 的 `handleCookieLogin` 变为薄 wrapper，委托给 session-manager；或直接废弃，让 SettingsView 统一走 `window.usageboard.session.login()`。
