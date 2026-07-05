# MiMo Cookie 获取研究报告

## 一、当前获取流程

用户在应用内点击"网页登录"→ 弹出内嵌 BrowserWindow（持久分区 `persist:mimo-login`）→ 导航到 `platform.xiaomimimo.com/console/plan-manage` → 重定向到 `account.xiaomi.com` 登录 → 登录成功后重定向回 MiMo 平台并自动发起 API 请求 → 应用通过 `webRequest.onBeforeSendHeaders` **拦截浏览器真实 API 请求**，直接抓取完整的 `Cookie` 请求头 → 用户关闭窗口后保存。

**不再需要**：手动开 DevTools、复制 Cookie。

### 为什么拦截请求头，而不是读 session cookie

浏览器发往 `/api/v1/*` 的请求头里的 `Cookie` 是**服务端真正校验的完整字符串**，包含所有相关 cookie（含 httpOnly）。直接抓这个最可靠：不会漏 cookie，也不用猜拼接顺序。窗口关闭时若未抓到（极少数情况），回退到从持久 session 按名读取。

## 二、API 详情

### Base URL

```
https://platform.xiaomimimo.com
```

### 认证方式（关键）

所有 API 请求**不仅需要 Cookie，还必须带浏览器特征请求头**，否则 MiFE 网关直接返回 **401**：

| 请求头            | 值                                                    |
| ----------------- | ----------------------------------------------------- |
| `Cookie`          | 抓取到的完整 Cookie 字符串                            |
| `User-Agent`      | Chrome UA（`Mozilla/5.0 ... Chrome/149 ...`）         |
| `Referer`         | `https://platform.xiaomimimo.com/console/plan-manage` |
| `Origin`          | `https://platform.xiaomimimo.com`                     |
| `x-timeZone`      | `Asia/Shanghai`                                       |
| `Accept`          | `*/*`                                                 |
| `Accept-Language` | `zh`                                                  |
| `Content-Type`    | `application/json`                                    |
| `Sec-Fetch-Site`  | `same-origin`                                         |
| `Sec-Fetch-Mode`  | `cors`                                                |
| `Sec-Fetch-Dest`  | `empty`                                               |

> **历史教训**：之前只发 `Cookie` 头，即使 cookie 完全正确，服务端仍返回 401。补齐上述浏览器头后 401 消失。

相关的 cookie（域 `.platform.xiaomimimo.com` / `.xiaomimimo.com`）：`api-platform_serviceToken`、`api-platform_slh`、`api-platform_ph`、`userId` 等。实现上不再硬编码逐个拼接，而是抓取浏览器发送的整串。

### 请求 1 — 用量查询

```
GET /api/v1/tokenPlan/usage
```

### 请求 2 — 套餐详情

```
GET /api/v1/tokenPlan/detail
```

### 请求 3 — 余额查询

```
GET /api/v1/balance
```

响应结构（注意 `balance` 可能是**字符串**，且**可为负数**）：

```json
{
    "code": 0,
    "data": {
        "balance": "-0.36",
        "totalConsumption": 10.36,
        "totalRecharge": 10.0
    }
}
```

三个请求通过 `Promise.all` 并行发出。余额接口失败时降级，不阻塞 usage/detail 数据。

### 用途映射

| API 字段                                    | 用途                       |
| ------------------------------------------- | -------------------------- |
| `items[].name` = `plan_total_token`         | 显示为"套餐额度"           |
| `items[].name` = `compensation_total_token` | 显示为"补偿积分"           |
| `items[].used` / `items[].limit`            | 计算用量百分比、状态颜色   |
| `detail.planName`                           | 作为 badge 显示（如"Max"） |
| `detail.currentPeriodEnd`                   | 作为重置时间               |
| `balance.data.balance`                      | 余额（字符串/负数），见下  |

### 余额显示的特殊处理（关键）

插件输出 schema 要求 `used >= 0`，但余额可为负。前端只有 `percent` / `ratio` 两种显示样式，没有"纯数字"样式。因此：

- 先 `Number(balance)` 强转（API 返回字符串），非有限数则跳过。
- 把带符号的数值编进标签：`name = "余额 -0.36"`。
- `used: null`（避免画出误导性的进度条），`limit: 0`。
- `status` / `color`：负数为 `critical` / `red`，非负为 `normal` / `blue`。

> **历史教训**：旧实现 `used: balance`（负数）直接违反 `used >= 0` 的 schema，导致**整个 MiMo 输出被拒绝**，连正常的套餐用量都显示不出来。

## 三、Cookie 持久化与刷新

- 登录窗口使用 `persist:mimo-login` 分区，cookie 持久化到磁盘，重启不丢失。
- `handleCookieLogin`：优先保存 webRequest 拦截到的完整 Cookie 头；回退为按域读取持久 session 的 cookie 拼接。
- `cookie-refresh-service`：对 MiMo 采用**按域抓取**（`.platform.xiaomimimo.com`、`.xiaomimimo.com`），不做名称过滤，平台新增 cookie 时无需改代码；定时（默认 24h）刷新并写入所有 MiMo 实例的 `SESSION_COOKIE`。

## 四、错误处理

| 场景                  | 表现                                        |
| --------------------- | ------------------------------------------- |
| Cookie 为空           | 抛出 `MISSING_PARAM:SESSION_COOKIE`         |
| 缺少浏览器请求头/过期 | HTTP 401 → 插件报错 `HTTP_401`              |
| API 返回 `code !== 0` | 报错 `MIMO_PARSE_ERROR`                     |
| detail 失败           | 静默降级：planName → "MiMo"，resetAt → null |
| balance 失败/非数     | 静默降级：不返回余额 item，usage 数据正常   |
