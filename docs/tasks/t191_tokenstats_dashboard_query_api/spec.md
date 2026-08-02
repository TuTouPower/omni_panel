# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

代理面板一次加载会分别请求 records、heatmap、hour buckets、day buckets、sessions、status 和窗口 rollup。主进程同步执行多项 SQLite 查询，renderer 接收多种中间结构后再拼装面板状态；自定义短窗口仍依赖最多五万条 records。并行 IPC 减少不了同步查询总工作量和大结果跨进程复制。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 建立单一 dashboard query 契约，输入包含时间范围、agent、platform、metric、x 轴和粒度，输出只包含当前面板所需的汇总、图表序列、热力图、会话摘要、状态与数据新鲜度。
- 在主进程查询服务内统一参数规范化、范围边界和聚合口径，同一响应基于一致的数据视图。
- KPI、donut、时间轴、项目轴、会话轴和热力图均使用有界聚合结果；自定义短窗口不再依赖受 LIMIT 截断的 records。
- 正常打开和切换选项时使用单一主数据 IPC；不属于当前可见区域的明细按需加载。
- 保留必要的旧查询入口供其他调用方兼容，代理面板正常路径停止调用 records 查询。

### 非范围

- 不新增持久化 rollup 表；本 task 使用现有表与查询时聚合完成契约。
- 不改变 collector 写入格式、原始 records 真相源或统计口径。
- 不实施查询进程隔离。
- 不重做图表视觉设计。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：任一代理面板选项组合通过一个主数据请求获得当前可见的完整面板数据，不再由 renderer 拼接多套独立统计查询。
- [ ] AC2：24h、7d、30d 与自定义范围的 KPI、delta、donut、时间/项目/会话轴和热力图结果与完整 raw records 基准计算一致。
- [ ] AC3：全部工具/单 agent 与全平台/Win/WSL 筛选对所有面板区域使用同一范围和过滤语义。
- [ ] AC4：正常打开、切换选项和 collector 静默刷新时，代理面板不调用 records 查询；传入 renderer 的数据量随桶和聚合分组数增长，不随 per-message records 数线性增长。
- [ ] AC5：不属于当前可见区域的会话明细或详情不阻塞主图展示，并可在用户展开或翻页时按需取得。
- [ ] AC6：旧 token-stats IPC 调用方保持兼容，新增跨进程 DTO 经过运行时校验，非法范围或枚举输入返回受控错误。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测试图表颜色、布局和动画：本 task 只替换数据契约与加载路径。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- store/query service 集成测试使用真实 SQLite，构造高密度 current/previous 窗口、边界记录、跨 model/session/project 数据，和完整 raw 基准对比。
- IPC 与 preload 测试覆盖 sender 校验、输入校验、错误包装和 DTO 透传。
- renderer 测试断言一次主数据请求、records 零调用、按需明细加载及现有筛选/别名行为。
- 性能基线比较响应行数和序列化字节数，绝对耗时仅记录不作为 CI 固定阈值。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- dashboard DTO 的最小字段集合与可见区域边界：UNVERIFIED-SPIKE，执行期逐一映射当前组件输入，确认哪些会话数据可延迟加载，避免复制现有全部中间结构。

### 风险与回退

- 风险：统一聚合后 current/previous 边界、distinct session、别名合并或 top/other 语义漂移；单一响应过大反而延迟首屏。
- 回退：保留旧查询入口与旧 renderer 适配边界，回退实现 commit 即恢复多查询加载；不涉及数据迁移。

### 依赖与约束

- 依赖 P1 查询协调器，统一 query key 直接映射 dashboard query 输入。
- 跨进程契约需同步 shared type、IPC、preload 与 renderer，并保持 route capability 分权。
- 继续保持 records 查询有界，禁止通过提高 LIMIT 恢复完整统计。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：补充 dashboard query service、单一 IPC 数据流和按需明细边界。
- `docs/specs/ai-cli-token-stats-ui.md`：统一各面板区域的数据源、范围边界和筛选语义。
- `docs/specs/ipc-api.md`：新增 dashboard query 契约与 route capability。
