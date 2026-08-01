# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p020。

24h preset 的 current/previous KPI、donut 及项目/会话柱仍从 current+previous 共 48 小时 records 明细计算。records 查询按时间倒序限制 50,000 条；高密度使用时只保留最近数小时，导致这些统计低估当前窗口并丢失前一窗口。时间轴小时柱先由前置 task 改用 hour 聚合，本 task 处理其余同源偏差。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 24h 当前窗口与等宽前一窗口的 tokens、calls、distinct sessions、缓存命中率使用完整精确时间范围，不受 records LIMIT 影响。
- 24h 模型 token/call、工具占比、token composition donut 使用完整窗口数据。
- 24h 项目 x 轴与会话 x 轴柱状图基于完整窗口统计；现有目录别名、模型别名和 top/other 展示语义保持一致。
- 新增有界聚合数据路径；renderer 接收量按聚合分组规模增长，不随 per-message 明细总量线性增长。
- 高密度回归测试覆盖 current 与 previous 窗口边界、筛选和用户可见统计。

### 非范围

- 不改 24h 时间 x 轴小时柱；该路径由前置 task 处理。
- 不改 7d/30d KPI、donut、柱状图、热力图和会话表。
- 不改 collector、records 表结构或新增持久化聚合表。
- 不改变项目、会话、模型、工具、缓存命中率的既有统计口径。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：24h 窗口内 records 超过 50,000 条时，总 Token、调用次数、distinct 会话数、缓存命中率及其前一窗口 delta 仍与完整精确窗口统计一致。
- [ ] AC2：模型 token/call、工具占比和 token composition donut 在高密度窗口下不丢较早记录，分项和总量保持一致。
- [ ] AC3：项目 x 轴与会话 x 轴柱状图在高密度窗口下仍包含完整 24h 的 top 分组，目录/模型别名与“其他”合并语义保持一致。
- [ ] AC4：全部工具 / 单 agent 与全平台 / Win / WSL 筛选对 AC1-AC3 全部生效。
- [ ] AC5：24h 数据加载保持有界；明细量继续增长时，传入 renderer 的统计数据量只随聚合分组数增长，不恢复无上限 per-message 明细传输。
- [ ] AC6：7d/30d 统计与 24h 时间轴小时柱行为保持不变。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- store 集成测试使用真实 SQLite 构造超过 records LIMIT 的 current+previous 数据，断言精确半开窗口边界、tokens/calls、distinct sessions、cache/input composition 及 agent/env 过滤；断言结果规模由聚合分组决定。
- renderer view 测试让 records mock 仅返回最近 3 小时，同时聚合 mock 返回完整 current/previous 窗口，断言 KPI、delta、donut 与项目/会话柱使用完整统计，不从受限 records 回退。
- 项目/会话柱测试覆盖 top 分组、“其他”、目录/模型别名及跨窗口记录，断言用户可见结果而非具体内部查询形态。
- 保留并运行 24h 精确 delta、7d/30d buckets、hour 聚合及筛选回归用例。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：current/previous 边界重复计数；distinct session 与模型/项目分组口径漂移；聚合查询组合过多导致加载变慢；别名在 SQL 聚合后无法保持既有合并语义。
- 回退：恢复受限 records 计算路径并回退新增聚合接线；不涉及数据迁移或持久化结构回滚。

### 依赖与约束

- 依赖 t183 完成 24h 时间轴小时柱聚合接线；两项顺序执行，避免同时修改同一 view 与测试。
- 保持 t162 的 renderer 内存止血目标：records 查询继续有界，禁止以移除或大幅提高 LIMIT 作为修复。
- current 窗口使用闭区间语义时，previous 窗口须保持既有半开边界，避免边界记录双计。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 24h 精确统计与非时间轴聚合数据流。
- `docs/specs/ai-cli-token-stats-ui.md`：24h KPI、donut、项目/会话柱完整窗口与有界加载契约。
