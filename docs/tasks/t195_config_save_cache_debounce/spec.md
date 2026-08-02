# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

popup 每个 UI 偏好开关走 `config.get()` + 全量 `config.save()`（`PopupView.tsx:169-182`）。主进程 `onConfigSaved` 级联：多次 load（每次重读磁盘 + 16 个 connector manifest 健康检查）、`resolveProxy` 网络调用、向所有窗口广播 CONFIG_CHANGED（`index.ts:331-378`）。refresh 每次重读 + 重新 transpile 连接器脚本、vault 每次重读整份密钥文件。高频 UI 操作全排在 save 串行队列后。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- config-store 增加内存缓存，load 不再每次读盘 + 全量 zod parse + 逐插件 manifest 健康检查；唯一写入口 save 失效缓存。manifest 健康检查移到启动与结构变更时一次性执行。
- vault 后端增加内存镜像，密钥读取不再每次重读整份文件。
- 连接器脚本 transpile 结果按 mtime 缓存，刷新不再每次从磁盘重读重编译。
- renderer UI 偏好（折叠/展开/排序等）改为乐观本地生效，`config:save` 防抖合并提交，不等响应就更新界面。
- `onConfigSaved` 副作用按变更字段分流：代理探测只在代理相关字段变化时触发；scheduler reconcile 保持现有「仅调度集合变化才 rebuild」语义。

### 非范围

- 不改 config 文件格式、schema、auto-seed 与配置导入语义。
- 不改 connector 沙箱执行模型（仍 node:vm）、secret 暴露策略。
- 不改 IPC 契约与 route capability 分权。
- 不改 agent/TokenStats 查询链。
- 不改手动刷新的 await 语义（属 t196）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：连续多次 config 操作，主进程不再每次重读磁盘配置文件与逐插件 manifest；load 命中内存缓存。
- [ ] AC2：save 唯一写入口正确失效缓存，读到的始终是最新已保存配置，并发读改写下不出现脏读或丢失。
- [ ] AC3：连续刷新连接器，脚本文本未变时不重新 transpile；vault 密钥读取不每次重读整份文件。
- [ ] AC4：UI 偏好切换立即本地生效，不等 save 响应；快速连续多次切换只触发一次合并 save。
- [ ] AC5：代理探测只在代理相关字段变化时触发；scheduler reconcile 仍只在调度集合变化时 rebuild，纯 UI 字段变化不触发采集调度变更。
- [ ] AC6：CONFIG_CHANGED 广播内容与之前一致；renderer 配置应用路径行为不变（仍只同步 state，不反向 save）。
- [ ] AC7：`[deploy]` 打包后真实启动，连续 UI 操作无明显卡顿，配置写入不丢且重启后生效。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC7：真实打包启动体感与持久化需人工签收；AC1–AC6 自动化覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测缓存命中绝对耗时：硬件差异，由性能观察而非固定阈值。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- config-store 测试用真实文件 IO 验证缓存命中、save 失效、并发读改写、ENOENT 与损坏处理（保持 t111 语义）。
- vault/connector 缓存测试断言命中与失效，secret 仍正确注入且脱敏。
- renderer 测试断言乐观更新、防抖合并与广播应用，确认不反向 save。
- scheduler-orchestrator 回归：reconcile 仅调度集合变化才 rebuild（既有测试约束）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 缓存失效的单一写入口边界：UNVERIFIED-SPIKE，执行期核实 config-store/vault 是否存在唯一写路径；多写点需逐个挂失效或改单写入口。
- manifest 健康检查移到启动时的扫描覆盖：UNVERIFIED-SPIKE，执行期核实哪些路径依赖即时 manifest stat，确认启动期 + 结构变更触发能覆盖。

### 风险与回退

- 风险：缓存失效漏挂导致读到过期 config/vault/脚本；乐观更新与广播竞态导致 UI 与持久化不一致；manifest 检查移走后损坏插件检测延迟。
- 回退：每层缓存独立可关；回退实现 commit 恢复每次读盘语义，不涉及数据迁移。

### 依赖与约束

- 无前置依赖；与 t194、t196 并行独立。
- 缓存、并发与配置正确性使用 full review。
- renderer 响应配置广播只同步 state，不反向 save（t153 不变量）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：config/vault/connector 脚本缓存层与失效数据流；onConfigSaved 副作用分流。
- `docs/blueprint/decisions.md`：缓存粒度、失效策略与 manifest 检查时机取舍。
- `docs/specs/ipc-api.md`：config:save 防抖与乐观更新契约（如有契约变化）。
