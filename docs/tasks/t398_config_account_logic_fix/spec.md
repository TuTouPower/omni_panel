# Task spec

## 背景

配置与账号逻辑 3 条 minor 遗留合并（t342/t343 review 遗留）：p157 的账号行 unhide/clear 用 `items.find((it) => it.provider === target.provider && it.accountId === target.account_id)` 取首个匹配（accounts_list.tsx:193-219），同 provider 同 accountId 不同 label 的多账号时点击行的 accountKey 未必等于 find 命中 item 的 key，会删错 override 键（概率低，gateway 子账号 accountId 通常唯一）；p158 的 `cacheMaxMb` schema `z.number().int().min(1)` 拒绝 0，而 settings data_section「不限制」保存 `cacheMaxMb: 0`、observation-retention 也把 0 视为不限制——「不限制」选项无法持久化，retention 的 0 分支成死代码，且下次启动 load 校验失败走备份恢复；p159 的 `run_retention_prune` 收紧循环 `if (additional === 0) break`——遇空 1 天窗口即提前停止，稀疏数据下 cacheMaxMb 行数预算可能未达成（有 cutoff\<now 90 步上限兜底）。已核实（2026-08-15，均仍存在）。

## 契约区

### 范围

- `src/renderer/views/settings-view/sections/accounts_list.tsx`：on_hide/on_unhide/on_clear 不再用 find 首个匹配——CpaCard 回调直接携带行级 accountKey，或 find 按 (provider, accountId, account_label) 三重匹配
- `src/main/core/config/types.ts`：`cacheMaxMb` schema 放宽 `min(0)` 对齐 UI「不限制」与 retention 0 分支语义
- `src/main/core/observation/observation-retention.ts`：`run_retention_prune` 空窗口改为继续推进 cutoff（或按更大步长），直至预算达成或 cutoff 达 now；补「prune 返回 0 仍超预算 → break」分支测试

### 非范围

- config save 回滚（t390）与 debounce 合并（t391）
- token-stats 配置构建导出（t396）
- 其它 schema/retention 行为

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

- [ ] AC-001：删对 override 键——同 provider 同 accountId 不同 label 的多账号，点击行 unhide/clear 删除该行对应 accountKey 的 override（对比修复前：可能删 find 首命中行的键）。
- [ ] AC-002：cacheMaxMb=0 可保存——`cacheMaxMb: 0` 通过 schema 校验并可持久化（对比修复前被 min(1) 拒绝），settings「不限制」选项落盘成功，下次启动 load 校验通过；retention 0 分支可达。
- [ ] AC-003：retention 空窗口继续推进——稀疏数据下 `run_retention_prune` 遇空窗口不再提前 break，继续推进 cutoff 直至预算达成或 cutoff 达 now（对比修复前预算未达成）；补「prune 返回 0 仍超预算 → break」分支测试锁定达成条件。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：accounts_list 组件测试（多账号 fixture）、config schema 单测、observation-retention 单测。

## 上下文区

- 来源：p157 / p158 / p159（`docs/pending/todo/`；2026-08-15 核实均仍存在：p158 schema min(1) vs UI 保存 0 矛盾在、p159 `additional === 0 break` 在、p157 find 首匹配在）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- accounts_list：构造同 provider 同 accountId 不同 label 双账号 fixture，断言 unhide/clear 删除对应行 accountKey 的 override。
- config types：cacheMaxMb=0 schema 通过 + 往返持久化；0 与 10000 边界。
- observation-retention：稀疏数据（含空窗口）断言预算达成；`prune 返回 0 仍超预算` 分支用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：schema 放宽 min(0) 后既有 min(1) 校验语义变宽（0 成为合法值，retention 0 分支被激活）；retention 空窗口继续推进可能增多 prune 调用轮次（有 cutoff\<now 上限兜底）。
- 回退：git 回退；AC-002/AC-003 用例锁定新语义，既有 schema/retention 用例锁定边界。

### 依赖与约束

- 无前置依赖。实现约束：schema 放宽只放开 0（不放开负数）；retention 推进不超过 now（既有上限兜底保留）；accounts_list 回调携带行级 accountKey 不改 hide 写键语义（与恢复键一致）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：cacheMaxMb=0 语义（0=不限制）若需长期约束，记录于此处。
