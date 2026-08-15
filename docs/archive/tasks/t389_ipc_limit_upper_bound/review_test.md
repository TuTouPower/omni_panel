# Task review t389（reviewer_focus: 测试）

- task：`t389_ipc_limit_upper_bound`
- spec：`docs/tasks/t389_ipc_limit_upper_bound/spec.md`
- diff_anchor：`ce0fcd6133a6e383b97b0b7e096d764b80a8c601`
- target：`git diff ce0fcd6133a6e383b97b0b7e096d764b80a8c601`
- round：1
- reviewed_at：2026-08-15 08:20 UTC+8

## Findings

### t389_test_f001 - AC-003 RECORDS 正常小 limit 用例缺 ok 响应断言

- 严重度：minor
- 锚点：AC-003「正常小 limit 行为不变」；行为缺陷——返回路径 ok 包裹被破坏时无证据
- 位置：`tests/unit/ipc/token-stats-ipc.test.ts:214-229`（"t389 AC-003: TOKEN_STATS_RECORDS 正常小 limit 行为不变"）
- 问题：`tokenStats:records` 正常路径两处调用均丢弃返回值，只断言 `query_records` 被调用参数正确，未断言响应 `{ ok: true, data: [] }`。对照同 diff 的 AC-002 正常路径（`:156-158`）断言了 `result` 全等，AC-003 缺这一层。若实现把合法 limit 的 ok 包裹破坏（例如校验分支短路后返回 `ok: false` 但仍调 store，或包错 data），测试仍 PASS。虽然 `query_records` 转发断言已覆盖「合法 limit 不被拒」这一 AC 核心，但响应形态未锁定。
- 建议：与 AC-002 对齐，对 `{ limit: 100 }` 的返回补 `expect(result).toEqual({ ok: true, data: [] })`（store mock 返回 `[]`）。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 改测方向复核：无。本 diff 对两个测试文件均为纯新增，未修改/删除/反转任何既有断言；既有 RECENT 透传测试（`session-history-ipc.test.ts:357-370`）原样保留、语义仍成立。
- 本轮新发现：1 条（f001 minor）
- 未进表的提示：
  - token-stats 两通道坏值数组 `[MAX_SAFE_INTEGER, 0, -5, 1.5]` 缺 `Number.NaN`（RECENT 通道有）。`1.5` 已触发同一 `Number.isInteger` 假分支，属「可再加 case」，不阻断。
  - 上界边界值未测（`10000` 放行 / `10001` 拒绝）；`RECENT_LIMIT_MAX`/`TOKEN_STATS_LIMIT_MAX` 均取 10_000，AC 未锁定具体上界，属可选。
  - AC-001/004 只断言 `ok === false`，未断言 `error.code === "INVALID_LIMIT"`；AC 可观察为「被拒」，`ok:false` 已覆盖，错误码为强化项。
  - mutation 敏感性已核：`valid_limit` 恒 true → AC-002/004 超大/非法（sessions、records）两例失败；RECENT 校验移除 → AC-001/004 两例失败；AC-003 缺省用例对「handler 注入默认 limit」变异敏感（`toHaveBeenCalledWith({})` 会失败）。实现选「拒绝」语义，测试与 spec 允许的「被拒或钳制」中「被拒」分支一致。
  - AC-003 缺省语义断言（`query_records` 原样传 `{}`）与实现 `filters ?? {}` 一致，store 层 `?? DEFAULT_RECORDS_LIMIT`（5000）缺省语义属 spec 非范围，handler 边界断言恰当。
- 总体判断：4 条 AC（AC-001/002/003/004）三通道全覆盖，断言触达用户可观察行为（拒绝 + 不触发 store 拉取 + 正常转发），无恒真/删反转/注释/跳过/静默错误/mock 误用等危险模式，mutation 敏感；唯一 minor 不阻断。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 9bb30a331d28764e

## Round 2 (2026-08-15 08:21 UTC+8)

Round 1 之后 implementer 声明的修复，已对照当前 `git diff ce0fcd61` 复核。

### 前轮 finding 复核

- **t389_test_f001（minor，RECORDS 正常路径缺 ok 断言）**：已消除。`token-stats-ipc.test.ts:224` 对 `{ limit: 100 }` 补 `expect(result).toEqual({ ok: true, data: [] })`，与 AC-002 正常路径（`:157`）形式一致，全等断言、非弱化，正确锁定 ok 响应形态。
- **NaN 补充（未进表的 minor 提示）**：已采纳。SESSIONS（`:171`）与 RECORDS（`:241`）坏值数组均补入 `Number.NaN`，与 RECENT 通道一致，覆盖非数路径。

### 改测方向复核

无。两处修改均为纯新增断言/新增数组元素，未删除/反转/弱化既有断言；`Number.NaN` 入坏值数组后 loop 断言 `ok:false`，正确。

### 本轮新发现

0 条。危险模式扫描：新增断言为 `toEqual` 全等；`NaN` 进坏值数组不产生恒真；无跳过/注释/静默错误/mock 误用。

### 验证

`npx vitest run tests/unit/ipc/token-stats-ipc.test.ts tests/unit/ipc/session-history-ipc.test.ts`：48 passed（含本轮全部新增用例）。

### 总体判断

f001 与 NaN 均真实修复且未引入弱化；无新问题。Round 2 零未决 finding，可 PASS。

verdict: PASS
reviewed_scope: 4dca9cb04a781a50
