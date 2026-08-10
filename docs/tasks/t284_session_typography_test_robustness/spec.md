# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p102（t273 test review Round 2 `t273_test_f001` minor）。核实（2026-08-10）：`tests/unit/renderer/styles/session_typography.test.ts` 仍通过 `readFileSync` 读源文件并用文本正则验证 utility 类名；类名拆分或 utility 生成规则变化时存在假阳/假阴边界。测试健壮性改进。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话字号相关断言脱离「源文件文本正则」依赖，改用可验证的输入（fixture / 构建产物 / 渲染结果）断言
- 保持既有字号层级语义覆盖（不弱化断言）

### 非范围

- 会话面板字号样式调整（t273 已交付）
- 其他样式测试文件的同类问题

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`session_typography.test.ts` 不再依赖源文件文本正则验证类名
- [ ] AC2：原字号层级语义断言全部保留（等价的输入→输出断言）
- [ ] AC3：全量 `pnpm test` 通过

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：改造 `session_typography.test.ts`，断言改从 fixture 或渲染结果提取
- 若需构建产物参与断言，注明命令与依赖顺序

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：断言方式改造可能减弱覆盖或依赖构建时序
- 回退：纯测试改动，可整段回退

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
