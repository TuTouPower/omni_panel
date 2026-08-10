# Task spec

## 背景

来源：p115 + p116（t283 review Round 2 提示，2026-08-11 核实仍在）。

1. **standard Button 字号被吞**：`src/renderer/components/ui/Button.tsx` base 类 `text-body-md` 经 tailwind-merge 误判为颜色类吞掉（机制见 `docs/findings/d032`），standard 按钮字号回退继承值。t283 只修了 sm 档（`text-[length:var(--text-label-md)]`），standard 未同步。
2. **danger 按钮暗色对比不达标**：`danger: bg-[var(--color-error)] text-[var(--color-on-primary)]`，暗色 `--color-error` = error-dark #ff6b6b，白字对比 2.78 < DESIGN 3.0 大字线（t283 e2e 未取样 danger 故未红）。

## 契约区

### 范围

- Button base 字号类改显式 `text-[length:var(--text-body-md)]`（消除 twMerge 吞色）
- danger 按钮暗色对比达标（调 error-dark token 或按钮特调；error-dark 同时用于错误文字，调暗方向一致需复核）
- 补 standard 字号 + danger 暗色对比回归测试

### 非范围

- 其它组件同类字号类（如发现同模式登记或一并修）
- 设计 token 体系调整（仅 error-dark 值微调属 token 变更需同步 designmd export）

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

- [ ] AC-001：standard 尺寸 primary/secondary/danger 按钮 computedStyle 字号为 13.5px（body-md），且 primary/danger 文字色为 `--color-on-primary`（不再回退 on-surface）
- [ ] AC-002：暗色主题下 danger 按钮白字 vs 底对比 ≥ 3.0（computedStyle 实测）
- [ ] AC-003：`pnpm designmd:check` drift 通过（若 error-dark 值变更）；全量 `pnpm test` 通过

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染断言（computedStyle）+ WCAG 对比计算（复用 t283 方式）；token 变更走 designmd:check。

## 上下文区

- 来源：p115（fix_ref 指向本 task）/ p116

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

- 机制：`docs/findings/d032`（tailwind-merge 误判自定义字号 token）

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测/渲染：Button 组件各 variant+size 的 computedStyle 字号与颜色断言（含暗色）
- 回归：既有 Button 消费方测试 + `pnpm designmd:check`

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：见 spec 背景与范围；实施失败影响限本 task 涉及面
- 回退：改动可整段回退，回归测试守护

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
