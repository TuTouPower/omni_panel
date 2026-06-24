# CPA 额度获取方法指南

> 本文档解释 ai_monitor 如何通过 CPA-Manager 获取 Claude / Codex / Gemini 的用量配额数据。
> 目标读者：AI 助手或开发者，需要理解或复用这套逻辑。

---

## 整体架构

```
ai_monitor (本项目)
    │
    │  HTTP 请求
    ▼
CPA-Manager (代理服务)
    │
    │  用存储的 OAuth token 代发请求
    ▼
上游 API (Anthropic / OpenAI / Google Cloud)
```

ai_monitor **不直接持有 OAuth token**。所有 token 由 CPA-Manager 统一管理。ai_monitor 通过 CPA-Manager 的代理接口转发请求。

---

## CPA-Manager 连接信息

| 项目     | 值                         |
| -------- | -------------------------- |
| 地址     | `http://<your-host>:20224` |
| 管理密钥 | `<your-management-key>`    |
| 超时     | 30 秒                      |

配置在 `src/api.py` 第 725-728 行：

```python
_CPA_MGMT_URL = "http://<your-host>:20224"
_CPA_MGMT_KEY = "<your-management-key>"
_CPA_MGMT_TIMEOUT = 30
```

---

## 核心流程（5 步）

### 第 1 步：触发刷新

调用 REST 端点触发：

```
GET /api/refresh/cpa
```

实际代码位置：`src/api.py:1010`，函数 `refresh_cpa()`。

它启动一个后台线程执行 `_refresh_cpa_worker()`，内部重试 3 次。

### 第 2 步：获取 auth 文件列表

```python
_cpa_fetch_auth_files()
# → GET {CPA_MGMT_URL}/v0/management/auth-files
# → Header: Authorization: Bearer {CPA_MGMT_KEY}
```

返回值是一个列表，每个元素代表一个已登录的 OAuth 账号：

```json
[
    {
        "provider": "claude", // claude / codex / gemini-cli
        "auth_index": "claude-xxx", // 标识这个 token 的唯一 ID
        "name": "claude-user@example.com.json",
        "disabled": false
    }
]
```

- `provider` 决定调用哪个上游 API
- `auth_index` 是调用代理时的身份标识
- `disabled: true` 的账号会被跳过
- `name` 包含邮箱信息，用于 display name

### 第 3 步：解析账号信息

从 `name` 字段提取邮箱：

| provider     | name 格式                   | 提取规则                         |
| ------------ | --------------------------- | -------------------------------- |
| `codex`      | `codex-{email}-{plan}.json` | plan 为 `team` 时需去掉 hex 前缀 |
| `claude`     | `claude-{email}.json`       | 直接取 email 部分                |
| `gemini-cli` | `gemini-{email}.json`       | 直接取 email 部分                |

### 第 4 步：通过代理调用上游 API

核心代理函数：

```python
_cpa_api_call(method, url, auth_index, headers, data)
# → POST {CPA_MGMT_URL}/v0/management/api-call
```

请求体：

```json
{
    "method": "GET",
    "url": "https://api.anthropic.com/api/oauth/usage",
    "auth_index": "claude-xxx",
    "header": {
        "Authorization": "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20"
    }
}
```

**关键点**：header 里的 `$TOKEN$` 是占位符，CPA-Manager 会自动替换为该 `auth_index` 对应的真实 token。

响应格式：

```json
{
    "status_code": 200,
    "body": "{...原始 API 响应的 JSON 字符串...}"
}
```

### 第 5 步：解析上游响应并写入数据库

三个 provider 有不同的响应格式，各有对应的解析函数。解析结果统一为：

```python
{
  "key_name": "Claude (user@example.com)",  # 显示名
  "periods": [
    {
      "plan_type": "5小时",           # 周期名称
      "used_percent": 45.2,           # 已用百分比
      "next_reset_time": 1777046400000  # 下次重置时间 (Unix ms)
    },
    {
      "plan_type": "每周",
      "used_percent": 23.1,
      "next_reset_time": 1777046400000
    }
  ]
}
```

最终通过 `db.insert_record()` 写入 SQLite。

---

## 三个 Provider 的详细调用方式

### Claude

```
上游 URL: https://api.anthropic.com/api/oauth/usage
方法:     GET
必要 Header:
  Authorization: Bearer $TOKEN$
  Content-Type:  application/json
  anthropic-beta: oauth-2025-04-20
```

**响应解析**（`_cpa_parse_claude_quota`，`api.py:844`）：

```python
body = {
  "five_hour": {
    "utilization": 0.452,        # 0~1 浮点数，需 ×100 转百分比
    "resets_at": "2026-05-27T03:00:00Z"  # ISO 8601 时间
  },
  "seven_day": {
    "utilization": 0.231,
    "resets_at": "2026-06-01T00:00:00Z"
  }
}
```

- `utilization` 字段：值 ≤ 1 时 ×100 得到百分比；> 1 时直接用
- 时间字段：依次尝试 `resets_at` → `resetsAt` → `reset_time` → `resetTime`，解析 ISO 格式转 Unix ms
- 输出 `plan_type`：`"5小时"` / `"每周"`

### Codex

```
上游 URL: https://chatgpt.com/backend-api/wham/usage
方法:     GET
必要 Header:
  Authorization: Bearer $TOKEN$
  Content-Type:  application/json
  User-Agent:    codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal
```

**响应解析**（`_cpa_parse_codex_quota`，`api.py:790`）：

```python
body = {
  "plan_type": "plus",
  "rate_limit": {
    "primary_window": {           # 或 camelCase: primaryWindow
      "used_percent": 45.2,       # 已是百分比
      "reset_at": 1777046400,     # Unix 秒 或 ms
      "reset_after_seconds": 3600 # 备选：剩余秒数
    },
    "secondary_window": {         # 或 camelCase: secondaryWindow
      "used_percent": 23.1,
      "reset_at": 1777046400
    }
  }
}
```

- `used_percent`：直接用，不需要转换
- `reset_at`：< 1e12 时认为是秒，×1000 转 ms；否则认为已经是 ms
- `reset_after_seconds`：如果 `reset_at` 缺失，用 `当前时间 + reset_after_seconds` 计算
- 输出 `plan_type`：`"5小时"`（primary_window）/ `"每周"`（secondary_window）

### Gemini

Gemini 需要 **两步请求**：

**Step 1**：获取 project ID

```
POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
Body: "{}"
```

响应中取 `cloudaicompanionProject` 字段。

**Step 2**：获取 quota

```
POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota
Body: {"project": "{project_id}"}  // 或 "{}" 如果 Step 1 失败
```

**响应解析**（`_cpa_parse_gemini_quota`，`api.py:885`）：

```python
body = {
  "buckets": [
    {
      "modelId": "gemini-2.5-pro",
      "tokenType": "INPUT_TOKENS",
      "remainingFraction": 0.769,   # 剩余比例 (0~1)
      "resetTime": "2026-05-27T00:00:00Z"
    }
  ]
}
```

- `remainingFraction`：值 ≤ 1 时 ×100；`used_percent = 100 - remaining_percent`
- 展示标签：`modelId` 去掉 `gemini-` 前缀并美化，常见 `tokenType` 简化为 `输入` / `输出`，`requests` 不追加类型后缀
- 一个账号可能有多个 bucket（不同模型/不同类型 tokens）

### Antigravity

OmniUsage 按 CPA 面板口径展示 Antigravity：读取 CPA 历史用量聚合，而不是 `fetchAvailableModels` 内部模型配额。

```
CPA URL: GET /v0/management/usage
必要 Header:
  Authorization: Bearer {cpa_mgmt_key}
```

**响应解析**：

```json
{
    "apis": {
        "POST /v1/messages": {
            "models": {
                "gemini-3-pro": {
                    "details": [
                        {
                            "auth_index": "antigravity-auth",
                            "failed": false,
                            "tokens": { "total_tokens": 600 }
                        }
                    ]
                }
            }
        }
    }
}
```

- 遍历 `apis.*.models.*.details[]`
- 只汇总当前 Antigravity `auth_index` 的明细
- 按 `tokens.total_tokens` 汇总同名模型
- 丢弃 0 token 模型，按 token 降序取前 8 条
- 以 `ratio` 样式展示：`used = 模型 token`，`limit = 当前列表最大模型 token`
- `fetchAvailableModels` 是内部可用模型/配额信号，不作为 CPA 面板同款 Antigravity 用量来源

### Kimi (Moonshot AI 编程助手)

```
上游 URL: GET https://api.kimi.com/coding/v1/usages
方法:     GET
必要 Header:
  Authorization: Bearer $TOKEN$
```

无需请求体。

**响应解析**：

```json
{
    "usage": {
        "used": 123,
        "limit": 1000,
        "remaining": 877,
        "reset_at": "2026-05-27T00:00:00Z",
        "reset_in": 3600,
        "ttl": 3600
    },
    "limits": [
        {
            "name": "weekly",
            "title": "Weekly limit",
            "scope": "coding",
            "used": 123,
            "limit": 1000,
            "remaining": 877,
            "reset_at": "2026-05-27T00:00:00Z",
            "reset_in": 3600,
            "ttl": 3600,
            "duration": 7,
            "timeUnit": "DAYS",
            "detail": {
                "used": 123,
                "limit": 1000,
                "remaining": 877,
                "resetAt": "2026-05-27T00:00:00Z"
            },
            "window": {
                "duration": 7,
                "timeUnit": "DAYS"
            }
        }
    ]
}
```

- `usage` 是汇总信息，`limits` 是各周期明细
- `used_percent = (used / limit) × 100`
- `reset_at` / `resetAt`：ISO 8601 格式，转 Unix ms
- `reset_in`：剩余秒数（备用计算方式）
- `duration` + `timeUnit`：周期窗口描述（如 7 DAYS = 每周）
- Kimi OAuth token 由 CPA-Manager 自动刷新（`refreshKimiOAuthAccessToken`），客户端无需处理

### Vertex (Google Cloud Vertex AI)

**当前状态：未实现配额获取。**

Vertex AI（`https://aiplatform.googleapis.com`）在 CPA-Manager / CliRelay 中只实现了推理（`generateContent`、`streamGenerateContent`、`countTokens`）功能，没有配额查询端点。Google Cloud 的配额系统走的是 Cloud Console / Service Usage API，与 OAuth token 体系不同，暂时不支持通过 CPA 代理获取。

---

## 上游 API 速查表

| Provider           | API URL                                                            | 方法 | Auth 方式      |
| ------------------ | ------------------------------------------------------------------ | ---- | -------------- |
| Claude             | `https://api.anthropic.com/api/oauth/usage`                        | GET  | Bearer $TOKEN$ |
| Claude Profile     | `https://api.anthropic.com/api/oauth/profile`                      | GET  | Bearer $TOKEN$ |
| Codex              | `https://chatgpt.com/backend-api/wham/usage`                       | GET  | Bearer $TOKEN$ |
| Gemini Code Assist | `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`    | POST | Bearer $TOKEN$ |
| Gemini Quota       | `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` | POST | Bearer $TOKEN$ |
| Antigravity        | `/v0/management/usage`                                             | GET  | CPA mgmt key   |
| Kimi               | `https://api.kimi.com/coding/v1/usages`                            | GET  | Bearer $TOKEN$ |
| Vertex             | 未实现 — Google Cloud 配额走 Service Usage API                     | —    | —              |

---

## 配置控制

`data/config.toml` 中的 `[monitor]` 段控制是否采集各 provider：

```toml
[monitor]
codex = true
claude = true
gemini = true
```

`[refresh]` 段控制刷新间隔（分钟）：

```toml
[refresh]
cpa = 30  # 默认 30 分钟
```

---

## 关键代码位置

| 文件               | 行号      | 内容                                          |
| ------------------ | --------- | --------------------------------------------- |
| `src/api.py`       | 725-728   | CPA-Manager 连接配置                          |
| `src/api.py`       | 730-750   | 上游 API URL 和 Header 常量                   |
| `src/api.py`       | 752-775   | `_cpa_api_call()` — 代理调用封装              |
| `src/api.py`       | 778-787   | `_cpa_fetch_auth_files()` — 获取 token 列表   |
| `src/api.py`       | 790-842   | `_cpa_parse_codex_quota()` — Codex 响应解析   |
| `src/api.py`       | 844-883   | `_cpa_parse_claude_quota()` — Claude 响应解析 |
| `src/api.py`       | 885-940   | `_cpa_parse_gemini_quota()` — Gemini 响应解析 |
| `src/api.py`       | 1010-1018 | `refresh_cpa()` — HTTP 端点入口               |
| `src/api.py`       | 1020-1040 | `_refresh_cpa_worker()` — 后台刷新 worker     |
| `src/api.py`       | 1042-1110 | `_refresh_cpa_inner()` — 核心刷新逻辑         |
| `data/config.toml` | —         | `[monitor]` 和 `[refresh]` 配置               |

---

## 单独拉取能力

### 结论

CPA 支持按 provider 或按单个账号单独拉取数据，但当前 ai_monitor 未暴露此能力。

### 现状

`GET /api/refresh/cpa` 是全量端点——拉取所有 auth 文件、遍历所有 provider，一次性写入 DB。唯一的过滤手段是 `config.toml` 的 `[monitor]` 段，按 provider 整体开关，不能指定单个账号。

### 底层函数已支持单账号粒度

| 函数                                                     | 作用                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `_cpa_fetch_auth_files()`                                | 获取所有 auth 文件列表（含 provider、auth_index、name、disabled） |
| `_cpa_parse_codex_quota(auth_index, email, plan_suffix)` | 拉取 **一个** Codex 账号                                          |
| `_cpa_parse_claude_quota(auth_index, email)`             | 拉取 **一个** Claude 账号                                         |
| `_cpa_parse_gemini_quota(auth_index, email)`             | 拉取 **一个** Gemini 账号                                         |

实现「拉取所有 Codex」或「拉取指定 Codex 账号」只需：

1. 调 `_cpa_fetch_auth_files()` 拿到 auth 文件列表
2. 按 provider 过滤（`provider == "codex"`）
3. 可选：按 `auth_index` 进一步过滤到单个账号
4. 调对应的 `_parse_xxx_quota(auth_index, email, ...)`

### CPA-Manager API 天然支持

- `/v0/management/auth-files` 返回的列表包含 `provider` 和 `auth_index`，客户端可自行过滤
- `/v0/management/api-call` 用 `auth_index` 标识具体账号，天然支持单账号请求
- 服务端的 `_monitor_enabled()` 过滤不影响 API 能力

### 插件设计建议

CPA 插件可支持三种模式：

| 模式             | 触发方式                           | 行为                         |
| ---------------- | ---------------------------------- | ---------------------------- |
| 全量（默认）     | 无额外参数                         | 拉取所有 provider 的所有账号 |
| 按 provider 过滤 | 参数 `monitor_codex=false`         | 跳过不需要的 provider        |
| 按账号过滤       | 参数 `auth_index_filter=codex-xxx` | 只拉指定 auth_index 的账号   |

---

## 复用这套方法的步骤

如果你想在另一个项目中实现同样的 CPA 额度获取：

1. **连接 CPA-Manager**：用 `_CPA_MGMT_URL` 和 `_CPA_MGMT_KEY` 调用 `/v0/management/auth-files`
2. **遍历 auth 文件**：按 `provider` 字段分发，跳过 `disabled` 的
3. **代理调用**：通过 `/v0/management/api-call` 转发请求，header 里的 `$TOKEN$` 是占位符
4. **解析响应**：三个 provider 格式不同，参考上面各节
5. **存储**：将 `(key_name, plan_type, used_percent, remaining, next_reset_time, timestamp)` 写入数据库
6. **控制采集**：通过配置开关控制哪些 provider 参与刷新
