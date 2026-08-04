# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t192（增量聚合与数据版本）review 登记 6 条测试缺口：AC2 无多 session 增量直测（p032 = t192_test_f001）、AC3 失败/回滚批次不推进版本无测试（p033 = t192_test_f002）、AC4 竞态子句无事件路径专门测试（p034 = t192_test_f003）、AC3 main→preload 转发粘合层无测试（p035 = t192_test_f004）、AC5 读取规模无直接测量（p036 = t192_test_f005）、AC1 重启场景无专门测试（p037 = t192_test_f006）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 为 t192 增量聚合补齐 6 条测试缺口，覆盖多 session 增量隔离、失败/回滚版本、竞态子句事件路径、版本转发粘合、读取规模查询计划、重启持久化续写。

### 非范围

- 不改变增量聚合生产逻辑的统计口径或 DTO 契约。
- 不改写既有测试的既有断言语义（旧测试原样保留或整体删除并写明理由，禁止就地改预期）。
- 不为测试引入 mock 掉被测逻辑的替身；需要暴露内部状态时才加最小生产钩子。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：新增「两 session 入库 → 增量 upsert 仅触碰其一 → 不 backfill 直接 read_rollup == oracle_rollup」，验证未受影响 session 聚合不变（p032）。
- [ ] AC2：新增「类型非法 record 抛错后 `get_data_version()` 与 `query_records` 行数均不变」，验证失败批次整体回滚不推进版本（p033）。
- [ ] AC3：新增「查询 in-flight 时触发更新版本事件 → 旧响应晚到不覆盖新数据」的事件路径竞态用例（p034）。
- [ ] AC4：新增 ipc/preload 层 `onUpdated` 事件版本转发用例，验证 main→preload 版本号不丢失不错位（p035）。
- [ ] AC5：新增 `EXPLAIN QUERY PLAN` 断言命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`，验证读取规模与 records 总量解耦（p036）。
- [ ] AC6：新增「backfill 置 ready → close → reopen → ready 仍 true、再增量 upsert 后 read_rollup == oracle_rollup」重启持久化用例（p037）。
- [ ] AC7：上述用例全绿，且全量 `{test_cmd}` 无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测真实时间驱动的 TTL 过期：用注入时钟或版本比较模拟，沿用既有测试模式。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- store 层使用真实 SQLite 事务，构造失败注入（非法 record 触发抛错）验证回滚。
- 重启场景通过关闭 store 并重新打开同一 db 文件验证 ready 持久化。
- 版本转发在 ipc/preload 层用 mock 通道验证事件负载。
- 竞态子句在 renderer/view 层用可控延迟的 dashboard IPC mock 验证 request_id guard。
- `EXPLAIN QUERY PLAN` 在 store 集成测试中对窗口查询断言计划文本。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- ipc/preload 层现有 onUpdated 事件通道的确切形态与版本字段载荷：已验证（读代码）——main 进程 `BrowserWindow.getAllWindows().forEach(win.webContents.send(IPC_CHANNELS.TOKEN_STATS_UPDATED, data_version))`（`src/main/index.ts:316`），preload `create_on_updated_subscriber`（`src/preload/token-stats-events.ts`）注册 `ipcRenderer.on(TOKEN_STATS_UPDATED, listener)` 解析 number 载荷回调、非 number 归 0。t202 抽出该函数供 ipc/preload 层测试。

### 风险与回退

- 风险：失败注入可能暴露生产代码缺少错误边界；EXPLAIN 断言随 SQLite 版本/查询计划变化变脆。
- 回退：仅新增测试与最小钩子，回退即删除测试文件恢复；不涉及数据迁移。

### 依赖与约束

- 依赖 p032-p037 登记。
- 依赖 t192 增量聚合实现已合入 main。
- 约束：测试必须断言期望行为（oracle 对齐），不得为通过而弱化断言。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如 EXPLAIN 断言成为通用测试模式，补测试策略说明。
