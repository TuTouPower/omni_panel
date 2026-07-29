# Task review t160（reviewer_focus: 代码）

- task：`t160_fix_grok_zero_percent_omission`
- spec：`docs\tasks\t160_fix_grok_zero_percent_omission/spec.md`
- diff_anchor：`d9cf0499d7600b814f44bbadda660494e16f4bb6`
- target：`git diff d9cf0499d7600b814f44bbadda660494e16f4bb6`
- round：1
- reviewed_at：2026-07-29 04:33 UTC+8

## Findings

### t160_code_f001 - 显式非法百分比被误判为 proto3 省略零值

- 严重度：important
- 位置：`connectors/grok/connector.ts:94`
- 问题：当前 fallback 只判断值是否为有限 number；只要 `currentPeriod` 有效，显式 `null`、字符串或其他非法 `creditUsagePercent` 也会落入 `0`。例如响应包含完整 weekly 周期与 `creditUsagePercent: null` 时，connector 会生成 `used=0`、`status=normal`，不进入 failed/stale，违反 spec 仅对“字段缺失”恢复 proto3 默认值、未知响应不得伪造的约束。
- 建议：区分字段缺失与字段存在但非法；仅在 `creditUsagePercent === undefined` 且周期有效时回填 `0`，其余非有限 number 继续视为未知响应。

### t160_code_f002 - 周期日期未做运行时字符串校验

- 严重度：important
- 位置：`connectors/grok/connector.ts:53`
- 问题：billing 响应来自 `unknown` 后直接类型断言，`period.start/end` 没有运行时类型保证；当前真值检查后直接调用 `Date.parse`。Node 会把数字强制转成字符串，例如 `start=1`、`end=2` 可解析成两个递增的 2001 年日期，使畸形周期通过校验，并在百分比省略时生成错误的 `0%` observation 与错误 reset 时间，而非保留 failed/stale。
- 建议：调用 `Date.parse` 前要求 `typeof start === "string"`、`typeof end === "string"`，再执行有限值与先后关系校验。

### t160_code_f003 - 总额度周期覆盖了 productUsage 原有重置时间

- 严重度：important
- 位置：`connectors/grok/connector.ts:85`
- 问题：新增 `currentPeriod.end` 被写入共享 `reset_at`，随后总额度和所有 product observation 都复用该值。基线中 productUsage 使用 `billingPeriodEnd`；当 `currentPeriod.end` 与 `billingPeriodEnd` 不同时，产品指标重置时间被改成总额度周期结束时间，违反 spec“现有 productUsage 行为保持不变”。
- 建议：拆分总额度与产品 reset 值；总额度优先使用有效 `currentPeriod.end`，productUsage 继续使用原 `billingPeriodEnd` 兼容路径，除非另有产品周期字段证据。

### t160_code_f004 - currentPeriod.type 映射未落地

- 严重度：important
- 位置：`connectors/grok/connector.ts:50`
- 问题：解析函数只接受 `USAGE_PERIOD_TYPE_WEEKLY`，总额度 observation 又在 `connectors/grok/connector.ts:108` 硬编码 `window: "week"` 与 7 天周期。Grok credits 的已知 monthly 周期携带显式百分比时仍会生成 observation，但被错误标为 week，且有效 `currentPeriod.end` 被忽略；百分比省略时则无法按有效周期恢复零值。这未落实 spec 与 plan 中“window 按 currentPeriod.type 映射”的实现要求。
- 建议：将周期解析改为返回 `reset_at`、`window`、`cycleDurationMs` 的已知类型映射；至少支持 weekly→week、monthly→month，未知类型保持未知响应，不猜测。

## 结论

- 本轮新发现：4 条
- 总体判断：weekly 0% 主路径已实现，但输入 presence/类型边界、产品重置兼容性与周期类型映射仍使实现不满足全部验收约束。

verdict: FAIL

## Round 2 (2026-07-29 04:58 UTC+8)

### Findings

### t160_code_f005 - 无效 currentPeriod 会丢弃显式有效百分比

- 严重度：important
- 位置：`connectors/grok/connector.ts:111`
- 问题：`total_period` 仅在周期解析成功或 `currentPeriod === undefined` 时存在。响应含显式有限 `creditUsagePercent`，但 `currentPeriod` 存在且类型未知、字段畸形或为 `null` 时，`total_percent` 虽有效，仍因 `total_period=null` 不生成总额度 observation。实际输入 `creditUsagePercent=25`、未知 period type、有效 `billingPeriodEnd` 会返回零 observations 并上报 failed_account；若同时有产品 observation，总额度还会静默消失。该行为回归了 spec 要求保留的显式非零百分比路径。
- 建议：周期无效时只禁止“缺失百分比回填 0”；显式有限百分比仍走旧 weekly/`billingPeriodEnd` 兼容路径，或为显式值单独定义不依赖有效 `currentPeriod` 的 fallback。

### t160_code_f006 - Date.parse 会把非法日历日期归一化为有效周期

- 严重度：important
- 位置：`connectors/grok/connector.ts:79`
- 问题：字符串类型检查修复了前轮数字强制转换，但 `Date.parse` 仍会接受并归一化非法日历日期。例如 weekly 周期 `start="2026-02-23T00:00:00Z"`、`end="2026-02-30T00:00:00Z"` 会把结束时间解析成 `2026-03-02`；字段省略时 connector 实际生成正常 `used=0` observation，而非把无效周期视为未知响应。这不满足 spec 的“完整有效 currentPeriod”判据。
- 建议：按接口时间格式做严格 ISO/RFC3339 校验，并验证解析后日期字段未被归一化；通过后再比较 start/end。

### t160_code_f007 - main 圈复杂度达到 important 阈值且较基线继续增加

- 严重度：important
- 位置：`connectors/grok/connector.ts:87`
- 问题：按提示词近似 McCabe 规则，当前 `main` 基数 1，加 `catch`、两个三元 reset/period 分支、percent 两层三元及短路条件、两个带短路条件的 `if`、产品循环和零观测分支后约为 CC 17；anchor 版本约为 CC 16。本 task 在已超过 CC 15 的函数继续增加分支，命中 important 标准。周期有效性、显式值兼容、零值 presence 与 observation 生成耦合在同一函数，已直接导致 f005 这类组合路径遗漏。
- 建议：提取总额度归一化函数，返回 `{ percent, period } | null`；在单一位置处理显式值、字段省略、周期映射和 legacy fallback，`main` 只负责组装 observations。

### 结论

- 前轮 finding 复核：`t160_code_f001` 已修（presence 与显式非法值已区分）；`t160_code_f002` 已修（start/end 已先做字符串类型检查）；`t160_code_f003` 已修（总额度与产品 reset 已拆分）；`t160_code_f004` 已修（weekly/monthly 已映射 window、周期时长与 reset）。
- 本轮新发现：3 条
- 总体判断：前轮 4 条均已针对性修复，但显式百分比兼容路径、新周期严格校验与控制流复杂度仍不满足验收和质量门槛。

verdict: FAIL

## Round 3 (2026-07-29 05:33 UTC+8)

### Findings

### t160_code_f008 - 严格日期 parser 拒绝合法的小写 RFC3339 时间戳

- 严重度：important
- 位置：`connectors/grok/connector.ts:64`
- 问题：新增正则只接受大写 `T` 和 `Z`，但 RFC 3339 §5.6 明确允许二者使用小写 `t` / `z`。实际输入完整 weekly 周期 `start="2026-01-04t00:00:00z"`、`end="2026-01-11t00:00:00z"` 且省略百分比时，Node 可正常解析两值，connector 却返回零 observations 并上报 failed_account；合法周期因此无法恢复 proto3 省略的 `0%`。
- 建议：正则对 `T` / `Z` 使用大小写兼容（例如 `[Tt]`、`[Zz]` 或受控 `i` flag），继续保留日历字段严格校验。

### 结论

- 前轮 finding 复核：`t160_code_f005` 已修（显式有限百分比在周期无效/缺失时恢复 legacy weekly 路径）；`t160_code_f006` 已修原场景（非法日历日期已拒绝），但新 parser 引入 f008 的合法 RFC3339 兼容缺口；`t160_code_f007` 修不彻底（`main` 已降至约 CC 10，但新建 `parse_rfc3339` 按基数、2 个 early-return `if`、闰年表达式 2 个短路分支、范围 `if` 的 8 个 `||` 与末尾三元计约 CC 15，仍命中 important 阈值）。
- 本轮新发现：1 条
- 总体判断：显式百分比与非法日期回归已修，但日期标准兼容性及新 helper 的 important 复杂度门槛仍未通过。

verdict: FAIL

## Round 4 (2026-07-29 05:55 UTC+8)

### Findings

### t160_code_f009 - 新增模块常量未使用 UPPER_SNAKE_CASE

- 严重度：minor
- 位置：`connectors/grok/connector.ts:64`
- 问题：新增模块级常量 `rfc3339_pattern` 与 `days_in_month` 使用小写命名，明确违反 `docs/blueprint/conventions.md:20` 的规则“常量用 `UPPER_SNAKE_CASE`（`DEFAULT_TIMEOUT_MS`、`MAX_HEIGHT_RATIO`）”。同文件既有 `ACCOUNT_ID`、`BILLING_PATH` 均遵循该规则，当前混用会使模块常量与普通局部变量难以按项目约定区分。
- 建议：最小重命名为 `RFC3339_PATTERN`、`DAYS_IN_MONTH` 并同步引用。

### 结论

- 前轮 finding 复核：`t160_code_f007` 已修（复杂逻辑已拆至 helper；`main` 约 CC 10，`parse_rfc3339` 约 CC 7，其余新增函数均低于 CC 15 important 阈值）；`t160_code_f008` 已修（正则接受 `[Tt]` / `[Zz]`，小写 RFC3339 完整周期实测生成正常 `used=0` observation）。`t160_code_f001`–`f006` 复核仍保持已修，无重新打开项。
- 本轮新发现：1 条
- 总体判断：功能与前轮正确性 finding 已闭合，但新增模块常量违反明确项目命名规则，本轮仍非零 finding。

verdict: FAIL

## Round 5 (2026-07-29 06:53 UTC+8)

### Findings

本轮零 finding。

### 结论

- 前轮 finding 复核：`t160_code_f009` 已修（模块常量已重命名为 `RFC3339_PATTERN`、`DAYS_IN_MONTH`，所有引用同步，符合 `docs/blueprint/conventions.md:20`）。`t160_code_f001`–`f008` 复核仍保持已修，无重新打开项。
- 本轮新发现：0 条
- 验证：Grok 专项 28 项、完整测试 184 文件/1883 项、TypeScript typecheck、connector ESLint、Prettier 与 `git diff --check` 均通过；实现源码 256 行、测试源码 594 行，未触发文件过大 finding 门槛。
- 总体判断：全部前轮 finding 已闭合，当前完整 diff 未发现新的规格合规、实现正确性或代码质量问题。

verdict: PASS
