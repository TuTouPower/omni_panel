# p213 codex reader 分项精度改 last_token_usage 行值口径

- 来源：t445 遗留（review t445_code_f001，minor）
- 内容：codex-reader 差分按 `input/total` 比例拆 input/output，总量精确但分项与真实行 `last_token_usage` 精确增量有系统偏差。未来需要分项精确时，改用 `last_token_usage` 直接记行值（需处理首行 last==total 一致性）；同时补双 model 分段 fixture 用例（t445 test 未进表提示）。
- 处理：未开
