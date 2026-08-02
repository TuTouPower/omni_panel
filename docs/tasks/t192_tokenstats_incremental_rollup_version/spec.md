# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

dashboard query 消除大结果跨进程传输后，hour、heatmap 和范围 rollup 仍可能在每次切换时扫描高密度 records。随着历史数据增长，查询时聚合成本继续上升。现有 day buckets 已证明派生聚合可显著缩小读取规模，但缺少覆盖短窗口和范围维度的统一增量聚合及缓存版本标识。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 建立可由原始 token-stats 数据重建的增量聚合层，覆盖 dashboard query 所需的小时、日期、agent、platform、model、project 和 session 维度。
- collector 成功写入一批数据后，在同一一致性边界内更新受影响聚合；重复扫描或替换同一 session 不产生重复计数。
- 为成功提交的数据批次维护单调递增 data version，并通过 dashboard 响应和更新事件传递，用于精确判断 renderer 缓存是否过期。
- 对已有数据库提供幂等初始化/回填；中断后可重试，原始 records 继续作为可恢复真相源。
- dashboard query 优先读取聚合层，查询工作量与 per-message records 总量解耦。

### 非范围

- 不删除或压缩原始 records。
- 不改变用户可见统计口径、筛选项或图表样式。
- 不把查询移出主进程。
- 不将 renderer 查询结果持久化到磁盘。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：新建数据库和含历史 records 的既有数据库都能生成完整聚合，重启或重复初始化后结果不重复、不丢失。
- [ ] AC2：新增、修改或替换一个 session 的 records 后，受影响时间桶和维度统计与完整 raw records 重算结果一致，未受影响聚合保持不变。
- [ ] AC3：每个成功提交的数据批次只推进一次 data version；失败或回滚的批次不推进版本，dashboard 响应与更新事件报告同一已提交版本。
- [ ] AC4：renderer 缓存版本落后时进入 stale 并刷新，版本相同时复用缓存；更新事件与正在进行的查询竞态不会让旧版本覆盖新版本。
- [ ] AC5：在相同聚合分组数下把 per-message records 增加十倍，dashboard 响应行数和主要查询读取规模不随 records 数量线性增长。
- [ ] AC6：聚合数据损坏或版本不兼容时可从原始数据安全重建，重建前后用户可见统计一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不对大规模回填的绝对完成时间设 CI 阈值：使用读取规模、查询计划与相对数据规模验证复杂度。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 使用真实 SQLite 事务覆盖首次初始化、历史回填、增量更新、session 替换、重复消息、失败回滚和重建。
- 用完整 raw records 聚合作为 oracle，逐维比较 dashboard 结果。
- 并发测试以可控写入和查询屏障验证 data version、更新事件和缓存提交顺序。
- 性能基线使用相同分组但不同 message 密度的 fixture，比较读取行数、查询计划和响应规模。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 满足 dashboard 全部维度的最小持久聚合粒度：UNVERIFIED-SPIKE，执行期用 P0 基线与 P2 查询计划比较复用现有 day/session 表、补 hour 聚合、补 per-session-hour 聚合三种方案，选择能保持现有统计语义的最小方案。
- 历史回填期间的可用性策略：UNVERIFIED-SPIKE，执行期验证启动阻塞、后台回填加旧路径 fallback 两种方案的主进程卡顿和一致性，选择可自动回退的方案。

### 风险与回退

- 风险：派生表更新与 records 写入不一致；历史回填阻塞启动；distinct session 与跨 model/project 聚合重复计数；schema 变更损坏已有数据库。
- 回退：原始 records 保留为真相源；关闭聚合读取后可退回查询时聚合，删除并重建派生数据，不回滚用户原始记录。

### 依赖与约束

- 依赖 P2 dashboard query service，聚合层只服务已固化的统一查询语义。
- 持久化 schema、事务和并发变更使用 full review。
- 新增派生数据必须可重建；数据版本不能依赖 renderer 本地时间。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：补充原始事实表、派生聚合、data version 与缓存失效数据流。
- `docs/blueprint/decisions.md`：记录聚合粒度、回填策略和原始数据作为真相源的取舍。
- `docs/specs/ai-cli-token-stats-persistence.md`：补充派生聚合 schema、事务、重建与版本语义。
