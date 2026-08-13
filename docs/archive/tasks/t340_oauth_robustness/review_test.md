# Task review t340（reviewer_focus: 测试）

- task：`t340_oauth_robustness`
- spec：`docs/tasks/t340_oauth_robustness/spec.md`
- diff_anchor：`698fe185c85d732eaabcf5b634aff02445d1a397`
- target：`git diff 698fe185c85d732eaabcf5b634aff02445d1a397`
- round：1
- reviewed_at：2026-08-13 15:24 UTC+8

reviewed_scope: 3e7a06c564da6c6b

## Findings

### t340_test_f001 - AC-001「记录含 instance_id 的错误日志」无测试覆盖

- 严重度：important
- 锚点：AC-001 第二分句「记录含 instance_id 的错误日志」
- 位置：`tests/unit/auth/device_code_oauth_manager.test.ts:231-254`（t340 AC-001 测试）
- 问题：AC-001 含两个可观察行为：(a) 不产生 unhandled rejection，(b) 记录含 instance_id 的错误日志。当前测试只验证 (a)——监听 `process.unhandledRejection` 并断言 `unhandled` 为空，未捕获/断言任何日志输出。实现侧确实记录了该日志（`src/main/core/auth/device_code_oauth_manager.ts:474`：`auto_refresh: failed to schedule for ${instance_id}: ${msg}`），但无任何测试触达这条输出。logger 暴露 `addTransport`（`src/shared/lib/logger.ts:94`），日志捕获在自动测试中可低成本实现，故 (b) 属可测而未测。整仓 auth 测试无一处断言 log 内容（`grep addTransport|log.error` 于 `tests/unit/auth/*.test.ts` 为空），即 (b) 不是被其它用例覆盖，而是完全无覆盖。
- 建议：在 AC-001 测试中通过 `addTransport` 注册捕获 transport，断言收到 `level === "error"` 且 message 含 `inst-vault-fail`（instance_id）的记录，测试结束移除 transport。

### t340_test_f002 - AC-002 mutation 闭包内取消检查点无独立测试

- 严重度：minor
- 锚点：AC-002；实现内 `enqueue_token_mutation` 闭包第二取消检查点（`src/main/core/auth/device_code_oauth_manager.ts:247-249`）
- 位置：`tests/unit/auth/device_code_oauth_manager.test.ts:192-229`
- 问题：AC-002 测试覆盖「HTTP 轮询窗口内 cancel」：poll 请求挂起时 cancel、token 响应晚到后循环顶部 `cancelled_ref.current` 检查返回 `{saved:false}`，vault 不落库，已真实验证。实现另有一道 mutation 内取消检查点（cancel 恰在 token 已返回、mutation 执行中触发时二次兜底），spec 风险区亦明确列出「取消检查点遗漏某条 mutation 路径」。该路径无独立测试（需先 resolve token 再于 mutation 窗口 cancel，难以确定性构造，属防御性兜底）。AC 可观察行为已被验证，此为覆盖扩展建议。
- 建议：可选补一例：token 先 resolve、紧随 cancel，断言 mutation 内检查同样不落库。非阻断。

### t340_test_f003 - AC-003 缓存跨 resolver 实例共享未直接验证

- 严重度：minor
- 锚点：AC-003「device_id 读取在进程内缓存」
- 位置：`tests/unit/auth/kimi_device_id_cache.test.ts:8-26`
- 问题：两例均对同一个 `make_default_get_device_id()` 返回的 resolver 实例调用两次验证读文件一次。缓存实为 module 级 `cached_device_id`（`src/main/core/auth/kimi_oauth_manager.ts:60`），跨 resolver 实例共享才是「进程内缓存」语义的直接体现。单实例复测与跨实例共享行为等价（闭包读同一 module 状态），测试可信不受影响，仅精度可再高。
- 建议：可选：`make_default_get_device_id()` 创建两个实例各调一次，断言 readFile 仅 1 次且两值相同。

### t340_test_f004 - AC-004 仅覆盖第二步写失败，首/末步失败分支未测

- 严重度：minor
- 锚点：AC-004「store_tokens 任一步失败时回滚已写键」
- 位置：`tests/unit/auth/oauth_helpers.test.ts:241-296`
- 问题：两例都让第 2 次 `vault.set`（refresh）抛错触发回滚。第 1 次 set（access）失败（此时无键写过、回滚为幂等恢复/删除）与第 3 次 set（expires）失败（access/refresh 已写新值需回滚旧值）两个分支未覆盖。核心场景（部分写成功后失败 → 全部键恢复一致态）已验证，AC 主行为可信。
- 建议：可选补一例：令第 3 次 set 失败，断言 access/refresh 恢复旧值、expires 删除或恢复旧值。非阻断。

## 结论

- 前轮 finding 复核：Round 1，不适用。
- 改测方向复核：无。diff 仅向三个测试文件追加用例并新增一个测试文件，未修改任何既有测试的预期或删除既有测试；无「迁就实现」改测。
- 本轮新发现：4 条（f001 important，f002/f003/f004 minor）。
- 未进表的提示：
    - AC-001 测试的 unhandledRejection 监听窗口有效性已实证复核：在 `.scratch/` 构造与 AC-001 同结构的探针（buggy 实现：`void` 一个 `await Promise.reject(...)` 的 async 函数），按测试同样的 fake-timer + `advanceTimersByTimeAsync(1000)` + 单次 `await Promise.resolve()` 序列，断言 `unhandled` 长度 0 会 FAIL（探针得到长度 1）。故该测试非恒真，能捕获 try/catch 移除类回归。纯 node 探针另证实：一次微任务 flush 不足以让 `unhandledRejection` 事件触发，但 vitest fake-timer 环境内该窗口足够，测试实际有效。
    - `vi.resetModules()` + 动态 import 隔离 module 级 `cached_device_id` 的方式有效：spy 在 `node:fs` 单例对象上生效（两例的 `toBe("cached-dev-id")` / `toHaveBeenCalledTimes(1)` 断言均通过，若 spy 未生效这些断言会因读真实文件而失败）。测试文件间由 vitest 默认隔离，无跨文件缓存污染。
    - 131 例目标测试全过（`vitest run tests/unit/auth/ tests/unit/ipc/grok_auth_ipc.test.ts tests/unit/preload/ tests/unit/shared/schema_export_freshness.test.ts` → 12 files / 131 tests passed）。10 个 electron 环境文件（p153 path.txt 缺失）不在本批，与 task 无关。
- 总体判断：AC-002/003/004 测试有效且直接验证可观察行为；AC-001 的「不产生 unhandled rejection」分句测试有效，但「记录含 instance_id 错误日志」分句完全无测试覆盖，为未解决的 important。补 AC-001 日志断言后可 PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`（分句 a「不产生 unhandled rejection」：运行测试通过 + 探针证实 buggy 实现下监听窗口会 FAIL，非恒真；分句 b「日志含 instance_id」无测试，见 f001，实施侧须补）。
- AC-002：`re_verified`（运行通过；逐行追踪确认 cancel 发生在 HTTP poll 挂起窗口内、token 晚到后循环顶部检查返回 `{saved:false}`，vault 无 token 写入，断言与 AC 一致）。
- AC-003：`re_verified`（运行通过；readFile spy 计数断言 + resetModules/动态 import 隔离 module 缓存，断言值证明 spy 生效；失败生成分支缓存与写盘一次均验证）。
- AC-004：`re_verified`（运行通过；两次 set 失败后三键恢复旧值 / 新键被删除，断言直接观察 vault 最终态）。
- coverage = 4 / 4（AC-001 复验覆盖分句 a；分句 b 缺口已在 f001 披露）

verdict: FAIL

## Round 2 (2026-08-13 15:35 UTC+8)

reviewed_scope: 72f203177408bed7

### 前轮 finding 复核

- **f001（important）— 已消除**：AC-001 测试已补日志断言。`tests/unit/auth/device_code_oauth_manager.test.ts:232-265` 现注册 `addTransport` 捕获 transport（`write` 收集 `{level, message}`），断言 `logs.some((l) => l.level === "error" && l.message.includes("inst-vault-fail"))` 为 true。生产实现对应日志 `src/main/core/auth/device_code_oauth_manager.ts:474`（`auto_refresh: failed to schedule for ${instance_id}: ${msg}`），message 含 instance_id「inst-vault-fail」，level 为 error。断言有效性核验：若生产 `log.error` 被移除或 message 去掉 instance_id，`logs` 为空或不含该串 → `some(...)` 为 false → `.toBe(true)` FAIL。非恒真。`emit` 对 transport 为同步调用，断言前 `logs` 已填充，无异步时序缺口。已实测 `vitest run tests/unit/auth/device_code_oauth_manager.test.ts` 5/5 过。
- **f002（minor）— 仍存在**：AC-002 测试未变，mutation 闭包内取消检查点（`device_code_oauth_manager.ts:247-249`）仍无独立测试。非阻断，维持 minor。
- **f003（minor）— 仍存在**：device_id 缓存测试仍为单 resolver 实例复用，跨实例共享语义未直接验证。非阻断，维持 minor。
- **f004（minor）— 仍存在**：store_tokens 仅覆盖第 2 次 set 失败分支，首/末步失败未测。非阻断，维持 minor。

### 改测方向复核

无。本轮仅就地给 AC-001 测试补日志断言（title 与断言扩展），未改动任何其它既有测试预期、未删除测试、未反转/弱化断言。`logs.some(...).toBe(true)` 为日志存在性断言，语义恰为「存在一条 level=error 且含 instance_id 的日志记录」，强度匹配期望行为，非危险弱化。

### 本轮新发现

0 条。

### 未进表的提示

- 131 例目标套件全过（`vitest run tests/unit/auth/ tests/unit/ipc/grok_auth_ipc.test.ts tests/unit/preload/ tests/unit/shared/schema_export_freshness.test.ts` → 12 files / 131 tests）。10 个 electron 环境文件因 p153 不属本批，与本 task 无关。
- Round 1 的 f002/f003/f004 属 minor，非阻断，可留待 implementer 在处置表标记「遗留」；不影响 PASS。

### AC 复验方式

- AC-001：`re_verified`（两分句现均有测试：分句 a unhandledRejection 监听窗口 Round 1 已实证有效；分句 b 本轮新增 addTransport 日志断言，运行通过，反证有效性已核验）。
- AC-002：`re_verified`（Round 1 复验不变，测试未改动）。
- AC-003：`re_verified`（Round 1 复验不变）。
- AC-004：`re_verified`（Round 1 复验不变）。
- coverage = 4 / 4（AC-001 两分句均复验）

### 总体判断

f001（唯一 blocker）已真实修复并经实证核验；f002/f003/f004 为非阻断 minor。无未解决 critical / important。

verdict: PASS
