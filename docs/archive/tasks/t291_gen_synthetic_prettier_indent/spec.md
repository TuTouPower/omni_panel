# Task spec

## 背景

`tests/e2e/fixtures/synthetic.json` 当前为 4-space 缩进（`pnpm format` 全仓格式化后状态，prettier check 通过），但生成脚本 `scripts/e2e/gen_synthetic.mjs:169` 仍 `JSON.stringify(out, null, 2)`（2-space）。两者不一致：再运行 `pnpm e2e:gen-synthetic` 会退回 2-space，`pnpm format:check` 对 synthetic.json 恒 warn（p091 复发）。p091 原文「改脚本破坏再生成约定」结论已不成立——正确修法是让脚本产物直接满足 prettier 规范。

## 契约区

### 范围

- `scripts/e2e/gen_synthetic.mjs` 生成缩进对齐仓库 prettier（tabWidth=4）：`JSON.stringify(out, null, 4)` 或等价（生成后 prettier 格式化），保证再生成产物 prettier 合规。

### 非范围

- 不改 synthetic.json 内容语义（fixture 数据不动）。
- 不引入 prettier 为脚本运行时依赖（除非已有）；优先纯缩进参数解决。
- 不动 `scripts/e2e/gen_fixture.mjs`（如与 prettier 无冲突）。

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

- [ ] AC-001：运行 `pnpm e2e:gen-synthetic` 重生成 `tests/e2e/fixtures/synthetic.json` 后，`npx prettier --check tests/e2e/fixtures/synthetic.json` 通过。
- [ ] AC-002：重生成产物与脚本一致：`git diff tests/e2e/fixtures/synthetic.json` 仅含 fixture 内容变化，无纯缩进噪声（与重生成前内容等价、仅缩进差异视为不通过）。
- [ ] AC-003：`pnpm format:check` 对 synthetic.json 无 warn。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/003 以 prettier 命令输出断言；AC-002 以 git diff 审查断言。

## 上下文区

- 来源：p091（2026-08-10 主仓确认：文件已 4-space 但脚本仍 2-space，再生成会复发；脚本与产物一致性是「产物与脚本一致」约定的正向约束）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 改脚本缩进参数后重生成 fixture，用 prettier check + git diff 验证（AC-001/002）；不改 fixture 内容语义。
- 注意 `scripts/e2e/gen_synthetic.mjs` 中 `JSON.stringify(out, null, 2)`（169 行）与 `JSON.stringify(raw)`（173 行）两处用途不同，只改缩进相关处。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：改缩进后重生成若同时引入内容变化（fixture 数据源变动），需人工确认语义；prettier 对超大 JSON 的解析耗时可忽略。
- 回退：重生成产物 diff 异常时恢复脚本改动与 fixture（git 层面），不影响其它测试。

### 依赖与约束

- 约束：仅改 `scripts/e2e/gen_synthetic.mjs`（+ 必要时重新生成 fixture 入库）；保持「产物与脚本一致」约定。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：无。
