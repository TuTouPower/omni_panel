# Task spec

## 背景

会话库内容搜索（勾选「包含消息内容」）对全部候选会话逐个 `extract_full` 全量解析文件，`extract_cache` 是内存 Map、服务重启即空。4000 会话冷缓存首次搜索需 45s+（Playwright 实测），UI 仅显示「搜索消息内容中…」无进度/超时反馈，用户误以为功能坏了。根因分析见 `docs/pending/todo/p186_session_content_search_cold_perf.md`。

## 契约区

### 范围

- 降低内容搜索冷缓存首次响应时间：候选分块/分批解析、增量结果返回。
- 搜索期间给用户进度反馈（已解析多少/命中多少）。
- 搜索超时或超上限的明确降级提示（沿用 t388 truncated 语义或扩展）。

### 非范围

- 不改 `searchContent` 命中判定逻辑（关键词匹配语义不变）。
- 不改候选集枚举 `query_all_sessions` 的 SEARCH_ENUM_CAP（100k）语义。
- 不做 extract_cache 磁盘持久化（架构大改，另议；如需写入 decisions）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：内容搜索期间 UI 显示进度反馈（如「已扫描 N/M 个会话」或等价进度指示），不再只显示无进度「搜索中…」。
- [ ] AC-002：搜索过程中部分命中可先展示（增量结果），而非等全部候选解析完才一次性返回。
- [ ] AC-003：全部候选解析完成的最终命中数与搜索前一致（不丢结果）；Playwright 实测 4000 会话搜「启用」最终命中数 ≥ 65（与修复前一致）。
- [ ] AC-004：冷缓存首次搜索完成时间较修复前显著下降（候选分块下首屏结果先于全量完成出现）。
- [ ] AC-005：搜索取消（切换搜索词/离开页面）时中止未完成解析，不泄漏任务。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003/005：可自动测试（单测搜索服务分块/增量/取消 + renderer 进度状态断言）。
- AC-004：性能对比属黑盒验证，Playwright 实测首次响应前分块结果出现时序；不设硬性秒数门禁（环境相关）。

## 上下文区

- 来源：p186（2026-08-16 复现与根因；`docs/pending/todo/p186_session_content_search_cold_perf.md`）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- extract_cache 磁盘持久化：本 task 不做，不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `searchContent` 分块/增量/取消：单测构造未缓存 locs 集合，断言分批返回、取消后不再启动新解析、最终命中集完整。
- renderer 进度反馈：jsdom 单测断言搜索中状态显示进度文案，结果到达后隐藏。
- 黑盒：Playwright 连真实 serve（4000 会话）验证最终命中数 ≥65 且进度出现。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 分块/增量 IPC 契约（s030 验证）：选 (A) renderer 分页多次 `searchContent`。Request 可选 `offset`/`limit`（省略=全量一次，兼容旧调用）；Response 可选 `progress: { scanned, total, done, next_offset }`，本批 `hits`/`sessions` 仅含本 slice（offset=0 时附带 metadata 命中）。不新增事件 channel/SSE。验证：读现网单次 Promise 契约 + resolve 进程缓存/索引；相对 (B) 侵入更小且 HTTP/IPC 同形。

### 风险与回退

- 风险：增量/进度引入 IPC 协议复杂度，波及 preload 类型与 web shim。
- 回退：若协议改造过大，退回保守方案——提高并发 + 候选按时间分块逐块搜索合并结果，UI 加「搜索中…（已处理 N）」轮询；不破坏既有单次 Promise 契约。

### 依赖与约束

- 依赖 t399/t400（CLI 相关，不影响本 task）；session-history 现有 extract_cache/订阅服务。
- 保持 `searchContent` 对外语义（keyword 匹配）不变；仅改性能与反馈路径。
- preload 类型（`src/preload/index.ts` sessionHistory.searchContent）与 web shim 需同步（若协议变）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：内容搜索性能方案选型（分块/增量/轮询）与后续约束。
- `docs/guides/cli-mode.md`：无（不影响 CLI）。
