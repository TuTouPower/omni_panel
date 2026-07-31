# Spike report

## 问题

deepseek 模型在用户环境并存两种上游取数协议（OpenAI 上游 `input` 含 `cache_read`，需归一化减去；Anthropic 上游两者互斥，不能减）。`claude-reader.ts` 现按模型名（`deepseek`/`longcat`）圈定归一化候选范围。需验证：

1. 能否用 `cache_creation_input_tokens > 0` 作为「该行为 Anthropic 接入」的区分信号（原方案 A 设想）。
2. 现有归一化守卫 `inp >= cache_read` 在真实混合协议数据上的判决正确率。

## 成功判据

- 给出真实 deepseek 行 `cache_creation_input_tokens` / `cache_read_input_tokens` / `input_tokens` 的分布。
- 判定 `cache_creation` 信号是否可用。
- 在已知协议切换时间窗的真实数据上，量化现有守卫的误判率。

## 尝试

- 扫描 Win `~/.claude/projects` 与 WSL `~/.claude/projects` 的 `**/*.jsonl`，提取 `type=assistant` 且 `model` 含 `deepseek` 的行，统计三字段分布与时间范围。脚本见 `code/analyze.py`。
- 核对 Win `~/.claude/settings.json` 的 `ANTHROPIC_BASE_URL`，确认传输层协议。
- 按用户提供的协议切换时间（2026-07-31，20:00 前 Anthropic、20:40 后 OpenAI，UTC+8）对 WSL 当日 deepseek-v4-flash 分窗，逐窗统计误判。

## 证据

数据源：Win `~/.claude/projects`（1508 jsonl）+ WSL `~/.claude/projects`（7242 jsonl）。脚本 `code/analyze.py`。

`ANTHROPIC_BASE_URL=https://new-api.kkkkyyyy.cn/`：所有请求经 new-api 以 Anthropic Messages 格式传输，JSONL 统一写 `input_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens` 三字段。**上游取数协议不在 JSONL 留痕**。

`cache_creation_input_tokens` 在所有 deepseek 行恒为 0（Win v4-flash 1117/1117、v4-pro 2223/2223；WSL v4-flash 4941/4941 均 `cc==0`），不存在「`cc>0` ⇒ Anthropic 接入」的正例。

WSL 2026-07-31 分窗判决（`code/analyze.py ~/.claude/projects 2026-07-31 20:00 20:40`，仅 `cr>0` 行参与误判统计）：

```text
deepseek-v4-flash {n=4941, cc==0=4941, input<cache_read=4351, input>=cache_read=326}
  [ANTH   <20:00] cr>0=4034  SUB=0    KEEP=4034  MISJUDGED=0
  [GAP 20:00-20:40] cr>0=508  SUB=191  KEEP=317   (协议切换过渡期，无正确基准)
  [OPENAI >=20:40] cr>0=135   SUB=135  KEEP=0    MISJUDGED=0
```

OpenAI 窗减法结果非负且合理：`inp - cache_read` 得 119–776 的新输入（个别 cr 突降的大输入行除外），无一行减成负数。

## 结论

1. **`cache_creation_input_tokens` 信号无效**。它在所有 deepseek 行恒为 0，无法据此分流。原方案 A 设想的命名信号不成立。
2. **现有守卫 `inp >= cache_read` 在已知协议窗口的真实混合数据上零误判**：Anthropic 互斥窗 4034 行全落 `inp<cr` 被正确拦下未减；OpenAI 含 cache 窗 135 行全落 `inp>=cr` 被正确减去。分流依据是 `input` 与 `cache_read` 的数值关系，而非模型名或 `cache_creation`。
3. 该数值判别对 OpenAI 语义是**数学恒真**的（OpenAI `prompt_tokens >= cached_tokens` 定义保证，故 OpenAI 行必满足 `inp>=cr`，必被减，漏判率 ≈0）。残余风险仅在 Anthropic 互斥语义行出现 `inp>=cr`（新输入超过缓存命中）时会误减；本机 4034 行互斥样本中该情形 0 次，实测误判率 0%，但理论非恒 0。
4. 限制：GAP 过渡期（20:00–20:40）new-api 上游正在切换，两种签名混出（191 SUB / 317 KEEP），无正确基准，不计误判。结论基于 deepseek-v4-flash 单日单模型；v4-pro 主体亦呈 `inp>=cr`（OpenAI 语义）被正确减。

## 是否采纳

- 决定：是（采纳「现行守卫行为已正确」结论，t171 范围随之收敛）
- 理由：deepseek 混合接入的归一化行为在现有数值守卫下实测零误判，无需改判断逻辑。t171 价值转为：为按行分流行为补测试锁定 + 修正 `is_openai_semantic_model` 命名/注释与文档中「按模型名一刀切」的误导表述（实际执行减法由 `inp >= cache_read` 守卫决定，模型名只圈候选范围），并在文档标注残余风险（互斥行 `inp>=cr` 时误减）的触发条件。
- 后续 task：t171
