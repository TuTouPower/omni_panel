# Cookie 静默刷新机制

## 背景

MiMo/Kimi 等 session 类账号通过 webview 登录获取 cookie，cookie 有时间限制，过期后需重新登录。当前流程：过期 → 插件报错 → 用户手动进设置点"网页登录"。

## 目标

新增后台静默 cookie 刷新机制：定时用持久化 partition 打开隐藏 webview，利用已有 SSO session 自动刷新 cookie，仅在彻底过期时才需要用户手动操作。

## 设计

### 1. 配置

| 字段                 | 类型                 | 默认 | 说明                          |
| -------------------- | -------------------- | ---- | ----------------------------- |
| `cookieRefreshHours` | `0 \| 6 \| 12 \| 24` | `24` | Cookie 刷新周期。`0` = 不刷新 |

Zod schema: `z.number().int().refine(v => [0, 6, 12, 24].includes(v)).optional()`。

### 2. 定时器

- 主进程独立 `setInterval`，与用量刷新解耦
- 按 `cookieRefreshHours` 周期触发
- 为 `0` 时不启动定时器
- 设置变更时重建定时器

### 3. 静默刷新流程

```
┌─ 定时器触发 ─────────────────────────────────────────────┐
│                                                          │
│  1. 遍历 config.plugins，筛选需刷新的实例:                 │
│     - source !== "cpa"                                   │
│     - 插件 metadata 有 secret 类型参数                     │
│     - vendorId ∈ ["mimo", "kimi", ...]                   │
│                                                          │
│  2. 按 vendorId 去重，一个 vendorId 只开一个 webview        │
│                                                          │
│  3. 每个 webview:                                        │
│     - 固定持久化 partition: persist:mimo-cookie-refresh   │
│     - 隐藏窗口 (show: false)                              │
│     - 加载 metadata.endpoints.login                      │
│     - 监听 session.cookies.on("changed")                 │
│     - 检测到目标 cookie → 更新该 vendorId 所有实例         │
│       的 secrets → 关闭窗口                               │
│     - 30 秒超时 → 静默关闭，不通知用户                      │
│                                                          │
│  4. secrets 更新: ${instanceId}:${paramName} = cookie值   │
└──────────────────────────────────────────────────────────┘
```

### 4. Partition 策略

**固定持久化 partition**，名称按 vendorId 区分：

```
persist:mimo-cookie-refresh
persist:kimi-cookie-refresh
```

不做 `randomUUID()`。这样 webview 复用同一浏览器会话，保留 SSO 主 session cookie。第一次用户手动登录后，后续刷新时 webview 带着有效 session 访问登录页，服务端自动跳转下发新 serviceToken/access_token，无需用户再次输入密码。

### 5. Vendor cookie 映射

| vendorId | 目标 cookie 名称            | secrets 参数名   |
| -------- | --------------------------- | ---------------- |
| mimo     | `api-platform_serviceToken` | `SESSION_COOKIE` |
| kimi     | `access_token`              | `SESSION_COOKIE` |

### 6. 并发与防抖

- 同一 vendorId 同一时刻最多一个进行中的刷新
- 用内存 Set 记录正在刷新的 vendorId，避免定时器触发时上一个还没完成

### 7. 错误处理

| 场景                 | 行为                         |
| -------------------- | ---------------------------- |
| 30 秒内检测到 cookie | 更新所有实例 secrets，关窗口 |
| 30 秒超时            | 关窗口，静默失败             |
| Login URL 未配置     | 跳过该 vendorId，日志 warn   |
| Webview 加载失败     | 关窗口，日志 error           |
| Secrets 更新失败     | 日志 error，继续处理其他     |

### 8. Settings UI

在设置 → 账号区域新增一行：

```
Cookie 刷新周期    [ 从不 ▾ ]
```

下拉选项：从不 / 6 小时 / 12 小时 / 24 小时。保存到 `config.cookieRefreshHours`。

### 9. IPC 接口

```ts
// auth:refreshCookies
// 入参: { vendorIds: UsageProvider[] }
// 返回: { refreshed: number, failed: number }
```

### 10. 文件变更

| 文件                                  | 变更                                        |
| ------------------------------------- | ------------------------------------------- |
| `src/shared/types/config.ts`          | 新增 `cookieRefreshHours`                   |
| `src/shared/types/ipc.ts`             | 新增 `AUTH_REFRESH_COOKIES` channel         |
| `src/main/core/config/types.ts`       | Zod schema                                  |
| `src/main/ipc/auth-ipc.ts`            | 新增 `handleRefreshCookies`                 |
| `src/main/index.ts`                   | 定时器 + secretParamKeys 重建时也重建定时器 |
| `src/renderer/views/SettingsView.tsx` | 下拉设置项                                  |
| `src/renderer/styles/globals.css`     | 如有必要，新增设置行样式                    |

## 非目标

- 不用在每次用量刷新时开 webview
- 不做 cookie 过期时间的主动检测（HTTP probe）
- 不修改现有插件执行流程
- 不改变前端 add-account 对话框
