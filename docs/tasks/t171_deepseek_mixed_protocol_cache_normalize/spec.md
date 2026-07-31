# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`claude-reader.ts` 的 `is_openai_semantic_model()` 目前按模型名（`deepseek` / `longcat`）一刀切地做 `input -= cache_read` 归一化。该归一化只对「经 OpenAI 协议接入」的调用成立：OpenAI 的 `prompt_tokens` 含 `cached_tokens`，new-api 透传后 `input_tokens` 含 `cache_read_input_tokens`，需减去以避免命中率公式双重计数。

但同一 deepseek 模型在用户环境里**并存两种接入**：一部分走 OpenAI 协议（需归一化），一部分走 Anthropic 原生协议（`input_tokens` 与 `cache_read_input_tokens` 互斥，**不能**减）。按模型名一刀切会把 Anthropic 接入那部分的真实 input 重复扣掉，导致 token 总量偏低、命中率虚高。longcat 全部走 OpenAI 协议，维持现状即可。

判断依据应是「这次调用走的协议」，而非模型名。可观察信号：OpenAI 协议无 `cache_creation_input_tokens` 字段，透传恒为 0；Anthropic 原生在有缓存写入时该值 > 0。故 `cache_creation_input_tokens > 0` 是「该行必为 Anthropic 接入」的充分判据。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `claude-reader.ts` 中 deepseek 模型 cache 归一化逻辑：从「按模型名一律减」改为「按行信号判断协议后决定是否减」。
- 同步更新归一化条件的注释与相关研究/蓝图文档表述（若语义变化）。
- longcat 维持「一律按 OpenAI 语义归一化」不变。

### 非范围

- 不改 longcat 的归一化行为。
- 不引入按 session/账号的接入协议配置项（方案 B/C 不在本 task）。
- 不改 token 命中率公式、聚合层、UI 展示。
- 不处理 deepseek/longcat 以外模型的 cache 语义。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 对一条 deepseek 记录，当 `cache_creation_input_tokens > 0`（Anthropic 接入信号）时，`input_tokens` 不被扣减，采集结果保留原始 input 值。
- [ ] 对一条 deepseek 记录，当 `cache_creation_input_tokens == 0` 且 `cache_read_input_tokens > 0` 且 `input_tokens >= cache_read_input_tokens`（OpenAI 接入信号）时，`input_tokens` 被减去 `cache_read_input_tokens`。
- [ ] longcat 记录无论 `cache_creation_input_tokens` 取值，仍按原逻辑归一化（行为不变）。
- [ ] 归一化后的 session/daily/records 三类输出在两种 deepseek 接入混合的输入下，input 总量等于「OpenAI 行已减 + Anthropic 行未减」之和，不再按模型名统一扣减。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试。可用构造的 JSONL fixture 单测覆盖（`tests/unit/main/core/token-stats/claude-reader.test.ts` 已有同类用例模式）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 构造 deepseek 模型两类 JSONL 行：`cache_creation_input_tokens > 0`（拟 Anthropic 接入）与 `cache_creation == 0 且 cache_read > 0`（拟 OpenAI 接入），断言各自 input 是否被扣减。
- 构造 longcat 行回归，断言归一化行为不变。
- 混合输入下断言 session/daily/records 的 input 总量为两者分别处理后的和。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 「`cache_creation_input_tokens > 0` ⇒ 该 deepseek 调用必为 Anthropic 原生接入」与「OpenAI 接入的 deepseek 其 `cache_creation_input_tokens` 恒为 0」是否在所有真实行上成立：`UNVERIFIED-SPIKE`，执行期取用户真实的两类接入 deepseek JSONL 各数条，检查 `cache_creation_input_tokens` / `cache_read_input_tokens` / `input_tokens` 的实际分布验证；若发现 OpenAI 接入也能产生 `cache_creation > 0`，需改用别的区分信号并重估方案。

### 风险与回退

- 风险：区分信号在真实数据上不成立（见未知契约），或存在两种信号都缺失的 deepseek 行（纯读缓存、从不写缓存的 Anthropic 会话），导致无法与 OpenAI 区分而误减。
- 回退：归一化逻辑集中于 `is_openai_semantic_model` 调用点与条件判断，回退即恢复按模型名判断；改动范围小，git revert 即可。

### 依赖与约束

- 依赖真实两类接入的 deepseek JSONL 样本（用户提供或执行期从本机 `~/.claude/projects` 定位）以完成 UNVERIFIED-SPIKE 核实。
- 仅改 `src/main/core/token-stats/` 与其单测；不动聚合/UI。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：若 cache 归一化语义有权威表述，同步更新。
- `docs/findings.md`：写入「deepseek 混合接入按 `cache_creation_input_tokens` 区分协议」这一已验证事实（核实后）。
