# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p099（t269 review Round 3 f009 minor）。核实（2026-08-10）：t269 spec AC3 要求「全部组件明暗主题下无需 dark: 即渲染正确（黑盒抽查暗色渲染）」，当时 ui 组件未被应用消费无法 e2e 渲染、jsdom 不解析 CSS 变量而搁置；t270 起组件已被四窗口迁移消费，前置条件已满足。补明暗主题黑盒抽查。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- ui 组件库（Button/Card/Input/Switch/Select/Dialog/Progress/Badge/SecretInput 等，以 t269/t270 消费为准）明暗主题渲染黑盒抽查
- 抽查经应用级渲染（web e2e 或既有消费页面）断言暗色下无缺省样式/对比失效

### 非范围

- 组件样式本身调整（t269 已交付；抽查只验证不修样式，发现缺陷另立 task）
- 桌面原生窗口外观

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 面板暗色主题下，消费 ui 组件库的关键页面渲染无样式缺失/对比失效（e2e 或截图断言）
- [ ] AC2：抽查覆盖明暗两态，结果记录于测试或 task 收尾报告

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（web e2e 切 `data-theme` 断言；无法可靠断言的视觉细节标注人工项）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- e2e：web 项目切暗色主题（`data-theme="dark"`）断言关键组件渲染；mock local-api
- 无法自动断言的视觉细节（如对比度）由人工对照（`[deploy]` 或列入 task 报告）

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：暗色抽查发现组件缺陷需回 t269 范围外修复
- 回退：纯测试新增；发现缺陷登记不阻塞

### 依赖与约束

- 依赖：ui 组件已被 t270 起的应用迁移消费（已满足）

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如新增暗色抽查命令，同步说明
