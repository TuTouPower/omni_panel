# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js` 与 `tests/e2e/fixtures/mock_server.mjs` 未过 prettier 格式，`pnpm check` 的 format:check 必挂。两者非 t197 改动文件，为既有漂移（p039），影响后续每个 task 的 `{test_cmd}` 门禁。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 对上述 2 文件执行 prettier 格式化，消除格式漂移。

### 非范围

- 不改动 2 文件的功能逻辑、测试语义或结构。
- 不处理其它尚未登记的格式漂移文件（如发现，登记 `docs/pending.md`）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`pnpm format:check` 全局通过（prettier 不再对上述 2 文件报警）。
- [ ] AC2：上述 2 文件经 `git diff` 仅含 prettier 格式化差异，无逻辑改动。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（`pnpm format:check` + `git diff` 核对）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 无单测；以 `pnpm format:check` 与 `git diff` 验证。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：prettier 版本差异导致格式化结果不符合预期。
- 回退：`git checkout --` 恢复 2 文件原状（仅本 task 新增的格式化改动，无其它未提交改动时）。

### 依赖与约束

- 依赖：p039 登记（来源）。
- 约束：仅格式化本 task 声明的 2 文件。

### Finalization 时更新的 blueprint

- 无。
