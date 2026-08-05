# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用量面板账号展开区 sparkline 当前固定「近 7 天、按 UTC 天分桶、每桶取最新一条」，折线一天一个点。但观测存储是细粒度的（用户 30 分钟采集一次，每次 insert 是新行，DB 实测同天单 metric 可达数百行、平均采集间隔 18 分钟，见 `docs/findings.md` d014 与本次 DB 探查）——存储没丢点，丢点发生在 `query_trend_series` 的按天分桶策略。

诉求：

1. sparkline 按采集的实际粒度取点，而非按天压缩；
2. 用户可选窗口：最近 1 天 / 7 天 / 30 天。

用户决策的取点策略：**固定点数上限**，把窗口内原始采集点映射压缩到该上限。sparkline 绘图区宽 560px、有效 ~514px、点半径 2.6px，间距 ≥3px 才不糊，故上限取 **120 点**（间距 ~4.3px，清晰且不稀疏；常量可调）。窗口不同，每点代表的时间跨度不同（1 天≈12min/点、7 天≈84min/点、30 天≈6h/点），低于 120 个原始点的窗口直接画原始点不强制补点。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `query_trend_series` 改为按固定桶数（`max_points`，默认 120）在 `[now - days, now]` 窗口内均分时间桶，每桶取 `observed_at` 最大一条；桶数 = `min(max_points, 原始点数)`（原始点不足时不补空，按实际点数）。
- 前端加窗口选择器（1 天 / 7 天 / 30 天），选中值透传到 `trend:getBulk` 的 `period.days`（1/7/30）。
- sparkline 缓存键含 days（不同窗口分别缓存，切换不串）。
- `TrendPeriodRequest.days` 注释订正：查询键是 observation 的 metric_id（非 raw_label），t207 已修实现、本 task 顺带订正残留注释。

### 非范围

- 不改 observation-store 存储粒度（每次 insert 仍新行）。
- 不改 connector、不改 metric_id 构造规则。
- 不改 sparkline 渲染组件 `TrendSparkline` 的 SVG 结构（已按 data 数组画点与折线），仅其入参点数/语义变化。
- 不加 source_instance_id 维度（多实例 sparkline 是否串接，独立问题，见 t057 评估与本 task 上下文区）。
- 不实现「鼠标 hover tooltip 显示具体时刻」等交互增强（本 task 只改取点与窗口）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 展开一个采集频率 ≥ 每 30min 一次、近 1 天有多次采集的账号，选「最近 1 天」窗口，sparkline 显示的折线点数 > 1（按细粒度取点，不再一天一个点）。
- [ ] 切换「1 天 / 7 天 / 30 天」窗口，sparkline 折线随之变化（不同窗口对应不同 days 的取数），且折线点数 ≤ 120。
- [ ] `query_trend_series(provider, account_id, metric_id, days=1)` 返回的序列点数 ≤ 120 且 > 1（当原始采集充足时）；`days=7` 与 `days=30` 同理。
- [ ] 窗口切换后切回原窗口，sparkline 走缓存命中（不重复发 IPC）。
- [ ] 单元/集成测试：给真实 observation-store 写入一天内多次（如 48 次，每 30min）observation，`query_trend_series(_, _, _, 1)` 返回的序列长度 ≤ 120 且反映多次采集（非单点）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：sparkline 折线点数可由组件测试断言（`data` 数组长度 / 渲染的 `circle` 数）；真实历史采集依赖运行期，集成测试用真实 store + 多次 insert 模拟。
- 其余 AC：全部可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `query_trend_series` 取点逻辑用真实 observation-store（temp db）验证，不 mock，以暴露分桶/取最新类回归。
- 分桶断言对象：序列长度 ≤ 120、桶内取最新（同桶多 observation 取 observed_at 最大）、原始点不足 max_points 时长度 = 原始点数。
- 窗口选择器前端测试：断言 getBulk payload 携带选中 days、切换触发新取数、切回走缓存；缓存键含 days。
- 现有 t006/t018 trend fixture 与 sparkline 测试若依赖「7 点固定」需按新语义更新（旧测试原样保留或整体删除并写明理由，禁止把旧断言改成当前实现输出而无依据）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 窗口选项持久化：已核实 config 有 per-view 偏好字段（`collapsedAccounts` 等，持久化于 config），技术上可加字段。本 task 决定不持久化（session 内 useState，重启回默认 7 天），避免扩 config schema；持久化作为后续增强登记 pending。

### 风险与回退

- 风险：`query_trend_series` 既有调用方（local-api `/v1/trend`、web `/v1/trend`、IPC `trend:get`/`getBulk`）都依赖「返回 days 个点、按天」的语义；改分桶后返回长度与语义变（≤max_points，按桶非按天）。须全链路同步，遗漏一处会导致前端画错（如仍按天数补 null）。MEMORY: convergent functions sync——改分桶时所有调用点与下游一起改。
- 风险：`build_trend_series` 的 null 填充语义（缺日填 null）基于「按天」。改桶后空桶语义变化，须重新定义（空桶是否画点/连线）。
- 风险：前端缓存键若漏加 days，切换窗口会显示旧窗口缓存。
- 回退：恢复 `query_trend_series` 按天分桶与前端固定 7 天（diff 集中在 store + 前端两处），存量数据未动。

### 依赖与约束

- 无新增外部依赖。
- 受影响：`src/main/core/observation/observation-store.ts`（query_trend_series）、`src/shared/lib/trend.ts`（build_trend_series null 语义）、`src/main/ipc/trend-ipc.ts`、`src/main/core/local-api/server.ts`、`src/web/usageboard-web.ts`、`src/renderer/components/ProviderAccountRow.tsx`（窗口选择器 + 缓存键 + days 透传）、`src/shared/types/ipc.ts`（TrendPeriodRequest 注释订正）。

### Finalization 时更新的 blueprint

- `docs/specs/observation-store.md`：`query_trend_series` 条目改述为「固定桶数（≤max_points）均分窗口、每桶取最新」，删「按 UTC 天分桶、长度=days」表述。
- `docs/specs/ipc-api.md`：trend 通道补窗口选择（days 参数语义）。
- `docs/findings.md`：追加 dNNN 记录「sparkline 取点策略：固定 max_points 桶 + 窗口选择；DB 细粒度存储与查询分桶的区别」。
