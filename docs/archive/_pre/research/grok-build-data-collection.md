# Grok-build 本地数据采集

## 数据来源

Grok-build 本地数据存储在 `~/.grok/`，session 数据按 workspace 分目录：

```
~/.grok/sessions/{url_encoded_workspace}/{session_id}/
```

workspace 路径经过 URL 编码，如 `%2Fhome%2Ftestuser%2Fgithub_repo` 对应 `/home/testuser/github_repo`。

日志统一存储在 `~/.grok/logs/unified.jsonl`。

## Token 用量数据

**Grok-build 本地不记录 per-turn token 用量。**

排查结果：

|数据源|内容|能否用于统计|
|---|---|---|
|`sessions/*/updates.jsonl` 的 `_meta.totalTokens`|每次请求时的累积上下文大小|否，是 context window 占用，非消费量|
|`logs/unified.jsonl` 的 `billing: fetched credits config`|`creditUsagePercent`（当前周期用量百分比）|否，只有百分比，无绝对值|
|`logs/unified.jsonl` 的 `turn.complete`|`elapsed_ms`（回合耗时）|否，无 token 计数|
|`sessions/*/events.jsonl`|phase_changed、tool 事件|否|
|`sessions/*/summary.json`|session 元信息（model、agent、cwd）|否|

## 可用数据

### Session 元信息（summary.json）

```json
{
    "info": {
        "id": "019f60f4-0984-7430-8e6e-15d579c7d369",
        "cwd": "/home/testuser/github_repo"
    },
    "current_model_id": "grok-4.5",
    "agent_name": "grok-build-plan",
    "reasoning_effort": "high",
    "num_messages": 119,
    "created_at": "2026-07-14T14:07:13.799582304Z"
}
```

### Billing 概览（unified.jsonl）

```json
{
    "creditUsagePercent": 12.0,
    "currentPeriod": {
        "type": "USAGE_PERIOD_TYPE_WEEKLY",
        "start": "2026-07-13T23:10:25.819831+00:00",
        "end": "2026-07-20T23:10:25.819831+00:00"
    },
    "subscriptionTier": "SuperGrok"
}
```

### 回合耗时（unified.jsonl）

```json
{
    "msg": "turn.complete",
    "ctx": {
        "elapsed_ms": 9168,
        "ok": true
    }
}
```

### 累积上下文大小（updates.jsonl）

`_meta.totalTokens` 字段记录每次请求发送时的上下文窗口 token 数，随对话增长递增，不是 per-turn 消费量。

## 结论

无法从本地数据重建 per-turn token 用量。若需统计 Grok-build token 消费，需依赖 billing API 或服务端数据。
