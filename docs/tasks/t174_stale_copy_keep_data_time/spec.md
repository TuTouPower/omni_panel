# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p015。

采集失败时 refresh-service 把上次成功观测复制为 stale 副本，副本 `observed_at` 打成本次尝试时间（`src/main/core/scheduler/refresh-service.ts:336,345`）。卡片/账号行的相对时间直接取该字段，于是失败窗口内每轮失败都把时间刷成「几分钟前」，与「已过期」徽标并列时读作「几分钟前刚采的新数据」，用户无法判断数据真实年龄。2026-07-31 grok 故障期实证：imagine 指标数据停在 07-29，卡片时间却每 30 分钟随失败尝试刷新。

用户明确要求：复制上次数据可以，但时间显示不得误导为新采集。

既有测试 `tests/unit/scheduler/refresh-service.test.ts:330` 断言了误导行为本身（stale 副本 `observed_at` 必须大于原观测）。按 TDD 规则，该用例语义将被本 task 推翻：新增覆盖新语义的测试，旧用例整体删除并写明理由，禁止就地改预期。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- stale 副本的时间语义：采集失败复制的 stale 副本保留原观测的数据时间，不再覆盖为尝试时间（或等价机制：UI 对 stale 数据展示原数据时间，实现路径执行期定）。
- 卡片/账号行对 stale 数据的相对时间展示随之反映数据真实年龄。
- 两层回归测试；旧语义测试按 TDD 规则处置。

### 非范围

- 不改 stale 标记机制、「已过期」/「采集失败」徽标的存在与文案。
- 不在 UI 上额外展示「上次尝试时间」（如未来需要另立需求）。
- 不改趋势/图表的数据源与聚合逻辑本身，只保证本 task 的时间语义变化不破坏其正确性。
- 不处理「API 不再返回的指标 stale 无法自愈」（见 p011 归档条目，用户已明确不管）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：连接器采集失败且有历史数据时，账号行/卡片对 stale 数据展示的相对时间等于上次成功采集的时间，不随失败尝试逐轮刷新。
- [ ] AC2：stale 期间「已过期」「采集失败」徽标展示行为不变；采集恢复成功后，相对时间显示新数据的采集时间。
- [ ] AC3：时间语义变化后，每个指标的「最新观测」选择与趋势/图表演化不出现重复数据点或新旧错乱（stale 副本与原观测同时间戳时去重结果唯一且确定）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- AC1/AC2：refresh-service 单测，预置历史观测 → 采集失败 → 断言 stale 副本保留原 `observed_at`（及 renderer 组件测 stale 行 rel-time 取原数据时间）。`refresh-service.test.ts:330` 的旧断言用例整体删除并在 task.md 实施笔记写明理由。
- AC3：observation-store / provider-usage 层单测，构造 stale 副本与原观测同 `observed_at` 的输入，断言最新观测选择唯一确定、趋势输入无重复点。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- observation-store「按指标取最新观测」与趋势/图表查询对 stale 副本 `observed_at` 递增的依赖（同时间戳下去重是否确定）：UNVERIFIED-SPIKE，执行期读码 + 单测实验核实。
- 副本保留原时间后，`observations_to_ready_state` / runtime store 的 `updatedAt` 消费方（托盘、web 视图、快照缓存）是否出现新旧混排：UNVERIFIED-SPIKE，执行期读码核实各消费方取数字段。
- 若选择「副本保留尝试时间、UI 改取原数据时间」的替代实现，需确认观测模型是否需新增字段及迁移成本：UNVERIFIED-SPIKE，执行期评估两条路径后择一。

### 风险与回退

- 风险：stale 副本与原观测同 `observed_at` 导致「最新观测」选择不确定、趋势图同 timestamp 重复点；某消费方隐式依赖副本时间递增。
- 回退：改动集中在 stale 复制分支与映射层，revert 实现 commit 即恢复原语义。

### 依赖与约束

- TDD 约束：旧语义测试（`refresh-service.test.ts:330` 所在用例）禁止就地改预期，整体删除并在实施笔记写明理由，新增覆盖新语义的用例先红后绿。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：stale 副本语义描述（如有对应小节）同步为「保留原数据时间」。
