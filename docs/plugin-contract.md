# 插件协议契约

> 基于 `docs/old-data-models.md` 和 `docs/old-behavior-map.md` 冻结。

## 插件文件格式

- TypeScript 源文件（`.ts`），UTF-8 编码
- 宿主用 esbuild 编译为单文件 JS（缓存按 source SHA-256 失效），再用 Electron 内置 Node 子进程执行（`process.execPath` + `ELECTRON_RUN_AS_NODE=1`）
- `_` 开头的文件名不作为插件（如 `_common.ts`）

## 元数据注释块

### 格式

```
# UsageBoardPlugin:
# {
#   ...
# }
# /UsageBoardPlugin
```

### 规则

- 宿主只读脚本前 **80 行**
- `UsageBoardPlugin:` 是开始标记（前缀匹配，忽略行首空白）
- `/UsageBoardPlugin` 是结束标记
- 每行宿主去除 `#` 注释前缀和紧随的一个空格（如有）
- 开始标记同行如有额外内容，也作为 JSON 一部分
- 开始和结束标记之间收集的文本拼接后做 JSON 解析
- **无 begin 或无 end → 解析失败返回 null，stderr 警告**
- **JSON 解析失败 → 静默返回 null**
- 多语言 key 格式：`name@zh-Hans`、`description@en` 等

### 元数据 JSON 结构

```json
{
    "name": "string (optional)",
    "name@zh-Hans": "string (optional)",
    "name@en": "string (optional)",
    "description": "string (optional)",
    "description@zh-Hans": "string (optional)",
    "description@en": "string (optional)",
    "icon": "string URL (optional)",
    "parameters": [
        {
            "name": "string (required)",
            "label": "string (required)",
            "label@zh-Hans": "string (optional)",
            "label@en": "string (optional)",
            "type": "string | secret | integer | boolean | choice | directory | file",
            "required": "boolean (required)",
            "placeholder": "string (optional)",
            "placeholder@zh-Hans": "string (optional)",
            "placeholder@en": "string (optional)",
            "defaultValue": "string (optional)",
            "options": [
                {
                    "label": "string (required)",
                    "label@zh-Hans": "string (optional)",
                    "label@en": "string (optional)",
                    "value": "string (required)"
                }
            ]
        }
    ]
}
```

## 参数传递

- 命令行格式：`--usageboard-param KEY=value`
- 仅传递用户已填写（非空）的参数值
- 宿主额外传入 `--usageboard-param USAGEBOARD_LANGUAGE=zh-Hans` 或 `en`
- 参数值均为字符串

## 插件 stdout JSON

### 成功输出

```json
{
    "schemaVersion": 1,
    "updatedAt": "2026-05-24T12:00:00Z",
    "items": [
        {
            "id": "string",
            "name": "string",
            "used": 50.0,
            "limit": 100.0,
            "displayStyle": "percent | ratio",
            "resetAt": "2026-06-01T00:00:00Z (optional)",
            "status": "normal | warning | critical | unknown",
            "color": "blue | green | yellow | orange | red (optional)"
        }
    ],
    "badge": "string (optional)",
    "chart": {
        "kind": "string",
        "period": "string",
        "bucketUnit": "hour | day",
        "buckets": [
            {
                "label": "string",
                "segments": [
                    {
                        "model": "string",
                        "tokens": 123.0
                    }
                ]
            }
        ],
        "message": "string (optional)"
    }
}
```

### 错误输出

```json
{
    "error": "error message string"
}
```

### 规则

- stdout 必须 trim 后可解析为 JSON
- `schemaVersion` 由 SDK helpers 输出，Electron 端忽略此字段
- `updatedAt` ISO8601 格式（支持 fractional seconds）
- `items` 可为空数组
- `badge` 和 `chart` 为 optional

## exit code 处理

| exit code | 处理                                                               |
| --------- | ------------------------------------------------------------------ |
| 0         | 解析 stdout JSON                                                   |
| 非零      | 错误。优先用 stderr 内容作为消息，stderr 为空则通用 exit code 消息 |

## timeout

- 默认 **15 秒**
- timeout 后 kill 子进程
- 返回 failed snapshot

## stderr 处理

- 正常执行（exit 0）：stderr 内容不展示给用户，仅调试
- 异常执行（exit != 0）：stderr 用作错误消息 fallback
- stderr 不等于失败

## 内置插件

### CPA 插件 (`cpa-usage-plugin.ts`)

通过 CPA-Manager 代理服务获取 5 个 provider 的配额数据：Claude、Codex、Gemini、Antigravity、Kimi。

- **依赖**：仅 Node stdlib（`fetch` 内置），无需任何第三方包
- **参数**：`cpa_mgmt_url`（string）、`cpa_mgmt_key`（secret）、5 个 `monitor_*`（boolean）开关
- **多 item 输出**：每个账号的每个配额周期输出一个 item（如 `claude:user@example.com:5小时`）
- **容错**：单个账号失败不阻塞其他账号，全部失败才输出 error JSON
- **Antigravity**：三个 URL 回退机制，自动尝试不同端点
- **Gemini**：两步请求（`loadCodeAssist` → `retrieveUserQuota`）
- 详细 API 规范见 `docs/cpa-quota-guide.md`
