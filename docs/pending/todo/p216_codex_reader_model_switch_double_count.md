# p216 codex reader model 切换重置差分基准致整段双计

- 现象：真实 codex rollout 文件修复 t448 去重后，入库会话 tokens 仍达 392M（example_game gpt-5.6-sol 会话），而非该文件真实累计 196M。model 切换边界把已累计总量整段再计一次。
- 影响：含双 model 的 codex 长会话 token 统计虚增约 2x（面板 Tokens/donut/缓存率分子 cache_read 同步翻倍，缓存率仍显示正确但总量错）；t448 AC-005「回落 196M 量级」在真实 reader 上未达成。
- 根因：codex-reader.ts parse_rollout_file 在 `turn_context.model` 变化时把 `segment_prev_total`/`segment_prev_cache` 置 null（202-209 行），下个 token_count 按全量计。实测 codex `total_token_usage` 是文件级连续单调累计（116 文件 0 回绕，含 model 切换处无跳变），不随 model 重置——差分基准不应在 model 切换处归零，model 仅作增量归因标签。t448 黑盒验证用无 segment-reset 的近似脚本，未覆盖真 reader 的 segment 逻辑，AC-005 假绿。
- 测试缺口：codex-reader.test.ts 无「同文件双 model 连续累计」fixture；t448 新增用例仅单 model，未触达 segment reset 分支。补：双 model 切换且 total 连续累计的 rollout，断言 tokens == 末 total - 0（=末 total），不因切换双计。
- 线索：真实文件 `/home/testuser/.codex/sessions/2026/09/03/rollout-2026-09-03T08-55-52-*.jsonl`（948 事件 2 次 model 切换）；库值 392M vs 理论 196M。
- 处理：未开
