# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t204 model 筛选实现已全窗口闭合（code/test review PASS），但 review Round 1 留下三条测试覆盖 minor（登记 p043）：AC4 remount 恢复路径、AC3 model+agent/platform AND 组合与窗口切换刷新、local-api 四端点与 IPC 透传及 `query_range_rollup` 过滤缺显式断言。生产代码无改动，纯补测试。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- AC4 remount：TokenStatsView 选定模型后卸载重挂载，从 localStorage prefs 恢复并以此发 query（含 model）。
- AC3 组合：model 与 agent/platform 同时过滤时 query 同时携带两者（AND）；切换时间范围后 dashboard.models 列表随之刷新。
- local-api 透传：`/v1/dashboard/sessions`、`/v1/heatmap`、`/v1/hourBuckets`、`/v1/rollup` 四端点收到 `model` 查询参数后透传给 store/dispatcher。
- IPC 透传：`tokenStats:heatmap`、`tokenStats:hourBuckets`、sessions 相关 handler 收到 model 后透传给 store。
- `query_range_rollup`：store 收到 filters.model 后仅返回该模型 rollup 行。

### 非范围

- 不改任何生产代码（src/）。若测试暴露真实缺陷，停下报告，不在本 task 内修。
- 不补 dashboard / dashboard 主端点透传（t204 已覆盖）。
- 不改 web 层（usageboard-web.ts，t204 已覆盖）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：TokenStatsView 选定 sonnet → unmount → remount，新实例首次 getDashboard 调用携带 `model:"sonnet"`（来自 prefs，非默认 all）。
- [ ] AC2：选定 agent=claude-code 且 model=sonnet 时，getDashboard 调用同时含 agent 与 model；mock 返回新 models 列表后切换时间范围触发重新拉取并更新下拉。
- [ ] AC3：local-api 集成测试断言 `/v1/dashboard/sessions`、`/v1/heatmap`、`/v1/hourBuckets`、`/v1/rollup` 带 `?model=X` 时 dispatcher/store 收到 model。
- [ ] AC4：IPC 单测断言 heatmap/hourBuckets/sessions handler 收到 model 后透传给 store 对应方法。
- [ ] AC5：store 单测断言 `query_range_rollup({model})` 仅返回该模型行（其他模型行被滤除）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试：renderer 组件单测（remount + 组合 + 刷新）、local-api 集成测（真实 server + mock dispatcher）、IPC 单测（mock store 断言透传）、store 单测（种子多模型 records 断言过滤）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- renderer：复用 token_stats_view.test.tsx 的 dashboard() helper 与 render/unmount 模式；remount 用二次 render。
- local-api：复用 server.test.ts 的 create_local_api_server + dispatcher mock 模式，新增四端点透传断言。
- IPC：复用 token-stats-ipc.test.ts 的 pick_handler + store mock 模式。
- store：复用 token-stats-store.test.ts 的 record()/query_range_rollup 模式，种子两模型断言过滤。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：测试暴露生产透传遗漏。处置：停下报告，登记为 bug，不在本 task 修生产代码。
- 回退：回退测试 commit 即恢复。

### 依赖与约束

- 依赖：t204 已合并 main（model 筛选实现就位）。

### Finalization 时更新的 blueprint

- 无。
