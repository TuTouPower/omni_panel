# Task spec

## 背景

会话窗口顶栏刷新目前主要重拉**已打开槽位**的消息，不触发 token-stats collector，也不刷新会话库列表 / 最近会话所依赖的 store 查询。用户需要：点刷新 = 跑一轮与周期相同的采集（选项 B），再按原 UI 取数路径重拉；并重置默认约 10 分钟的自动采集计时，避免刚手动采完又按旧 interval 很快再自动采。

## 契约区

### 范围

- 工作台页签顶栏刷新：触发一轮 collector `collect`（与周期采集同一逻辑）→ 重置 poll interval → 重拉已打开槽位消息（现有行为保留）→ 最近会话等依赖 token-stats 的 UI 按**原接口/原 limit/排序**再查一遍（不新造「固定最近 10 条」语义）。
- 会话库页签顶栏刷新：同一采集入口 + 重置 interval → 按当前筛选/排序用原 `getSessions`（及现有首屏逻辑）重拉列表。
- 提供主进程/管理器可调用的「立即采集并重启 interval」能力（若尚无）；渲染层两页签刷新均走该能力。
- 单测：手动触发后 interval 以配置的 `poll_interval_ms` 重新计时；采集被调用；UI/IPC 契约有可测断言（mock collect 或 manager 桩）。

### 非范围

- 不改默认 `pollIntervalMinutes` 默认值（仍默认 10 分钟，可配置）。
- 不实现「只扫最近 N 个文件」的轻量采集（明确用完整一轮 collect）。
- 不修 linux grok 源缺失（t426）；本 task 只保证刷新会触发现有 collect。
- 不改槽位消息的订阅/2s 轮询/30s 兜底自动刷新逻辑（除「手动刷新」路径外）。

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

- [ ] AC-001：工作台页签点击顶栏刷新后，token-stats collector 被触发至少一轮（与周期 `collect` 同一入口/语义）。
- [ ] AC-002：AC-001 之后，已打开且 ready 的槽位消息被重新 query（现有 refresh 行为不丢）。
- [ ] AC-003：AC-001 之后，最近会话相关 UI 若依赖 token-stats 会话查询，按原调用方式再请求一次（不强制新 limit 数值）。
- [ ] AC-004：会话库页签点击顶栏刷新后，同样触发一轮 collect，并按当前筛选条件重新 `getSessions`（或等价列表 API）加载列表。
- [ ] AC-005：任意一次成功触发的手动采集后，自动采集定时器以配置的 `poll_interval_ms` 从该时刻重新起算（下一次自动 collect 不早于该间隔；可用假时钟/桩断言）。
- [ ] AC-006：相关单测通过；现有会话/token-stats 套件不因本变更整体变红。
- [ ] AC-007：`[deploy]` 真实实例点刷新后，在 collector 已覆盖的 source 上，列表/最近会话能反映刚产生的磁盘会话变化（需该 source 本就会被 collect）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~006：可自动测试（manager/collector 桩 + 渲染/hook 层 mock IPC）。
- AC-007：依赖真实磁盘与运行中实例，标 `[deploy]`。

## 上下文区

- 来源：用户 2026-08-16 需求澄清（工作台/会话库刷新 = collect 选项 B + 重置 10 分钟计时 + 原路径重拉 UI；不单独规定最近 10 条）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 采集本身全源正确性：既有 collector 测试负责；本 task 只测「触发与计时重置 + UI 重拉」。
- 并发连点刷新的去抖策略：若实施期加 debounce，在测试策略中声明即可；无强 AC。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock/spy：`collect` 或 manager 的「立即采集」入口调用次数；`setInterval`/`clearInterval` 或可注入 scheduler 断言 reset。
- 渲染：刷新回调后 `sessionHistory.query` / `tokenStats.getSessions` 被再次调用。
- 不依赖真实 grok 目录（t426 范围外）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。需求与现有 `poll_interval_ms` / `setInterval(collect)` / 顶栏 `onRefresh` 路径已在代码中核实。

### 风险与回退

- 风险：手动 collect 与 interval 重叠导致双跑；实现须 reset 时 clear 旧 interval 再采或采完再 arm。
- 风险：collect 耗时长时 UI 无反馈；可选 loading/禁用按钮（非 AC 强制）。
- 回退：刷新恢复为仅 `refresh_all` 槽位消息，不触发 collect。

### 依赖与约束

- 无硬依赖 t426；t426 修 linux grok 源后 AC-007 在 grok 上才有意义。
- 须与 utilityProcess collector 的 IPC 消息约定兼容（若尚无「立即 collect」消息则新增）。

### Finalization 时更新的 blueprint

- `docs/guides/cli-mode.md` 或会话相关 guide（若有刷新说明）：补充顶栏刷新 = 触发 token-stats 采集。
- 无则 `docs/blueprint/architecture.md` token-stats 段一句：手动刷新可触发 collect 并重置 poll。
