# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`claude-reader.ts` 对 deepseek / longcat 模型做 cache 归一化：当 `cache_read > 0 且 inp >= cache_read` 时执行 `input -= cache_read`。该归一化只对「OpenAI 上游取数」的调用成立（OpenAI `prompt_tokens` 含 `cached_tokens`，new-api 透传后 `input_tokens` 含 `cache_read_input_tokens`，需减去以避免命中率公式双重计数）；对「Anthropic 上游取数」的调用两者互斥，**不能**减。

用户环境中同一 deepseek 模型并存两种上游协议。创建期设想用 `cache_creation_input_tokens > 0` 作 Anthropic 接入信号、按行改逻辑分流。执行期 spike（`docs/spikes/s004_deepseek_mixed_protocol_cache/report.md`）实测 Win+WSL 真实数据后推翻该信号：`cache_creation_input_tokens` 在全部 deepseek 行恒为 0。但同一 spike 证明：**现有守卫 `inp >= cache_read` 已对混合接入按行正确分流**——Anthropic 互斥窗 4034 行全落 `inp<cr` 被正确拦下未减，OpenAI 含 cache 窗 135 行全落 `inp>=cr` 被正确减去，误判率 0%。该数值判别对 OpenAI 语义数学恒真（`prompt_tokens >= cached_tokens` 定义保证）。

故本 task 不改判断逻辑，范围为：为该按行分流行为补测试锁定，并修正 `is_openai_semantic_model` 命名/注释与文档中「按模型名一刀切」的误导性表述（实际执行减法由 `inp >= cache_read` 守卫决定，模型名只圈候选范围）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 为 deepseek 混合接入的按行归一化行为补单测锁定（生产判断逻辑不变）。
- 修正 `claude-reader.ts` 中归一化条件的注释与 `is_openai_semantic_model` 相关表述，使其讲清「模型名圈候选、`inp >= cache_read` 守卫决定执行」的真实语义。
- 同步相关研究/蓝图文档表述。
- longcat 维持「按 OpenAI 语义归一化」行为不变。

### 非范围

- 不改 deepseek / longcat 的归一化判断逻辑（`is_openai_semantic_model` 圈定 + `inp >= cache_read` 守卫维持原行为）。
- 不引入按 session/账号的接入协议配置项。
- 不改 token 命中率公式、聚合层、UI 展示。
- 不处理 deepseek/longcat 以外模型的 cache 语义。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 新增单测：对一条 `inp >= cache_read > 0` 的 deepseek 记录（OpenAI 含 cache 语义），采集结果的 input 为原始 `inp - cache_read`。
- [ ] 新增单测：对一条 `cache_read > 0 且 inp < cache_read` 的 deepseek 记录（Anthropic 互斥语义），采集结果的 input 保留原始 `inp` 不被扣减。
- [ ] 新增单测：两种 deepseek 记录混合输入时，session/daily/records 三类输出的 input 总量等于「OpenAI 行已减 + 互斥行未减」之和。
- [ ] 新增/保留单测：longcat 记录按原逻辑归一化，行为不变。
- [ ] `claude-reader.ts` 归一化处注释/命名不再表述为「按模型名决定减与不减」，而是讲清模型名圈候选、数值守卫决定执行。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1–AC4 可自动测试：构造 JSONL fixture 单测覆盖（`tests/unit/main/core/token-stats/claude-reader.test.ts` 已有同类用例模式）。
- AC5：注释/命名表述，由 reviewer 核对，不写运行时测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 构造 deepseek 模型两类 JSONL 行：`inp >= cache_read > 0`（拟 OpenAI 含 cache 语义，断言减）与 `cache_read > 0 且 inp < cache_read`（拟 Anthropic 互斥语义，断言不减）。
- 构造 longcat 行回归，断言归一化行为不变。
- 混合输入下断言 session/daily/records 的 input 总量为两者分别处理后的和。
- 数值边界：`inp == cache_read` 时按守卫应减至 0，纳入断言。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 已核实（原 spike 项）：「`cache_creation_input_tokens > 0` ⇒ Anthropic 接入」**不成立**——该字段在全部 deepseek 行恒为 0。真正起分流作用的是数值守卫 `inp >= cache_read`：在已知协议窗口（2026-07-31，20:00 前 Anthropic / 20:40 后 OpenAI）的 WSL 真实数据上，Anthropic 窗 4034 行、OpenAI 窗 135 行均零误判。验证方式：spike `s004` 脚本 `code/analyze.py` 分窗统计，见 `docs/spikes/s004_deepseek_mixed_protocol_cache/report.md`。

### 风险与回退

- 风险：数值守卫的残余误判——Anthropic 互斥语义行若出现 `inp >= cache_read`（新输入超过缓存命中）会被误减，导致该行 input 偏低。spike 实测 4034 行互斥样本中该情形 0 次，但理论非恒 0。文档需标注此触发条件。
- 回退：本 task 生产逻辑基本不变（仅注释/命名与测试），回退即还原注释与新增测试，git revert 即可。

### 依赖与约束

- 仅改 `src/main/core/token-stats/` 注释/命名与其单测，以及研究/蓝图文档；不动判断逻辑、聚合、UI。
- spike 结论见 `docs/spikes/s004_deepseek_mixed_protocol_cache/report.md`。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：若 cache 归一化语义有权威表述，同步更新为「模型名圈候选 + `inp >= cache_read` 守卫决定执行」并标注残余风险。
- `docs/findings.md`：写入「deepseek/longcat cache 归一化按 `inp >= cache_read` 数值守卫分流，`cache_creation` 信号无效」这一已验证事实。
