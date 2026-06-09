# MiMo Cookie 获取研究报告

## 一、当前获取流程

用户在应用内点击"网页登录"→ 弹出内嵌 BrowserWindow → 导航到 `platform.xiaomimimo.com/console/plan-manage` → 重定向到 `account.xiaomi.com` 登录 → 登录成功后重定向回 MiMo 平台 → 用户关闭窗口 → 自动从 Electron persistent session 中提取全部 3 个 cookie 并保存。

**不再需要**：手动开 DevTools、复制 Cookie。

## 二、API 详情

### Base URL

```
https://platform.xiaomimimo.com
```

### 认证方式

所有 API 请求通过 `Cookie` 头发送 3 个 cookie（用 `; ` 拼接）：

| Cookie 名                   | 用途          |
| --------------------------- | ------------- |
| `api-platform_serviceToken` | 主 auth token |
| `api-platform_slh`          | session hash  |
| `api-platform_ph`           | 平台 hash     |

应用通过 Electron `session.fromPartition("persist:mimo-login")` 持久化这些 cookie，启动后可自动刷新。

### 请求 1 — 用量查询

```
GET /api/v1/tokenPlan/usage
Cookie: <完整 Cookie 字符串>
```

### 请求 2 — 套餐详情

```
GET /api/v1/tokenPlan/detail
Cookie: <完整 Cookie 字符串>
```

### 请求 3 — 余额查询

```
GET /api/v1/balance
Cookie: <完整 Cookie 字符串>
```

响应结构：

```json
{
    "code": 0,
    "data": {
        "balance": -0.36,
        "totalConsumption": 10.36,
        "totalRecharge": 10.0
    }
}
```

三个请求通过 `Promise.all` 并行发出。余额接口失败时降级，不阻塞 usage/detail 数据。

### 用途映射

| API 字段                                    | 用途                                |
| ------------------------------------------- | ----------------------------------- |
| `items[].name` = `plan_total_token`         | 显示为"套餐额度"                    |
| `items[].name` = `compensation_total_token` | 显示为"补偿积分"                    |
| `items[].used` / `items[].limit`            | 计算用量百分比、状态颜色            |
| `detail.planName`                           | 作为 badge 显示（如"Max"）          |
| `detail.currentPeriodEnd`                   | 作为重置时间                        |
| `balance.data.balance`                      | 余额（可为负数），显示为 ratio 类型 |

## 三、Cookie 持久化

- 登录窗口使用 `persist:mimo-login` 分区，cookie 持久化到磁盘
- `handleCookieLogin` 窗口关闭时读取全部 3 个 cookie，拼接后存入 `secretsStore`
- `cookie-refresh-service` 定时从持久化 session 刷新 cookie，更新到所有 MiMo 实例
- 应用重启后 `persist:` session 中 cookie 不丢失，可继续使用

## 四、Cookie 过期与错误处理

| 场景                  | 表现                                        |
| --------------------- | ------------------------------------------- |
| Cookie 为空           | 抛出 `MISSING_PARAM:SESSION_COOKIE`         |
| Cookie 过期/无效      | HTTP 401 → 插件报错 `HTTP_401`              |
| API 返回 `code !== 0` | 报错 `MIMO_PARSE_ERROR`                     |
| detail 失败           | 静默降级：planName → "MiMo"，resetAt → null |
| balance 失败          | 静默降级：不返回余额 item，usage 数据正常   |
