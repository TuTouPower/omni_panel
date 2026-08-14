# Task spec

## 背景

OAuth 自动刷新链路多处无错误处理，vault 读失败会落进主进程 `unhandledRejection` 只打日志，自动刷新链静默中断；设备码登录取消在 HTTP 轮询窗口内丢失（`cancel_device_login` 只在 `sleep()` 内注册取消闭包），取消后仍可能落库 token；`device_id` 每次请求都读文件；`store_tokens` 部分写失败造成 vault 半更新。

## 契约区

### 范围

- `schedule_auto_refresh_if_enabled` 整体 try/catch，失败 log.error 并保留 instance 待下次调度。
- `refresh_now` 的 `load_tokens` 移入 try；timer 回调统一 `.catch` 且 catch 打含 instance_id 日志。
- 设备码登录取消在轮询窗口内也生效（登录循环顶部与 mutation 内检查取消标志），取消后不再写 token。
- `device_id` 进程内缓存，仅首次读取/失败重读。
- `store_tokens` 任一步写失败时回滚已写键（写前快照旧值）或记录一致性告警。

### 非范围

- 不改 OAuth 协议/端点。
- 不做 manager 参数化收敛（见 t339）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：vault 读失败时 `schedule_auto_refresh_if_enabled` 不产生 unhandled rejection，记录含 instance_id 的错误日志。
- [ ] AC-002：设备码登录轮询窗口内 `login_cancel` 生效，取消后不再把 token 写入 vault。
- [ ] AC-003：`device_id` 读取在进程内缓存，同一运行期不重复读文件。
- [ ] AC-004：`store_tokens` 任一步失败时回滚已写键，vault 不处于不一致中间态。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：mock vault.get 抛错、轮询窗口取消时序、device_id 读次数、store_tokens 部分失败回滚。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`grok_oauth_manager.ts:392`、`:161-191`、`kimi_oauth_manager.ts:161`、`oauth_helpers.ts:142`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `vault.get` 抛错与慢轮询时序；断言取消闭包在轮询窗口注册、取消后 mutation 不触发。
- 断言 device_id 读文件次数 == 1；store_tokens 失败后旧值恢复。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：取消检查点遗漏某条 mutation 路径。
- 回退：统一在 `enqueue_token_mutation` 入口检查取消标志，单一收口。

### 依赖与约束

- 依赖：t339（若先做参数化，本 task 应基于参数化后代码）。

### Finalization 时更新的 blueprint

- 无
