# p214 codex 面板三处异常：工具误标 OpenCode / tokens 虚胖 6.9x / 缓存率恒 0

- 现象：
    - （主诉1）用户明明使用 codex，会话表工具列显示 OpenCode；用户称代理面板多处误识别。期望显示 Codex。
    - （主诉2）example_game 会话行 Tokens 显示 1.3B。期望约 0.19B（单文件末值-初值 196124034）。
    - （主诉3）同行缓存率显示 0%。期望约 96%（该文件 cached 191M / input 195M）。
    - （用户附带 kimi 诉求，经核查非 bug，见根因 0）用户删除 kimi 直连账号后仍见 kimi 空面板“暂无账号请添加数据源”。期望隐藏。实际该面板由 CPA 网关 `monitor_kimi=true` 保留，属配置语义，非残留。
- 影响：token-stats 会话表工具 Badge（SessionTable）、donut 图例（agentSegments / FromBuckets / FromRollup 三套，均缺 codex 致 codex 用量掉进“其他”或漏段）、echarts 颜色（agent_color 回退 accent）、会话库/工作区 accent（agent_accent 回退 primary）；codex tokens 统计虚胖（全量文件 115 个，单文件虚增 1.16B）；codex 全量缓存率恒 0。
- 根因（产品缺陷×3 + 非缺陷×1）：
    - 0. kimi 空面板非 bug：config.json 无 kimi 直连插件、removedConnectorIds 含 kimi（用户确实删干净），但 CPA 实例 parameterValues.monitor_kimi=true；visible_providers_from_groups（provider-usage.ts:430-442）把 gateway activeProviders 并入可见集，kimi 卡片合法保留。删 CPA 侧开关或 CPA 实例才消失。分类：配置问题，无需修仓。
    - 1. 工具误标：SessionTable.tsx:263-269 三元 else 兜底 "OpenCode"，codex 落入。数据链正确（TokenStatsView.tsx:138 / aggregate.ts:154 agent 已是 codex；AGENT_OPTIONS TokenStatsView.tsx:31-38 已有 codex）。同类已确认 6 处（同机制：t447 只接映射层、展示层漏 codex 分支）：chart-data.ts:43-48 AGENT_LABELS、:599-604 BUCKET_AGENT_LABELS、:759-764 ROLLUP_AGENT_LABELS（codex 用量不进 donut 主段）；echarts_token_resolver.ts:455-459 agent_color（codex 回退 accent）；slots.ts:167-172 AGENT_COLOR_VAR（codex 回退 primary）；local-api/server.ts:1341,1358,1376,1394 agent 类型收窄缺 codex（?agent=codex 过滤丢失）。slots.ts:158-165 vendor_id、markdown.ts:11-17 agent_friendly、general_section.tsx:29-35 RESUME_SOURCE_TITLES 已含 codex，同因不成立。
    - 2. tokens 虚胖：codex-reader.ts:231-235 delta\<=0 按 usage.total 全量计入。codex 同 total 重复落盘 token_count 事件（实测 rollout-2026-09-03T08-55-52 文件 948 事件中 8 对完全重复 total，如 line457 与 line456 同 total=3580773），每次重复吃满全量。复现：reader 口径合计 1356472098（== 面板 1.3B，fmtTok 截断显示 1.3B），真实增量（末-初，无回绕）196124034，虚增 1160348064（6.9x）。分类：产品缺陷。注意 p213（last_token_usage 行值口径）与本条正交互补：行值改小后重复行仍会按 total 全量计入，本条修去重/幂等后 p213 行值才有意义。
    - 3. 缓存恒 0：codex-reader.ts:259 daily.cache_read_tokens=0、:283-284 records.cache_read_tokens=0 写死（d051 时代 cached 全 0 的过时依据；现 948/948 事件 cached 非零）。对照 claude-reader.ts:355-369 正常透传。分类：产品缺陷。透传时须做归一（input 已含 cached，仿 claude inp>=cache_read?inp-cache_read），否则 read/(input+read) 双重计数。
- 测试缺口：
    - 为何漏过：codex-reader.test.ts:47-52 固件 cached 全 0（d051 采样），断言与写死 0 的实现同构，测不出丢弃；无重复 total 事件用例，delta\<=0 全量分支（:234）零覆盖；t447 codex_panels_wiring.test.ts:30-33 把 agent_accent 回退 primary 显式固化为“待 design token”，展示层缺分支被当 TODO 放过；chart-data 三套 labels 无 codex 用例。
    - 补测方向：codex-reader 单测加重复 total 事件用例（期望去重/幂等，不 double 计）+ cached 非零透传用例（含 input 归一断言）；面板单测加 codex 行 Badge 文案 == Codex、donut 三套含 codex 段、agent_color/agent_accent 回归设计 token；local-api ?agent=codex 过滤用例。
- 线索：`.scratch/bug_codex_tokens_cacheread_repro.py`（python3 直接跑，REPRO OK 输出 reader=1356472098 vs 真实=196124034）
- 处理：t448
