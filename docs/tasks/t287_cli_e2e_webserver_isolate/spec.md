# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p096（t280 review Round 1 f005 minor）。核实（2026-08-10）：`tests/e2e/cli/cli_flow.spec.ts` 所在 cli 项目继承 playwright.config 全局 `webServer`（5174 vite preview mock），cli 测试自起 `--cli serve` 真实实例、不依赖 webServer；playwright 无按 project 关闭 webServer 的机制，vite preview 闲置启动（无害但多余）。属测试基建优化项。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- cli 项目运行时不启动闲置的全局 webServer（vite preview）

### 非范围

- playwright 配置整体重构
- web/electron 项目的 webServer 行为

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`pnpm test:e2e:cli` 运行时 5174 无 vite preview 进程（或明确无副作用证明）
- [ ] AC2：cli e2e 全量通过，无行为回归

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（进程断言 + cli e2e 套件）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- e2e：cli 套件全量；进程断言验证 5174 未启动
- 若 playwright 版本不支持 project 级关闭 webServer，确认现状无害后按「不办/维持现状」处理并说明

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- playwright 是否支持按 project 禁用全局 webServer：`UNVERIFIED-SPIKE`，Step 1 查版本能力；不支持则维持现状并标注

### 风险与回退

- 风险：改 webServer 配置可能影响其他项目
- 回退：测试基建改动，可整段回退

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如实现隔离，同步说明
