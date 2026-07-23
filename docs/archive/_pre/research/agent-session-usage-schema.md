# Agent 会话数据格式（交集 Schema）

每条记录代表一条消息（用户或 assistant 的一次模型调用），并内联了它所属会话（session）的信息。
该格式是 Claude Code 与 OpenCode 两种 AI 编程工具本地记录的数据交集，共 17 个顶层字段 + 内容块结构。

## JSON Schema

```json
{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "AgentSessionMessage",
    "type": "object",
    "required": ["session_id", "message_id", "role", "timestamp", "content"],
    "properties": {
        "session_id": {
            "type": "string",
            "description": "会话唯一标识（UUID）。一次连续对话的 ID；子代理消息与主会话共享同一 ID"
        },
        "title": { "type": ["string", "null"], "description": "会话标题，概括这次对话在做什么" },
        "directory": {
            "type": ["string", "null"],
            "description": "会话的工作目录（项目路径），逐条消息均携带"
        },
        "slug": {
            "type": ["string", "null"],
            "description": "会话的短可读别名（自动生成的单词组合，用于分享链接等）"
        },
        "version": {
            "type": ["string", "null"],
            "description": "运行该会话的 Agent 版本号，如 2.1.177"
        },
        "parent_session_id": {
            "type": ["string", "null"],
            "description": "父会话 ID。子代理会话指向其父会话，主会话为 null"
        },
        "message_id": { "type": "string", "description": "本条消息的唯一 ID" },
        "parent_message_id": {
            "type": ["string", "null"],
            "description": "父消息 ID，消息之间构成树状结构（分支/回滚时非线性）"
        },
        "role": {
            "type": "string",
            "enum": ["user", "assistant"],
            "description": "消息角色；只有 assistant 消息携带 usage"
        },
        "timestamp": { "type": "integer", "description": "本条消息创建时间，Unix 毫秒时间戳" },
        "model": {
            "type": ["string", "null"],
            "description": "本次调用实际使用的模型名，如 deepseek-v4-pro；仅 assistant 消息有，同一会话中途可切换"
        },
        "stop_reason": {
            "type": ["string", "null"],
            "description": "本次调用的结束原因（如 stop / tool_use），仅 assistant 消息有"
        },
        "input_tokens": {
            "type": ["integer", "null"],
            "minimum": 0,
            "description": "本次调用的输入 token 数（不含缓存）；仅 assistant 消息有"
        },
        "output_tokens": {
            "type": ["integer", "null"],
            "minimum": 0,
            "description": "本次调用的输出 token 数；仅 assistant 消息有"
        },
        "cache_read_tokens": {
            "type": ["integer", "null"],
            "minimum": 0,
            "description": "本次调用命中缓存的输入 token 数（计费更低）；仅 assistant 消息有"
        },
        "cache_write_tokens": {
            "type": ["integer", "null"],
            "minimum": 0,
            "description": "本次调用写入缓存的 token 数；仅 assistant 消息有"
        },
        "content": {
            "type": "array",
            "description": "消息内容块，按顺序排列",
            "items": {
                "type": "object",
                "required": ["type"],
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["text", "reasoning", "tool"],
                        "description": "text=正文；reasoning=思考过程；tool=工具调用"
                    },
                    "text": {
                        "type": "string",
                        "description": "type 为 text/reasoning 时的文本内容"
                    },
                    "name": {
                        "type": "string",
                        "description": "type 为 tool 时的工具名，如 bash / read / edit"
                    },
                    "call_id": {
                        "type": "string",
                        "description": "type 为 tool 时的本次工具调用 ID"
                    }
                }
            }
        }
    }
}
```

## 字段速查

| 字段                 | 类型              | 含义                                         |
| -------------------- | ----------------- | -------------------------------------------- |
| `session_id`         | string            | 会话唯一标识（UUID）；子代理消息与主会话共享 |
| `title`              | string \| null    | 会话标题                                     |
| `directory`          | string \| null    | 会话的工作目录（项目路径）                   |
| `slug`               | string \| null    | 会话短可读别名                               |
| `version`            | string \| null    | Agent 版本号                                 |
| `parent_session_id`  | string \| null    | 父会话 ID；主会话为 null                     |
| `message_id`         | string            | 本条消息的唯一 ID                            |
| `parent_message_id`  | string \| null    | 父消息 ID，消息构成树状结构                  |
| `role`               | user \| assistant | 消息角色；仅 assistant 携带 token 用量       |
| `timestamp`          | integer           | 消息创建时间，Unix 毫秒时间戳                |
| `model`              | string \| null    | 实际使用的模型名（仅 assistant）             |
| `stop_reason`        | string \| null    | 调用结束原因（仅 assistant）                 |
| `input_tokens`       | integer \| null   | 输入 token 数（不含缓存，仅 assistant）      |
| `output_tokens`      | integer \| null   | 输出 token 数（仅 assistant）                |
| `cache_read_tokens`  | integer \| null   | 命中缓存的输入 token 数（仅 assistant）      |
| `cache_write_tokens` | integer \| null   | 写入缓存的 token 数（仅 assistant）          |
| `content`            | array             | 消息内容块（见下）                           |

**content 内容块**（三种类型，按顺序组成完整消息）：

| type        | 字段              | 含义                             |
| ----------- | ----------------- | -------------------------------- |
| `text`      | `text`            | 正文文本（用户提问或 AI 回复）   |
| `reasoning` | `text`            | 思考/推理过程                    |
| `tool`      | `name`, `call_id` | 一次工具调用（工具名 + 调用 ID） |

## 示例数据

```json
{
    "session_id": "633728fc-625a-44d9-8882-cd9f74cdb041",
    "title": "实现 token 统计页面",
    "directory": "/home/testuser/omni_eval",
    "slug": "brave-fox-jumps",
    "version": "2.1.177",
    "parent_session_id": null,
    "message_id": "4c511af4-a0e3-40d9-b8c5-902a16fac60a",
    "parent_message_id": "87c51ce6-bba3-476a-b7ab-22d6b20a3b1a",
    "role": "assistant",
    "timestamp": 1752579016835,
    "model": "deepseek-v4-pro",
    "stop_reason": "tool_use",
    "input_tokens": 20498,
    "output_tokens": 512,
    "cache_read_tokens": 183000,
    "cache_write_tokens": 0,
    "content": [
        { "type": "reasoning", "text": "用户要求实现按目录过滤的统计……" },
        { "type": "text", "text": "我先查看现有的查询接口。" },
        { "type": "tool", "name": "read", "call_id": "call_00_Zr408VPcheGbVzPX1zeb1974" }
    ]
}
```

## 聚合口径

- 一个 `session_id` 对应多条消息记录；assistant 记录的 token 字段按 `session_id` 累加得会话总用量。
- 按 `timestamp` 划天 × `model` 分组，得每日每模型用量。
- 按 `directory` 分组，得每个工作目录（项目）的用量。
- 按 `parent_session_id` / `parent_message_id` 可还原会话树与消息树。

## 不在交集中的字段（单边特有）

| 字段                                    | 仅存在于       | 说明                                                        |
| --------------------------------------- | -------------- | ----------------------------------------------------------- |
| `gitBranch`                             | Claude Code    | 会话所在 git 分支                                           |
| `userType` / `entrypoint` / `requestId` | Claude Code    | 用户类型 / 启动入口 / 请求 ID                               |
| `cost`                                  | OpenCode       | 每次调用的成本（美元）                                      |
| `tokens.reasoning`                      | OpenCode       | 思考 token 单列（交集里 reasoning 只有文本，没有 token 数） |
| `providerID` / `agent` / `mode`         | OpenCode       | 供应商 / 子代理名 / 运行模式                                |
| `summary_additions/deletions/files`     | OpenCode       | 会话代码增删行统计                                          |
| 工具调用的输入参数与执行结果细节        | 双方格式差异大 | 两边都有，但结构不一致，未纳入交集                          |
