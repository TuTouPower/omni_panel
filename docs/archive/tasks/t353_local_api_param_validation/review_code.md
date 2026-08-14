# Task review t353（reviewer_focus: 代码）

- task：`t353_local_api_param_validation`
- spec：`docs/tasks/t353_local_api_param_validation/spec.md`
- diff_anchor：`5bb87cadc41bf024947778b84fac497aff489884`
- target：`git diff 5bb87cadc41bf024947778b84fac497aff489884`
- round：1
- reviewed_at：2026-08-14 00:23 UTC+8

## Findings

### t353_code_f001 - `?start=`/`?end=` 空串从「省略」收紧为 400，且与 dashboard zod 容错不一致

- 严重度：minor
- 锚点：行为缺陷 — `GET /v1/records?start=` 原本省略 start 过滤，现返回 400
- 位置：`src/main/core/local-api/server.ts:743`（`raw.trim() === ""` 抛 InvalidParamError）；records/heatmap/hourBuckets/rollup 调用点 `:1257-1258/:1274-1275/:1292-1293/:1310-1311`
- 问题：旧实现 `start ? { start: Number(start) } : {}`（`server.ts` 改动前 `:1189-1190`）把空串视为 falsy 省略，`?start=` 语义为「无过滤」。新 `parse_int_param` 对空串抛 400，属可观察行为收紧。spec 背景描述的原始缺陷是「非数字 → NaN 直入 SQL」，空串本不产生 NaN（被省略），不在缺陷族内；AC-001 以 `abc` 类非数字为锚，空串是否算「非法数值」是灰度。另与对齐目标不一致：dashboard zod 走 `Number("") = 0`（`server.ts:1186`）接受 `?start=`，records 等却 400，错误分类一致（AC-003 满足）但容错口径分叉。
- 证据复核：首方调用方不受影响——usageboard-web.ts:483-484/493-494/503-504 仅在 `filters.start !== undefined` 时 set，从不发空串。
- 建议：可接受（统一 400 符合 spec 意图、无首方破坏），但属契约收紧，建议在 spec 上下文区或 handoff 记录该口径；若意图仅修复 NaN 直入 SQL，可改为空串→省略（返回 null 而非抛错）以与 dashboard 对齐。

### t353_code_f002 - `require_present` 选项在所有调用点不可达；`parse_int_param` 名称与语义不符（接受浮点）

- 严重度：minor
- 锚点：死 API 面 + 命名误导（非 blocking）
- 位置：`src/main/core/local-api/server.ts:739`（require_present 抛错点）、`:1339/:1343/:1356/:1363`（sessions 四处调用均先 `params.has(...)` 守卫）；`parse_int_param` 定义 `:732-751`
- 问题：(a) sessions 四处调用全部包在 `params.has("start_at"/"end_at"/"limit"/"offset")` 内，raw 恒非 null，`require_present: true` 分支实际不可达——选项是死防御面。(b) 函数名 `parse_int_param` 暗示整数校验，实为 `Number.isFinite`（`server.ts:746`），`?start=1.5` 返回 1.5 不拒绝；语义保留旧行为（旧 `Number(start)` 同样接受浮点）故非回归，但命名误导未来调用者以为整数被强制。
- 建议：(a) 删除 `require_present` 选项或将守卫移入 helper；(b) 改为 `parse_numeric_param`/`parse_finite_param`，或明确注释「保留浮点兼容」。

### t353_code_f003 - sessions/sessionHistory 中 `if (x !== null)` 冗余空守卫恒真

- 严重度：minor
- 锚点：可读性（非行为缺陷）
- 位置：`src/main/core/local-api/server.ts:1340/:1360/:1364`（sessions start_at/limit/offset）、`:354`（sessionHistory limit）
- 问题：`parse_int_param` 在 raw 存在时只可能返回 number 或抛错，从不返回 null。sessions 调用点均已在 `params.has(...)` 内、sessionHistory 已在 `limit_raw !== null` 内，故 `if (x !== null)` 恒真，属死分支，误导读者以为可能为 null。
- 建议：`params.has` 守卫内直接 `filters.start_at = parse_int_param(...)`；sessionHistory 内直接 `Object.assign(options, { limit: parse_int_param(...) })`。

### t353_code_f004 - handle_web_read catch 冗余 `&& err instanceof Error`，且同名双判断同模块内不必要

- 严重度：minor
- 锚点：可读性（非行为缺陷）
- 位置：`src/main/core/local-api/server.ts:1149-1153`
- 问题：`(err instanceof InvalidParamError || (err instanceof Error && err.name === "InvalidParamError")) && err instanceof Error`——两个析取支均已蕴含 `err instanceof Error`，尾部 `&& err instanceof Error` 恒真冗余。且 InvalidParamError 与 parse_int_param 同文件（`:725` 与 `:732`），同模块实例下 `instanceof` 必然成立，`name` 比对仅为跨模块双实例的防御性兜底，当前代码路径永不触发；ESM 双实例隐患在既有 server/connector 加载架构下并未实际存在。
- 建议：去掉尾部 `&& err instanceof Error`；保留 name 比对作为防御可接受，或简化为单 `name` 判断。

### t353_code_f005 - `export class InvalidParamError` 零引用导出

- 严重度：minor
- 锚点：死代码 / 多余公共面（非 blocking）
- 位置：`src/main/core/local-api/server.ts:725`
- 问题：`InvalidParamError` 标记 `export`，但全仓（src/、tests/）grep 零导入——测试断言 HTTP 状态与 `{ error: ... }` 体（`tests/integration/local-api/server.test.ts:1136-1143`），未引用该 class。review 背景问「导出让测试可引用是否合理」：测试未引用，export 无消费方。
- 建议：去掉 `export`；若测试确需引用错误类别，再按需导出。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：5 条（全部 minor）
- 未进表的提示：
  - 文件过大：`src/main/core/local-api/server.ts` 1730 行（≥800 阈值），本 task 净增约 98 行；单文件 HTTP server 处理器属既有协议一体文件，本 task 改动量可控，按降级规则不进 finding 表。
  - 范围外观察：spec 背景列 `/v1/buckets` 为受害端点，实际该端点只用 env（`server.ts:1372-1380`）无 `Number(params.get(...))`，实现未触碰，正确无偏航。`/v1/sessionStats`/`/v1/status` 无数值参数，无需改。
  - 复杂度：`handle_web_read_inner` 为大 switch 分发（每支一行转发），按排除规则不计。
- 总体判断：AC-001/002/003 全部落地，非法输入统一 400、不变量（不改查询语义）守住，无范围外改动；typecheck 通过，server.test.ts 全 77 例通过（含新增 11 例 t353 用例），异常分类正确（InvalidParamError→400，store 错误经 rethrow→500，dashboard 区 zod/store 错误独立处理未被误伤）。5 条 finding 均为 minor 级质量/可读性项，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
