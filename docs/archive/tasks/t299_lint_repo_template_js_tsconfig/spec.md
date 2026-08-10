# Task spec

## 背景

来源：p114（t283 顺手发现，2026-08-11 核实仍在）。`pnpm lint` 全量报 3 个 Parsing error：

- `scripts/repo_template/repo_task/view_static/board.js`
- `scripts/repo_template/repo_task/view_static/chain_plan.js`
- `tests/repo_template/test_chain_plan_cases.js`

「not found by the project service」。repo_template sync（5229b98e）引入这些 JS 文件未纳入 tsconfig include / allowDefaultProject，lint 门禁因此全量失败（主仓与 worktree 均复现）。

## 契约区

### 范围

- 3 个 JS 文件收编进 eslint 可解析范围（tsconfig allowDefaultProject 白名单或 eslint 配置排除/收编）
- lint 全量恢复绿（零 warning 零 error）

### 非范围

- repo_template 工具链代码本身重构
- 其它 lint 配置调整

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

- [ ] AC-001：`pnpm lint` 全量退出 0，无 Parsing error（3 个文件不再报 not found）
- [ ] AC-002：`pnpm typecheck` 仍通过（收编方式不破坏类型检查范围）
- [ ] AC-003：repo_template 相关既有测试不受影响（全量 `pnpm test` 通过）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：lint/typecheck/test 命令直接验证。

## 上下文区

- 来源：p114

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 命令验证：`pnpm lint` / `pnpm typecheck` / `pnpm test` 全量绿

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
