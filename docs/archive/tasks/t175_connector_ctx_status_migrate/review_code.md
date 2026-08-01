# Task review t175（reviewer_focus: 代码）

- task：`t175_connector_ctx_status_migrate`
- spec：`docs/tasks/t175_connector_ctx_status_migrate/spec.md`
- diff_anchor：`8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- target：`git diff 8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- round：1
- reviewed_at：2026-08-01 09:50 UTC+8

## Findings

### t175_code_f001 - mimo usage 三元组重复计算 to_number

- 严重度：minor
- 锚点：无 AC 违反；新代码 DRY 瑕疵
- 位置：`connectors/mimo/connector.ts:134-136`
- 问题：usage items map 的对象字面量中 `used: to_number(item.used)` / `limit: to_number(item.limit)` 已计算同值；`status` 三元组又把 `to_number(item.limit)` 计算 2 次、`to_number(item.used)` 计算 1 次。纯函数重复计算，无行为分叉（输入值一致），但迁移引入的冗余表达式比原内联调用更长，可读性下降。
- 建议：把 map 回调改为块体，先取 `const used = to_number(item.used); const limit = to_number(item.limit);` 再组装对象与 status 三元组，消除重复。

### t175_code_f002 - 契约区 drift：AC1 范围收窄（待用户确认）

- 严重度：minor
- 锚点：无 AC 违反；契约区 drift 核对项
- 位置：`docs/tasks/t175_connector_ctx_status_migrate/spec.md`「范围」/「验收标准」AC1
- 问题：自 diff*anchor 契约区变更：AC1 由「删除 is_record/to_number/parse_limit/status_for*_/classify*status 全部内联 helper」收窄为「仅删除 status_for*_/classify_status 阈值 helper，保留 utility helper 本地副本」。已独立核对技术约束，收窄成立：`src/main/core/connector/runtime.ts:70-72` 编译期拒绝 import/export（沙箱脚本禁止 import 共享模块）；`src/main/core/connector/host-io.ts` 的 `ConnectorContext` 仅暴露 status/http/files/params/log/report_failed_account，未暴露 is_record/to_number/parse_limit 等价物。原 AC1 字面执行需改沙箱机制，属非范围（不改 ctx.status 机制）。SPIKE 记载的阈值一致性（pct 90/75、ratio 0.9/0.75、余额反向 0.1/0.2）、`limit<=0` 宿主统一 unknown、kimi/mimo/tavily 内联 normal 等事实均已逐条对照代码复核属实。因属 AC 范围变更且未经用户显式确认，登记待确认；技术依据可验证、注入契约区（判 AC 权威）已满足，不计 FAIL。
- 建议：向用户说明收窄理由（沙箱禁 import + ctx 无 utility 等价物）请其确认；确认后 spec 保持现状，AC1/AC2/AC3 均已满足。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：2 条（均为 minor）。
- 未进表的提示：
    - 文件过大：无。最大改动文件 `connectors/opencode_go/connector.ts`（451 行）、`connectors/cpa/connector.ts`（547 行）均 < 400 阈值且本 task 净减行（opencode_go -7、cpa -10）；其余改动 connector 均 < 400。测试文件 kimi 348 / mimo 325 < 600。
    - 圈复杂度：无。diff 未新增分支结构，仅以三元组替换内联 helper（CC ≤ 2）；connector 既有高复杂度函数（opencode*go main、cpa parse*\*）未被本 task 增加分支。
    - 范围外观察：无。
- 总体判断：
    - AC1 满足：`grep` 确认 `connectors/` 下无 `status_for_*` / `classify_status` 定义残留；14 个 connector 改动 + codex（本无 helper，`status: "unknown"` 硬编码）达到「不再定义内联阈值函数」；`ctx.status` 调用共 26 处，与 task.md 记录一致。
    - AC2 满足（逐 connector 人工对照迁移前后语义）：claude/cpa/grok/opencode*go→for_pct 与内联逐字一致；exa/deepseek/getoneapi/tikhub/mimo-balance 调用侧已有 `limit>0` / `balance_limit!==null` guard，宿主函数在 guard 成立时与内联等价；firecrawl/glm/minimax 由调用侧 `limit<=0` 分支（`total<=0 continue`、`interval_total>0`、`weekly_total>0`）保证传入 limit>0，firecrawl 内联与宿主 limit<=0 均返 unknown 无漂移；kimi/mimo/tavily 用 `limit > 0 ? ctx.status.for*\*(...) : "normal"` 保留内联 limit<=0→normal 语义。未发现阈值语义漂移。
    - AC3 满足：`pnpm test` 全量 185 files / 1962 passed / 1 skipped（与 task.md 记录一致）；`tsc --noEmit`、`eslint --max-warnings=0` 均通过。
    - 新补测（kimi/mimo limit=0→normal guard 回归）锁定 AC2 limit<=0 分支，断言为强断言（`toBe`），未弱化既有测试。
    - 无未解决 critical / important，仅 2 条 minor。PASS。
- 系统性 follow-up：无。

verdict: PASS

## Round 2 (2026-08-01 09:59 UTC+8)

### 前轮 finding 复核

- **t175_code_f001（mimo 三元组重复 to_number）→ 已消除**。以 diff 为准：`connectors/mimo/connector.ts:126-139` map 回调已改块体，`const used = to_number(item.used)` / `const limit = to_number(item.limit)` 各算一次，对象字段 `used`/`limit` 与 status 三元组 `limit > 0 ? ctx.status.for_ratio(used, limit) : "normal"` 复用同值；纯函数同输入同输出，无行为变化。Round 1 建议已落实。
- **t175_code_f002（契约区 drift 待用户确认）→ 已消除**。spec.md 契约区已更新为收窄版 AC1，与注入契约区（判 AC 权威）逐字一致：范围仅「删除 status*for*\*/classify_status 内联阈值 helper」，并补 kimi/mimo/tavily 调用侧 guard 与 utility helper 保留条款；「未知契约清单」原 `UNVERIFIED-SPIKE` 已替换为「已核实（2026-08-01 逐 connector 对照）」结论。task.md 处置表记「用户认可」。技术依据独立复核成立：`src/main/core/connector/runtime.ts:71` 沙箱编译期拒绝 import/export；`src/main/core/connector/host-io.ts` `ConnectorContext.status` 仅暴露 for_pct/for_ratio/for_balance，未暴露 is_record/to_number/parse_limit 等价物。注入契约区即权威，无遗留。
- **t175_test_f001（kimi guard 用例输入不具判别力；属测试 reviewer 项，代码侧一并核实）→ 已消除**。`tests/integration/connector/kimi-connector.test.ts:306-322` 输入已改 `used: "10", limit: "0"`：无 guard 时 `(10/0)*100 = Infinity` → `for_pct(Infinity)` = "critical"，guard 下 "normal"，测试具判别力；标题同步改为 "guarded against division by zero"。代码侧无新问题。

### 本轮新发现

0 条。`git diff 8ca0ed3bf4b8395310f379dc449b5563d9e9a54b` 全量复核（14 connector + kimi/mimo 测试 + spec/task 文档）：

- 全部 `ctx.status.for_*` 调用点（26 处）已逐条对照宿主 `src/shared/lib/connector-thresholds.ts`（for_pct 90/75、for_ratio 0.9/0.75、for_balance 反向 0.1/0.2、limit<=0→unknown）与旧内联函数体：kimi/mimo/tavily 经 `limit > 0 ? ... : "normal"` guard 保留 limit<=0→normal；glm tool 分支 `total <= 0 continue`、minimax `interval_total > 0` / `weekly_total > 0` guard 保证 limit>0 传入；mimo balance / deepseek 的 `balance_limit !== null` 蕴含 `limit > 0`；exa/getoneapi/tikhub `limit_num > 0` guard。未发现阈值语义漂移。
- 修复过程（mimo map 重构、kimi 测试输入改 used=10/limit=0）未引入新问题：`limit` 局部变量遮蔽仅限 map 回调作用域，balance 分支仍用外层 `limit`，正确。
- 验证：`npx vitest run tests/integration/connector/ tests/shared/lib/connector-thresholds.test.ts` = 20 文件 211 tests 全过（含 kimi 17 / mimo 10）；`npx tsc --noEmit` 退出码 0；`npx eslint connectors/ --max-warnings=0` 退出码 0。`connectors/` 下 grep 无 `status_for_*` / `classify_status` 残留。
- 范围检查：diff 触及文件全部落在 `connectors/`、`docs/`、`tests/`，未改动 `src/main/core/connector/host-io.ts` / `connector-thresholds.ts` / `runtime.ts`，非范围守住。

### 结论

- 前轮 finding 复核：t175_code_f001 已消除、t175_code_f002 已消除、t175_test_f001 已消除（均以 diff 与代码核实）。
- 本轮新发现：0 条。
- 未进表的提示：
    - 文件过大：`connectors/cpa/connector.ts` 547 行、`connectors/opencode_go/connector.ts` 451 行达到实现源码 400 阈值，但本 task 净减（cpa -10、opencode_go -7），按「本 task 净增才出 finding」规则不触发；其余改动文件 < 400；测试 kimi 350 / mimo 325 < 600。注：Round 1 结论段称「cpa 547 均 < 400」表述不准确（547 ≥ 400），但净减不触发，结论不变。
    - 圈复杂度：无。diff 仅以三元组替换内联 helper，未新增分支/嵌套；connector 既有高复杂度函数未被本 task 增加分支。
    - 范围外观察：无。
- 总体判断：f001/f002（及 test_f001）均已消除，全量复核未发现新 blocker；AC1（grep 无残留）、AC2（逐 connector guard 等价）、AC3（connector 子集实测全绿 + tsc + eslint）满足。PASS。
- 系统性 follow-up：无。

verdict: PASS
