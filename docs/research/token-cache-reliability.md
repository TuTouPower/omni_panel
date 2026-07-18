# Token cache 字段语义与采集

## 结论

`cache_read_tokens` / `cache_write_tokens` **采集入库并计入总 Token**，缓存命中率正常展示。

总 Token = `input + output + cache_read + cache_write`。
命中率 = `cache_read / (cache_read + input)`。

## 字段语义（Anthropic 标准，Claude Code 与 OpenCode 一致）

- `input_tokens`：本次请求**未命中缓存**的输入 token。
- `cache_read_input_tokens`：本次请求**命中缓存**的输入 token（计费 0.1x）。
- 两者**互斥**，总输入 = `input + cache_read`。**input 不含 cache_read**。

OpenCode session 表 `tokens_input` / `tokens_cache_read` 同样分两列；实测 `sum(step-finish.input)` 精确 == `tokens_input`、`sum(step-finish.cache_read)` == `tokens_cache_read`，step-finish 的 tokens 是逐次增量（非累积）。

## "input < cache_read" 是正常的

长会话历史大量命中缓存，单步新增 input 小、cache_read 大，`input < cache_read` 普遍。实测 WSL Claude Code 155213 条 assistant 记录，66727 条 `input < cache_read`。分模型：

| 模型            | input | cache_read | input<cache_read 占比 | 命中率 |
| --------------- | ----- | ---------- | --------------------- | ------ |
| claude-opus-4-8 | 7.09M | 806.94M    | 92%                   | 99.1%  |
| claude-fable-5  | 1.06M | 136.24M    | 91%                   | 99.2%  |
| glm-5.2         | 89M   | 2.77B      | 83%                   | 96.9%  |
| mimo-v2.5-pro   | 42M   | 1.48B      | 48%                   | 97.2%  |
| gpt-5.6-sol     | 549M  | 1.40B      | 46%                   | 71.8%  |
| deepseek-v4-pro | 4.57B | 3.17B      | 13%                   | 40.9%  |

这是缓存命中率高（长会话历史复用）的正常表现，**不是字段紊乱**。

## 历史误判（已纠正）

本仓库早期版本曾把 `input < cache_read` 误判为「proxy 字段紊乱」，停采 cache 并移除命中率，导致面板 token 严重低估（claude-opus 实际总输入 814M，面板只显示 7M input + 3.46M output ≈ 10M，漏 99%）。现已恢复 cache 采集与命中率展示。

cache_read 是真实 token 消耗（按缓存价计费），必须计入总量；只有把它加回去，面板才与 Claude Code `/stats`、OpenCode `/cost` 的 In+cache 口径对得上。
