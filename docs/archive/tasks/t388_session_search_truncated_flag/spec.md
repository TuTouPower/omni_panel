# Task spec

## 背景

会话内容搜索分页枚举带 `SEARCH_ENUM_CAP=100_000` 上限，双入口同机制（src/main/ipc/session-history-ipc.ts:71、src/main/core/local-api/server.ts:181，均 `while (page.length === CONTENT_SEARCH_PAGE_SIZE && rows.length < CAP)`）。会话库超 10 万条时枚举被静默截断，响应契约 `SessionHistorySearchContentResponse`（src/shared/types/ipc.ts:461）仅 hits/sessions、无 truncated 字段，renderer SessionLibrary.tsx 消费无截断感知。spec 风险与回退还承诺「超出时明确降级提示」，t354 实现未兑现。p172 已核实（2026-08-15）。

## 契约区

### 范围

- 搜索内容路径双入口响应加 `truncated` 降级信号：桌面 IPC（session-history-ipc.ts 搜索 handler）与 web local-api（server.ts 搜索路径）枚举达 `SEARCH_ENUM_CAP` 时 `truncated=true`。
- 共享契约 `SessionHistorySearchContentResponse` 增 `truncated: boolean` 字段。
- renderer SessionLibrary.tsx 消费 `truncated` 并展示降级提示。

### 非范围

- 订阅服务 searchContent 已 resolve 的 locs（无独立 cap，不动）
- 其它 cap 或枚举路径（已扫无同类）
- 提高 `SEARCH_ENUM_CAP` 本身（上限值语义不变）

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

- [ ] AC-001：超限截断带 truncated 标志——会话库超 `SEARCH_ENUM_CAP`（注入小 cap 或 mock 超限 provider）时，桌面 IPC 与 web 搜索响应均 `truncated=true`（对比修复前静默截断无信号）。
- [ ] AC-002：未超限 truncated=false——正常结果响应 `truncated=false`，既有调用方（不读该字段）行为不变（契约向后兼容）。
- [ ] AC-003：renderer 降级提示——SessionLibrary 收到 `truncated=true` 时展示「结果已截断」类提示，用户可感知结果不完整。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：IPC 测试注入小 cap 断言 truncated 标志；web server.test.ts 补 cap 路径；renderer 测试断言提示显隐。

## 上下文区

- 来源：p172（`docs/pending/todo/p172_session_search_cap_truncated_hint.md`；2026-08-15 子代理核实：cap 仅搜索内容路径双入口，响应契约无 truncated，renderer 无截断感知）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 桌面 IPC：`session-history-ipc.test.ts` 已有 t354 AC-003 cap 收敛测试（断言 provider 调用次数有界）；扩展为注入小 cap 后断言响应 `truncated=true`，并保留不超限 `truncated=false` 用例。
- web：`server.test.ts` 搜索路径补 cap 超限与不超限两用例断言 truncated。
- renderer：`SessionLibrary` 相关测试补 truncated=true 时提示显隐断言。
- 契约：`SessionHistorySearchContentResponse` 类型变更后 typecheck 覆盖双入口与 renderer 消费点。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：响应契约加字段影响既有消费方（renderer / 外部 web 客户端）——新增字段向后兼容（不读即忽略）；web 客户端为外部契约，需确认消费方不因额外字段报错。
- 回退：git 回退；`truncated` 为新增可选字段，旧数据格式仍可读。

### 依赖与约束

- 无前置依赖。实现约束：`truncated` 字段新增须向后兼容（不破坏既有消费方）；桌面与 web 双入口同契约同语义。

### Finalization 时更新的 blueprint

- 无
