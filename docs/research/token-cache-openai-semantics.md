# OpenAI 格式接入模型的 cache 字段语义归一化

## 结论

经 new-api 以 **OpenAI 协议**接入的模型（`deepseek-v4-pro` / `LongCat-2.0`），其响应中的 `input_tokens` **包含了** `cache_read_input_tokens`，与 Anthropic 原生语义（两者互斥）不同。`claude-reader` 在采集时对这些模型按条件做 `input -= cache_read` 归一化，使其与 Anthropic 原生语义模型在命中率公式下可比。

**触发条件**：模型名匹配 `deepseek` 或 `longcat`（不区分大小写），且 `input >= cache_read > 0`。

## 背景

用户反馈：`deepseek-v4-pro` 与 `LongCat-2.0` 在面板上长期显示 ~37% 缓存命中率，远低于同期使用的 `mimo-v2.5-pro`（97.7%）、`glm-5.2`（92.3%）。所有模型都通过同一个 new-api 网关接入 Claude Code 使用。

数据库实测（`token_stats_records`，2026-06-15 ~ 2026-07-19）：

| 模型                | input_tokens | cache_read | 面板命中率 | read/input |
| ------------------- | ------------ | ---------- | ---------- | ---------- |
| mimo-v2.5-pro       | 64M          | 2.68B      | 97.7%      | 42         |
| glm-5.2             | 330M         | 3.98B      | 92.3%      | 12         |
| claude-opus-4-8     | 8M           | 908M       | 99.1%      | 109        |
| **deepseek-v4-pro** | 4.84B        | 3.15B      | **39.4%**  | **0.65**   |
| **LongCat-2.0**     | 702M         | 425M       | **37.7%**  | **0.60**   |

`read/input < 1` 是反常信号：长会话历史大量命中缓存时，未缓存 input 应远小于 cache_read，read/input 通常远大于 1（见 `token-cache-reliability.md`）。

## 根因：两种协议的 cache 字段语义不同

| 含义       | Anthropic 协议                | OpenAI 协议                                                       |
| ---------- | ----------------------------- | ----------------------------------------------------------------- |
| 未缓存输入 | `input_tokens`                | —（无对应字段）                                                   |
| 命中缓存   | `cache_read_input_tokens`     | `prompt_tokens_details.cached_tokens` / `prompt_cache_hit_tokens` |
| 写入缓存   | `cache_creation_input_tokens` | —（自动缓存，无此字段）                                           |
| **总输入** | `input + cache_read`          | **`prompt_tokens`（= hit + miss，含 cached）**                    |

**关键差异**：

- Anthropic：`input_tokens` 与 `cache_read_input_tokens` **互斥**，input 不含 cache_read。
- OpenAI：`prompt_tokens` **含** `cached_tokens`，cached 是 prompt 的子集。

new-api 在把 OpenAI 上游响应转换成 Anthropic 格式返回给 Claude Code 时，把 `prompt_tokens` 直接塞进 `input_tokens`、`cached_tokens` 塞进 `cache_read_input_tokens`，**没有做 `input_tokens = prompt_tokens - cached_tokens` 的语义修正**。`cache_creation_input_tokens` 因 OpenAI 协议无此字段，始终透传为 0。

## 实测证据

### 1. opencode zen 直连 deepseek-v4-pro（OpenAI 协议，5 次相同 prompt）

```
#1: prompt=38083 cached=38016 hit=38016 miss=67 (99.8%)
#2: prompt=38083 cached=38016 hit=38016 miss=67 (99.8%)
```

`prompt_tokens=38083` 全程不变（含 cached），`hit+miss=38083`。OpenAI 语义。

### 2. new-api（Anthropic 协议）deepseek-v4-pro（5 次 cache_control: ephemeral）

```
#1: input=38083 write=0 read=0      ← 未命中
#2: input=38083 write=0 read=38016  ← 命中，但 input 没扣除
#3: input=38083 write=0 read=38016
```

命中后 `input_tokens` 仍是 38083（含 cache_read 的全量），`cache_creation` 永远 0。new-api 转换时未扣除。

### 3. new-api（Anthropic 协议）mimo-v2.5-pro（Anthropic 原生接入，对照）

```
#1: input=43901 write=undefined read=undefined
#2: input=61      read=43840     ← input 已扣除 cache_read
```

mimo 是 Anthropic 原生语义：命中后 input 从 43901 掉到 61。这是 reader 公式假设的正确语义。

## 因果链

```
deepseek/longcat 上游以 OpenAI 协议被 new-api 接入
  → 上游 prompt_tokens 含 cached_tokens
  → new-api 转 Anthropic 响应时未扣除
  → Claude Code session jsonl 里的 input_tokens 含 cache_read
  → reader 原样采集
  → hitRateOf = read/(input+read) 双重计数，分母膨胀
  → 真实 ~65% 显示成 37%，上限锁死 50%
```

`hitRateOf`（`src/renderer/lib/token-stats/aggregate.ts`）公式 `cache_read / (input + cache_read)` 假设 input 与 cache_read 互斥。OpenAI 语义下 input 已含 cache_read，分母被算两遍，所以面板上 OpenAI 语义模型的命中率上限被锁在 50%。

## 归一化方案

在 `claude-reader.ts` 采集到 `inp` / `cache_read` 后、累加到 sums/daily/records 之前，对已知 OpenAI 语义模型按条件改写：

```ts
// OpenAI 协议接入的模型，input_tokens 含 cache_read（见本文件根因章节）
if (is_openai_semantic_model(rec_model) && cache_read > 0 && inp >= cache_read) {
    inp = inp - cache_read;
}
```

**为什么是这两个模型**：用户的 new-api 配置里只有 `deepseek-v4-pro` 与 `LongCat-2.0` 以 OpenAI 格式接入，其余模型（mimo/glm/grok/kimi 等）走 Anthropic 原生协议，字段语义本就正确。后续若新增 OpenAI 格式接入的模型，扩展 `is_openai_semantic_model` 的匹配规则即可。

**为什么需要三个条件同时满足**：

| 条件                      | 作用                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| 模型匹配 deepseek/longcat | 把改动限定在已知 OpenAI 语义的模型，零误伤其他模型                      |
| `cache_read > 0`          | 未命中时（read=0）原始 input 就是"未缓存输入"，与两种语义一致，不需改写 |
| `inp >= cache_read`       | 防御：极端情况下若 read > input，扣除会得到负数，跳过保留原值           |

## 误判分析

单条记录层面，OpenAI 语义"全命中"（input ≈ read）与 Anthropic 语义"低命中率"（未缓存 > 已缓存，即 input > read）在字段关系上看起来一样。本方案靠**模型白名单**规避这个歧义：

- 白名单内（deepseek/longcat）：按 OpenAI 语义处理，正确恢复 65% 真实命中率。
- 白名单外：完全不动，保留 Anthropic 原生语义。即使某个原生模型出现 `input >= read`（低命中率长 user 输入场景），统计也保持原始语义不变。

**聚合层面的副作用验证**：数据库里所有 Anthropic 原生接入模型（mimo/glm/opus/gpt 等）的聚合 `read/input` 都远大于 1，归一化前后统计完全一致。详见根因章节表格。

## 修复前后对比

对 `deepseek-v4-pro` 数据库聚合值反算：

|                  | input               | cache_read | 命中率                         |
| ---------------- | ------------------- | ---------- | ------------------------------ |
| 修复前（原始）   | 4.84B               | 3.15B      | 39.4%（read/(input+read)）     |
| 修复后（归一化） | 1.69B（=4.84-3.15） | 3.15B      | **65.1%**（read/(input+read)） |

65.1% 与 zen 直连实测的 99.8% 仍有差距——这部分是真实差距，源于 Claude Code 实际使用中 system prompt / 工具结果 / 对话历史每次略变导致的部分未命中，与统计归一化无关。

## 受影响模型

- `deepseek-v4-pro`（deepseek 系列）
- `LongCat-2.0`（longcat 系列）

匹配规则：模型名（不区分大小写）包含 `deepseek` 或 `longcat`。

## 相关代码

- 采集归一化：`src/main/core/token-stats/claude-reader.ts`（`scan_session_jsonls` 内 assistant 消息读取处）
- 命中率公式：`src/renderer/lib/token-stats/aggregate.ts` `hitRateOf`
- 字段语义总览：`docs/research/token-cache-reliability.md`
