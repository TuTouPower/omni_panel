# Task spec

## 背景

会话库列表查不到 agy 消息：列表链（`getSessions`→`token_stats_sessions`→collector）无 antigravity 源，`observations.sqlite` 实测仅 5 源零 agy 行；直查链（locator/extractor/resume）已通。本 task 按用户选定口径补发现链，让 agy 会话进列表可预览续接，不硬做用量。

## 契约区

### 范围

- collector 新增 antigravity 会话索引 reader：读 `conversation_summaries.db`（`conversation_id/title/preview/step_count/last_modified_time/workspace_uris`）为主，缺行回退扫 `conversations/*.db` 文件名；`title/directory/started_at/ended_at` 取索引行，`calls` 取 `step_count`（缺行取 steps 行数），tokens 四项记 0。
- `tokenStatsSourceSchema`/store/sessions 查询与 `sessions_provider` 接纳 `antigravity`；`source_counts`/`getSessions`/`searchContent` 候选/`summaries` 可见 agy。
- 会话库出现 agy logo 行与会话卡片，预览/摘要/内容搜索走既有 t455 提取器；agy 行 tokens 显示“未知”而非 0，header 总量口径不变（0 不污染求和）。
- `AGENT_COLOR_VAR`/vendor 映射缺失则补 agy 分支，与 t447 同构。

### 非范围

- protobuf `usageMetadata` 真用量反推（工作量未知且随版本漂移，另起 spike 或不做）。
- 用量面板 antigravity 额度连接器与 CPA 配额。
- GUI `state.vscdb`。
- 代理面板一切：`AgentFilter`、`AGENT_OPTIONS`、dashboard/records/heatmap/rollup 的 agent 枚举与查询不动。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：会话库列表出现 antigravity 会话：`getSessions({sources:["antigravity"]})` 返回索引行（`source` 为 antigravity），`source_counts` 含 antigravity，logo 行出现 agy 入口。
- [ ] AC-002：agy 会话预览与续接可用：选中行预览出 t455 提取器正文（首条与 history 同会话 display 一致），resume 命令为 `agy --conversation {session_id}`。
- [ ] AC-003：agy 行 tokens 不造假：tokens 四项存 0 但卡片/明细显示“未知”而非 0；按 tokens 排序筛选时行为有定义且测试锁定（agy 沉底或与 0 同序，不抛错）。
- [ ] AC-004：代理面板仍排除 antigravity：`AgentFilter`/`AGENT_OPTIONS`/dashboard 查询无 antigravity 选项，`agent=antigravity` 不命中 records 通道。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：p226（2026-09-11 核实：`observations.sqlite` 5 源零 agy 行，直查链通，本机 78 库可复现）；s035/d054/t455/t456（索引与正文字段映射、直查链与展示映射已合入）

### 有意不测

- macOS/Windows 下 CLI 数据目录形态：无环境实测，fixture 只覆盖 linux（与 t455 同理）。
- 78 库级全量扫描性能：只测索引命中与文件名回退分支各一次，不测大规模耗时。

### 测试策略

- fixture 脱敏自建：最小 `conversation_summaries.db`（含缺行会话）+ 小 `conversations/<id>.db`（复用 t455 protobuf 编码 helper，不入库真实文本）；断言 store 行/`source_counts`/`sources` 过滤、卡片未知标注、代理排除类型守卫。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：tokens 记 0 影响按 tokens 排序/筛选与 header 口径误读；`summaries.step_count` 与 steps 行数口径不一致。
- 回退：单 task 单 commit，revert 即回 5 源会话库；索引 reader 缺目录按 missing 处理不抛。

### 依赖与约束

- t455/t456 已合入（直查链与展示映射复用）；仅 CLI（`~/.gemini/antigravity-cli`），不碰 records agent 枚举与 dashboard 查询语义。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：antigravity 无用量源时会话 tokens 记 0＋UI 标未知、代理面板不接的长期约束。
