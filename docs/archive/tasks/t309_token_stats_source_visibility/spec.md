# Task spec

## 背景

t308 已让路径层对不可用源返回 `null`，但 collector 仍对全 0 采集静默（p132 实测：8-11 全源 0 无任何可见告警）。本 task 把硬编码 `sources[]` 重构为声明式（`hosts` 数据化），并在每次采集产出源级状态（ok/unavailable/failed + lastError），面板可见——采集失败不再无解释。

## 契约区

### 范围

- `collector.ts` 的 `sources[]`（含 SourceDef/hosts/requires 字段）改为声明式数据，按 `host` 过滤；不可用源不生成路径、不参与读取。
- 每次采集产出源级状态列表：`{ source, env, status: ok|unavailable|failed, lastError? }`，经 `TokenStatsUpdate` 同步到主进程与面板。
- 不可用/失败源输出 warn 日志（含原因），替换现有 ENOENT 静默。
- 面板（代理面板）展示源状态：新鲜度 + 失败/不可用标记，正常源行为不变。

### 非范围

- env 枚举与路径层纯函数（t308 已做，本 task 依赖其结果）。
- session-history 系统（t310）。
- CLI 采集能力（另立 pending）。
- 采集重试/自愈逻辑（本次仅可见性）。

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

- [ ] AC-001：声明式源清单按 `host` 过滤；非 Windows 宿主下 `wsl` 源不生成路径、不参与读取，且标记为 `unavailable`。
- [ ] AC-002：每次采集产出的源状态含 `source`/`env`/`status`/`lastError`；不可用源 `status=unavailable` + 原因，读取抛错源 `status=failed` + 错误信息，正常源 `status=ok`。
- [ ] AC-003：不可用/失败源在 collector 侧输出 warn 日志（含 source/env/原因）；正常源不产生 warn。
- [ ] AC-004：面板展示各源状态：正常源显示新鲜度，不可用/失败源显示原因标记，不再呈现为空数据面板。
- [ ] AC-005：正常源的数据写入行为不变（sessions/daily/records 落库与 t308 前一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。AC-001/002/003 用注入 `host` 的 collector 单测断言源过滤与状态产出；AC-004 用 renderer 组件测试断言状态渲染；AC-005 用 collector 集成测试断言正常源数据落库不受源状态新增影响。

## 上下文区

- 来源：p132（2026-08-11 核实：8-08/8-09/8-11 collector 日志全 `Stored 0`，grok 路径缺用户名，无任何 warn；面板显示空数据）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实面板交互（hover 状态标记 tooltip 的视觉细节）：renderer 单测断言状态元素存在与文本，视觉像素级留人工。
- 多源并发状态更新的竞态时序：状态为幂等覆盖，无并发写面，不写竞态测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- collector 单测：注入 host 断言声明式过滤（非 Windows 下 wsl 源 unavailable）+ 状态列表内容。
- 状态产出：构造不可用/失败源，断言 `TokenStatsUpdate` 携带源状态数组。
- renderer 测试：mock IPC 返回含 unavailable/failed 源状态，断言状态标记渲染。
- 正常源回归：现有 collector 集成测试保持绿，确认数据写入不受源状态字段影响。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 面板源状态展示的具体 UI 形态（标记位置/文案）：已由 spike s026 确认——状态挂载面板 status 区（新鲜度旁），`ok` 无额外标记、`unavailable`/`failed` 显示原因文本；视觉像素细节留人工。结论入 finding d034。

### 风险与回退

- 风险：源状态经 IPC 每轮传输增加 payload；面板查询侧对新增状态字段的兼容。
- 回退：状态为新增字段，去掉后源清单/过滤逻辑仍独立可用；payload 体积以源数（≤10）为界，可忽略。

### 依赖与约束

- 依赖 t308 合入（路径层纯函数 + `TokenStatsEnv` local|wsl）；源清单声明式基于 t308 的路径层返回 `null` 语义。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 目录树/数据流补充源状态可见性。
- `docs/blueprint/domain.md`：§3 采集能力补充源级状态语义。
