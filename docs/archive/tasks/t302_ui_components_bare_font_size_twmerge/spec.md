# Task spec

## 背景

来源：pending p126（t298 实施顺手发现）。d032 机制（tailwind-merge 误判自定义字号 token 为颜色类，吞掉同组 `text-[var(--color-*)]` 颜色任意值）在 ui 组件库多组件仍存在。t298 已按规避修法修复 standard Button；本 task 把同一修法扩展到 ui 组件库其余受影响组件。

## 契约区

### 范围

- 将 ui 组件库与会话侧组件中「自定义字号 token 与颜色类并存」的 `cn()` base 改为 d032 规避形式：自定义字号一律用显式任意值 `text-[length:var(--text-*)]`，明确归入 font-size 子组，不再被 twMerge 误判颜色冲突吞掉。
- 已知受影响位点（p126 列举，执行期以 grep 扫描补全）：`Input` / `SecretInput` / `Textarea` / `Select` / `PanelTitleBar` 的 `cn()` base（`text-body-md` 与 `text-[var(--color-on-*)]` 并存）；`ListRow` 的 subtitle div（`text-body-sm` + 颜色类，根 `cn()` 无字号）；`SessionRow` / `SessionCard` / `SessionPane` / `SessionLibrary` / `RecentSessionsModal` / `SessionShell` / `SessionRail` 等会话侧组件同模式。

### 非范围

- token 语义、颜色体系、字号 scale 本身不调整。
- t301 token 对齐包（DESIGN 对照差异）不并入。
- 非自定义字号类（标准 tailwind scale 内字号）不受影响、不改造。

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

- [ ] AC-001：受影响组件的 `cn()` 组合中，自定义字号 token 与颜色类两者均保留（twMerge 输出同时含 `text-[length:var(--text-*)]` 与 `text-[var(--color-*)]`），颜色不再被吞。
- [ ] AC-002：受影响组件无裸自定义字号类残留（全仓 grep `text-(body|label|display|title)-` 无命中，或全部以 `text-[length:var(--text-*)]` 形式出现）。
- [ ] AC-003：既有测试全绿（`pnpm test` 与 typecheck 通过），无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 用单测对受影响组件 `cn()` 组合断言 twMerge 输出同时含字号与颜色类；AC-002 用 grep 扫描断言无裸自定义字号残留；AC-003 走 `pnpm test` + typecheck。

## 上下文区

- 来源：p126（t298 顺手发现，2026-08-11）；机制 d032（d032_tailwind_merge_custom_font_token_conflict）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：对受影响组件暴露的 `cn()` base 调用断言 twMerge 输出；不 mock twMerge/CLSX 本身。
- AC-002 用仓库级 grep（`tests/` 与 `src/`）扫描裸自定义字号类，作为门禁断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（d032 机制与规避修法已由 t283/t298 验证）。

### 风险与回退

- 风险：类名替换后组件视觉字号或颜色回归；改动面广（多组件），漏改或误改某组件。
- 回退：全部为类名级改动，可整段回退；回归测试 + grep 扫描守护。

### 依赖与约束

- 依赖：t298（Button 修复，已合主干）确立的 `text-[length:var(--text-*)]` 修法为既定模式；本 task 复用之。
- 约束：不改 token 语义；仅样式类层面修改。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如有需要，补记「自定义字号类一律 `text-[length:var(--text-*)]`」为组件库约定（若尚未在 t298 记录）。
