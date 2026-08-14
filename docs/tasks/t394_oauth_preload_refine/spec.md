# Task spec

## 背景

OAuth 共享 manager 与 preload 的 3 条 minor 遗留合并（t339/t340/t341 review 遗留）：p154 的 preload 共享工厂 `create_oauth_apis` 用 `invoke<unknown>` + 整体 `as` 强转丢 per-provider 返回类型编译期强制，retry_failure_counts 清理（logout/stop_auto_refresh/shutdown 三处）无测试触达，stop/shutdown 的 grok-kimi 同副作用断言未落实；p155 的 store_tokens 回滚失败合并分支（rollback_errors 非空抛合并错误）无测试；p156 的 preload 本地 `is_ipc_result` 薄转发可去壳、summaries 通道 channel/payload 未断言。均为精化/测试覆盖，运行时行为不变。

## 契约区

### 范围

- `src/preload/`（及 OAuth 共享工厂相关）：
    - `create_oauth_apis` channel 映射带类型化 invoke，去掉整体 `as` 强转（对外类型与运行时不变）
    - 删除本地 `is_ipc_result` 薄转发，调用点直用 `ipc-envelope` 导出
- OAuth manager 测试：retry_failure_counts 清理（logout/stop_auto_refresh/shutdown 三处）可观察断言；stop/shutdown 的 grok-kimi 同副作用断言落实
- `oauth_helpers.ts` store_tokens 双故障（写入失败 + 回滚失败）合并分支测试
- sessionHistory summaries 通道 channel/payload 断言

### 非范围

- OAuth 认证协议/流程行为变更（精化仅编译期类型与测试）
- 其它 preload API 的类型重构（仅 OAuth 共享工厂与薄转发去壳）

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

- [ ] AC-001：preload 类型化 invoke——`create_oauth_apis` 不再用 `invoke<unknown>` + 整体 `as`，per-provider 返回类型（Grok/Kimi 的 LoginResult 等）编译期可强制；运行时返回形态不变。
- [ ] AC-002：retry 清理测试触达——logout/stop_auto_refresh/shutdown 三处对 `retry_failure_counts` 的清理副作用有测试断言（删除清理代码测试会失败；对比现在删掉清理代码测试仍全绿）。
- [ ] AC-003：回滚双故障合并分支——store_tokens「写入失败 + 回滚自身也失败」时抛出的错误含原始原因与回滚失败消息，有测试触达。
- [ ] AC-004：薄转发去壳——preload 本地 `is_ipc_result` 薄转发删除，调用点直用 `ipc-envelope` 导出，行为不变。
- [ ] AC-005：summaries 通道断言——sessionHistory summaries 的 IPC channel 与 payload（`toHaveBeenCalledWith("sessionHistory:summaries", ...)`）有测试断言。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：preload 类型由 typecheck 覆盖；清理/回滚/summaries 行为由单测断言。

## 上下文区

- 来源：p154 / p155 / p156（`docs/pending/todo/`；2026-08-13 登记，t339/t340/t341 review 遗留）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- OAuth 测试：注入小 `MAX_REFRESH_RETRIES` 或导出内部状态探针，断言 logout/stop/shutdown 清理副作用；构造写入失败 + 回滚失败的 vault 断言合并错误（AC-003）。
- preload 测试：summaries 通道断言 channel/payload；薄转发去壳后 typecheck 覆盖调用点。
- retry 清理测试须「删除清理代码则失败」（防测试假绿）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：preload 类型化重构若误改返回形态影响 OAuth 登录流程（Grok/Kimi）；retry 清理测试引入内部状态探针可能增加耦合。
- 回退：git 回退；运行时行为由既有 OAuth 测试锁定，AC-001 由 typecheck 锁定。

### 依赖与约束

- 无前置依赖。实现约束：运行时行为不变（类型化仅编译期）；retry 清理测试须能防假绿。

### Finalization 时更新的 blueprint

- 无
