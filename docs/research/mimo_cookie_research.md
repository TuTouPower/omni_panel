# MiMo Cookie 获取研究报告

## 一、当前获取流程

用户必须**手动操作**，步骤如下：

1. 浏览器打开 `platform.xiaomimimo.com` 并登录
2. F12 打开开发者工具
3. 二选一：
    - **Application → Cookies → xiaomimimo.com** → 复制 `api-platform_serviceToken` 的值
    - **Network 标签页** → 任意请求 → 复制完整 `Cookie` 头
4. 粘贴到 OmniUsage 设置表单的密码输入框中

**痛点：** 必须开 DevTools、手动定位 cookie，对普通用户门槛高，且每次过期都要重复。

---

## 二、API 详情

### Base URL

```
https://platform.xiaomimimo.com
```

### 请求 1 — 用量查询

```
GET /api/v1/tokenPlan/usage
Cookie: <SESSION_COOKIE 原样传入，无任何处理>
```

响应结构：

```json
{
    "code": 0,
    "data": {
        "usage": {
            "items": [
                { "name": "plan_total_token", "used": 123, "limit": 456, "percent": 27 },
                { "name": "compensation_total_token", "used": 0, "limit": 100, "percent": 0 }
            ]
        }
    }
}
```

### 请求 2 — 套餐详情

```
GET /api/v1/tokenPlan/detail
Cookie: <SESSION_COOKIE 原样传入，无任何处理>
```

响应结构：

```json
{
    "code": 0,
    "data": {
        "planCode": "...",
        "planName": "MiMo Pro",
        "currentPeriodEnd": "2026-07-01T00:00:00Z",
        "expired": false
    }
}
```

两个请求通过 `Promise.all` 并行发出。

### 用途映射

| API 字段                                    | 用途                            |
| ------------------------------------------- | ------------------------------- |
| `items[].name` = `plan_total_token`         | 显示为"套餐额度"                |
| `items[].name` = `compensation_total_token` | 显示为"补偿积分"                |
| `items[].used` / `items[].limit`            | 计算用量百分比、状态颜色        |
| `detail.planName`                           | 作为 badge 显示（如"MiMo Pro"） |
| `detail.currentPeriodEnd`                   | 作为重置时间                    |

---

## 三、Cookie 格式问题

### 代码行为

用户填什么，`Cookie:` 头就传什么，**零解析、零补全**。

### 隐患

元数据描述说可以"复制 `api-platform_serviceToken` 的值"，但代码直接作为 `Cookie` 头发送。

- 如果用户只填了裸 token 值 `abc123xyz`，发出的请求是 `Cookie: abc123xyz`，**不是合法 Cookie 格式**
- 正确格式应为 `Cookie: api-platform_serviceToken=abc123xyz` 或完整 Cookie 字符串
- UI placeholder 显示的是完整格式 `cookie-preferences=...; api-platform_serviceToken=...`，与代码行为一致
- **元数据描述的第一种方式有误导**

---

## 四、Cookie 过期与错误处理

| 场景                            | 表现                                        |
| ------------------------------- | ------------------------------------------- |
| Cookie 为空                     | 抛出 `MISSING_PARAM:SESSION_COOKIE`         |
| Cookie 过期/无效                | HTTP 401 → 插件报错 `HTTP_401`              |
| API 返回 `code !== 0`           | 报错 `MIMO_PARSE_ERROR`                     |
| detail 接口语义失败（HTTP 200） | 静默降级：planName → "MiMo"，resetAt → null |

- Cookie **没有自动刷新机制**，完全静态存储
- 过期后用户必须**重复整个手动获取流程**

---

## 五、现有能力缺失清单

| 能力                   | 状态                          |
| ---------------------- | ----------------------------- |
| 自动获取 Cookie        | 无                            |
| Cookie 过期检测/提醒   | 无                            |
| CDP / 浏览器连接       | 无（`1.md` 中有讨论但未实现） |
| Cookie 格式校验 / 补全 | 无                            |
| OAuth / Token 刷新     | 无                            |

---

## 五-bis、已知 Bug（2026-06-08）

### Bug #1：新增 MiMo 账号时 Cookie 未被保存

`src/renderer/components/AddAccountDialog.tsx` 的 `handle_save`（行 422-449）只处理 `apikey` 分支，`SessionForm` 的 cookie state 未暴露给父组件，`session` 分支缺 `params.secrets = { SESSION_COOKIE: cookie }`。

**影响**：用户通过"添加账号"流程粘贴 Cookie 后，新建的 MiMo 插件实例没有 `SESSION_COOKIE`，刷新时插件报 `MISSING_PARAM:SESSION_COOKIE`。

**测试**：`tests/unit/renderer/components/add_account_dialog.test.tsx`（2 个预期失败的测试）。

### Bug #2：网页登录保存 Cookie 后未刷新插件

`src/renderer/views/SettingsView.tsx` 的 `onCookieLogin` 回调（行 424-430）在 `cookieLogin` 成功后只调用了 `config.get()`，没有调用 `plugin.refresh(id)`。

**影响**：用户通过"网页登录"捕获 Cookie 后，Cookie 已保存但插件不刷新，主面板不显示新数据。需等待定时刷新或手动刷新。

**测试**：`tests/unit/renderer/views/settings_view.test.tsx`（cookieLogin refresh 测试验证了期望行为模式）。

---

## 六、改善方案评估

| 方案                       | 描述                                                                      | 解决痛点                             | 可行性 | 复杂度                     |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------ | ------ | -------------------------- |
| **A：内嵌 WebView 登录**   | 用 `BrowserWindow` 打开 MiMo 登录页，登录后从 session 中自动提取 cookie   | 彻底解决：用户无需碰 DevTools        | 高     | 中（需了解 MiMo 登录流程） |
| **B：CDP 连接用户浏览器**  | 连接 `localhost:9222`，需用户启动 Chrome 时带 `--remote-debugging-port`   | 部分解决：自动提取但需特殊启动参数   | 中     | 低，但用户体验差           |
| **C：简化输入 + 格式补全** | 用户只需粘贴 token 值，代码自动补全为 `api-platform_serviceToken=<value>` | 不解决：用户仍需开 DevTools 手动获取 | 高     | 极低                       |
| **D：Cookie 过期提示**     | 401 时显示友好提示"Cookie 已过期，请重新获取"                             | 不解决获取问题，但改善错误体验       | 高     | 低                         |

### 结论

- **方案 C 和 D** 只是锦上添花，不解决"必须开 DevTools"的核心痛点
- **方案 A（内嵌 WebView）** 是唯一能彻底改善用户体验的方案：用户在应用内弹出的窗口中登录，cookie 自动提取，完全不需要碰 DevTools
- 方案 A 的主要风险：需要确认 MiMo 登录流程（是否有验证码、二次验证等），以及 WebView 中 cookie 的提取方式
