# d004 deepseek/longcat cache 归一化按 `inp >= cache_read` 数值守卫分流，`cache_creation` 信号无效（2026-07-31）

- 来源：s004（t171）
- 结论：deepseek 模型可并存 OpenAI 上游（`input_tokens` 含 `cache_read`，需减）与 Anthropic 上游（两者互斥，不能减）两种取数协议，但传输层统一 Anthropic 格式（new-api），上游协议不在 JSONL 留痕。唯一可靠分流依据是 `input` 与 `cache_read` 的数值关系：`inp >= cache_read` ⇒ 含 cache 语义减去；`inp < cache_read` ⇒ 互斥语义保留。该判别对 OpenAI 语义数学恒真（`prompt_tokens >= cached_tokens` 定义保证，OpenAI 行必被减、不漏判）。`cache_creation_input_tokens` 在全部 deepseek 行恒为 0，不能作区分信号。
- 证据：s004 脚本扫 Win+WSL 真实数据；按用户提供的协议切换时间（2026-07-31 20:00 前 Anthropic / 20:40 后 OpenAI）分窗，Anthropic 窗 4034 行全 `inp<cr` 正确未减、OpenAI 窗 135 行全 `inp>=cr` 正确减去，零误判。
- 影响：`claude-reader` 归一化由 `is_cache_normalization_candidate`（模型名圈候选）+ 调用点 `inp >= cache_read` 守卫（决定执行）组成，模型名不决定减与不减。残余风险：Anthropic 互斥行若 `inp >= cache_read`（新输入超缓存命中）会误减，本机 4034 行互斥样本中 0 次，理论非恒 0。
- 现状：有效
