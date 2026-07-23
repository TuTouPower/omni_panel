# Kimi Code 本地数据采集

## 数据来源

Kimi Code 将每个 session 的 wire protocol 通信记录存储为 JSONL 文件：

```
~/.kimi-code/sessions/{workspace_id}/{session_id}/agents/main/wire.jsonl
```

平台实际路径：

- Windows: `C:/Users/{user}/.kimi-code/sessions/`
- WSL: `//wsl.localhost/{distro}/home/{user}/.kimi-code/sessions/`

两种平台的目录结构和 JSONL 格式完全一致。

- `workspace_id`：按工作目录生成的标识，如 `wd_omni_usage_65437ac9a9d1`
- `session_id`：UUID，如 `session_fd3948ee-658e-4bd0-88cf-d66fe05a1b97`

session 索引文件 `~/.kimi-code/session_index.jsonl` 记录 session 到工作目录的映射关系。

## 采集方式

遍历 `~/.kimi-code/sessions/*/session_*/agents/main/wire.jsonl`，逐行解析 JSON。

session_id 从目录路径中提取。workspace 与工作目录的对应关系从 `session_index.jsonl` 读取。

## 数据格式

### Token 用量（usage.record）

```json
{
    "type": "usage.record",
    "model": "kimi-code/k3",
    "usage": {
        "inputOther": 3464,
        "output": 52,
        "inputCacheRead": 17920,
        "inputCacheCreation": 0
    },
    "usageScope": "turn",
    "time": 1784217963778
}
```

| 字段                       | 类型    | 说明                                                     |
| -------------------------- | ------- | -------------------------------------------------------- |
| `model`                    | string  | 模型标识，如 `kimi-code/k3`、`kimi-code/kimi-for-coding` |
| `usage.inputOther`         | integer | 未命中缓存的 input tokens                                |
| `usage.output`             | integer | output tokens                                            |
| `usage.inputCacheRead`     | integer | 缓存命中的 input tokens                                  |
| `usage.inputCacheCreation` | integer | 缓存写入的 input tokens                                  |
| `usageScope`               | string  | 作用域，目前观察到的值为 `turn`                          |
| `time`                     | integer | epoch 毫秒时间戳                                         |

### 助手内容（context.append_loop_event → content.part）

助手的文本输出和推理过程分布在 `content.part` 事件中：

```json
{
    "type": "context.append_loop_event",
    "event": {
        "type": "content.part",
        "uuid": "4c9da67b-8b34-4bb4-a592-8c48e58e0ddd",
        "turnId": "0",
        "step": 14,
        "stepUuid": "f5554671-26fd-4330-8553-09d3464e26be",
        "part": {
            "type": "text",
            "text": "助手的回复内容..."
        }
    }
}
```

```json
{
    "type": "context.append_loop_event",
    "event": {
        "type": "content.part",
        "uuid": "8793bc80-d767-48f3-a235-19a25f4700a0",
        "turnId": "0",
        "step": 1,
        "stepUuid": "372bb7d4-6b40-475c-b142-ef475acc1f32",
        "part": {
            "type": "think",
            "think": "用户的意图是..."
        }
    }
}
```

| part.type | 字段         | 说明          |
| --------- | ------------ | ------------- |
| `text`    | `part.text`  | 助手回复文本  |
| `think`   | `part.think` | 推理/思考过程 |

### 用户消息（context.append_message）

```json
{
    "type": "context.append_message",
    "message": {
        "role": "user",
        "content": [{ "type": "text", "text": "用户输入..." }],
        "origin": { "kind": "user" }
    }
}
```

### 回合结束与 stop_reason（step.end）

```json
{
    "type": "context.append_loop_event",
    "event": {
        "type": "step.end",
        "uuid": "372bb7d4-6b40-475c-b142-ef475acc1f32",
        "turnId": "0",
        "step": 1,
        "usage": {
            "inputOther": 3464,
            "output": 52,
            "inputCacheRead": 17920,
            "inputCacheCreation": 0
        },
        "finishReason": "tool_use",
        "llmFirstTokenLatencyMs": 1711,
        "llmStreamDurationMs": 449,
        "llmServerFirstTokenMs": 1708,
        "llmServerDecodeMs": 448
    }
}
```

| 字段                     | 说明                                          |
| ------------------------ | --------------------------------------------- |
| `finishReason`           | stop_reason，如 `tool_use`                    |
| `usage`                  | 该 step 的 token 用量（同 usage.record 格式） |
| `llmFirstTokenLatencyMs` | 首 token 延迟                                 |
| `llmStreamDurationMs`    | 流式传输总耗时                                |
| `llmServerFirstTokenMs`  | 服务端首 token 耗时                           |
| `llmServerDecodeMs`      | 服务端解码耗时                                |

### LLM 请求（llm.request）

```json
{
    "type": "llm.request",
    "model": "kimi-for-coding",
    "provider": "kimi",
    "modelAlias": "kimi-code/kimi-for-coding",
    "messageCount": 1,
    "kind": "loop"
}
```

`provider` 字段直接可用，不需要从 model 名推断。

### 映射到 usage_turn

| usage_turn 字段               | Kimi Code 来源                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `provider`                    | `llm.request.provider`                                                                           |
| `model`                       | `usage.record.model`                                                                             |
| `input_tokens`                | `usage.inputOther`                                                                               |
| `output_tokens`               | `usage.output`                                                                                   |
| `cache_read_input_tokens`     | `usage.inputCacheRead`                                                                           |
| `cache_creation_input_tokens` | `usage.inputCacheCreation`                                                                       |
| `total_tokens`                | 手算：`inputOther + inputCacheRead + inputCacheCreation + output`                                |
| `usage_timestamp`             | `usage.record.time` 转换为 DATETIME                                                              |
| `content`                     | `content.part` 事件，`event.part.type == "text"` → `event.part.text`                             |
| `reasoning`                   | `content.part` 事件，`event.part.type == "think"` → `event.part.think`                           |
| `stop_reason`                 | `step.end` 事件，`event.finishReason`                                                            |
| `role`                        | user 消息：`context.append_message.message.role`；assistant 内容：从 `content.part` 事件类型推断 |
| `parent_message_id`           | 无。有 `event.uuid` 和 `event.stepUuid` 可做内部关联                                             |

### 当前模型

| model 标识                            | 显示名                | 上下文窗口 |
| ------------------------------------- | --------------------- | ---------- |
| `kimi-code/k3`                        | K3                    | 1,048,576  |
| `kimi-code/kimi-for-coding`           | K2.7 Coding           | 262,144    |
| `kimi-code/kimi-for-coding-highspeed` | K2.7 Coding Highspeed | 262,144    |

配置来源：`~/.kimi-code/config.toml`，`[models."..."]` 段。
