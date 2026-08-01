# Task review t175（reviewer_focus: 测试）

- task：`t175_connector_ctx_status_migrate`
- spec：`docs/tasks/t175_connector_ctx_status_migrate/spec.md`
- diff_anchor：`8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- target：`git diff 8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- round：1
- reviewed_at：2026-08-01 09:45 UTC+8

## Findings

### t175_test_f001 - kimi guard 回归测试的输入不区分 guard，无法锁定 AC2 limit<=0 语义

- 严重度：minor
- 锚点：AC2（迁移后对相同输入判定结果一致，含 limit<=0 分支）
- 位置：`tests/integration/connector/kimi-connector.test.ts:306-322`（新增用例 "status stays normal when limit is 0 (guarded against ctx.status unknown)"）
- 问题：该用例 mock 输入为 `usage: { limit: "0", used: "0", ... }`。此时 `limit > 0` 为 false，guard 分支直接返回 "normal"；但若 guard 被移除、直接调 `ctx.status.for_pct((used / limit) * 100)`，则 `(0/0)*100 = NaN`，`for_pct(NaN)` 中 `NaN >= 90` 与 `NaN >= 75` 均为 false，同样返回 "normal"。已用 node 验证：带 guard 与不带 guard 对 used=0/limit=0 均输出 "normal"。因此该测试在 guard 存在与不存在时都 PASS，无法区分迁移后的 guard 与未加 guard 的实现；真实回归场景（used>0、limit=0，如 used="10"）无 guard 时 `(10/0)*100 = Infinity` → `for_pct(Infinity)` = "critical"，测试当前输入抓不到。标题声称 "guarded against ctx.status unknown" 亦与事实不符——`for_pct` 无 limit<=0 检查、永不返回 "unknown"（guard 真正防护的是除零产生 Infinity→critical）。测试虽跑真实 connector 脚本、断言真行为（limit=0→normal），但作为 task.md 声明的「锁定 AC2 limit<=0 分支」回归锁，实际不提供该防护。
- 建议：输入改为 used>0、limit=0（如 `usage: { limit: "0", used: "10", remaining: "0", resetTime: "2099-01-01T00:00:00Z" }`），使 guard 成为 "normal" 的唯一原因；无 guard 时该输入会得到 "critical"，测试即具备判别力。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（本轮）
- 改测方向复核：无。diff 只新增 2 个测试用例（kimi、mimo 各 1），未修改任何既有测试断言，无「迁就实现」改测。
- 本轮新发现：1 条（t175_test_f001，minor）
- 未进表的提示：
    - 测试可信度：新用例经 `run_connector` 在 VM 沙箱跑真实 connector 脚本，`ctx.status` mock 直接包装宿主 `src/shared/lib/connector-thresholds.ts` 真实实现（`_ctx_status.ts`），HTTP 在系统边界 mock——测试触达生产逻辑，非 import 内部函数凑数。mimo 新用例（used=10、limit 缺失 → 无 guard 时 `for_ratio(10, 0)` = "unknown"）具备判别力，非空断言（`.find()` 未命中会失败），已验证。
    - AC 覆盖：AC1 结构部分（connectors/ 下无 `status_for_*/classify_status` 定义）经 grep 确认满足（15 目标 connector 中 14 个已删 helper、26 处改调 `ctx.status`；codex 本无 helper、硬编码 "unknown"；antigravity 不在范围）。该结构不变量无自动化回归测试，仅靠临时黑盒 `.scratch/t175/blackbox.sh` + 代码审查保证，属可选补强，不阻断（行为经既有 connector 测试 + 真实阈值实现覆盖）。AC2 语义一致性已逐 connector 对照代码核实（kimi/mimo/tavily 经 guard 保留 limit<=0→normal；glm/minimax 调用侧 `total<=0 continue` / `interval_total>0` / `weekly_total>0` guard 保证 limit>0；mimo balance 的 `balance_limit !== null` 蕴含 `limit > 0`，无漂移；exa/getoneapi/tikhub/deepseek/firecrawl 调用侧 guard 或宿主函数语义与旧内联一致）。AC3：connector 测试实测 `vitest run tests/integration/connector tests/unit/connector` = 25 文件 243 passed / 1 skipped，含新增 kimi（17 tests）、mimo（10 tests）；全量 `pnpm test` 1962 passed 为 task.md 自述，未独立复跑全仓。
    - opencode_go connector 级测试不断言 status 值（仅 used/limit/reset_at），其 status 路径由 connector-thresholds.test.ts + 机械替换保证；可选扩展。
    - 契约区 drift（AC1 由「删 is*record/to_number/parse_limit/status_for*\*」精化为「保留 utility、仅删阈值 helper」）：与实现核对一致（is_record/to_number/parse_limit 仍保留本地副本），与上下文区 SPIKE 已核实结论相符，属合理范围精化，未发现未经确认的 AC 变更。
- 总体判断：测试可信度高、AC1/AC2/AC3 均有覆盖，仅 1 条 minor（kimi 用例输入不区分 guard），不阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 10:00 UTC+8)

- task：`t175_connector_ctx_status_migrate`
- spec：`docs/tasks/t175_connector_ctx_status_migrate/spec.md`
- diff_anchor：`8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- target：`git diff 8ca0ed3bf4b8395310f379dc449b5563d9e9a54b`
- round：2
- reviewed_at：2026-08-01 10:00 UTC+8

### Findings

本轮无新 finding。

### 结论

- 前轮 finding 复核（以 diff 与代码为准，不采信处置表）：
    - t175_test_f001（kimi guard 回归测试输入不区分 guard，minor）：**已修**。当前用例 `tests/integration/connector/kimi-connector.test.ts:306-324` 输入为 `usage: { limit: "0", used: "10", remaining: "0", resetTime: "2099-01-01T00:00:00Z" }`，标题改为 "guarded against division by zero"。判别力验证（对照 `connectors/kimi/connector.ts:110` 生产路径）：guard 存在时 `limit > 0`（0 > 0）为 false → "normal"；guard 移除后 `ctx.status.for_pct((10/0)*100)` = `for_pct(Infinity)`，而 `connector-thresholds.ts` 的 `status_for_pct` 中 `Infinity >= 90` 为 true → "critical"，断言 `expect(obs.status).toBe("normal")` 即失败。与 f001 建议的修复输入逐字一致，非「换形式弱化」（由弱变强）。实测通过（kimi 17 tests 全绿）。
- 改测方向复核：无。相对 Round 1，测试 diff 仅改动 f001 指向的 kimi 用例输入与标题（强化判别力），未修改任何既有断言、未删除/反转/注释 expect；新增 mimo 用例（`mimo-connector.test.ts:152-166`，limit 缺失 → normal）具备判别力（无 guard 时 `for_ratio(10, 0)` = "unknown"），非「迁就实现」。
- 本轮新发现：0 条
- 未进表的提示：
    - AC2 limit<=0 分支覆盖复核（防语义漂移）：kimi（新用例）、mimo usage（新用例）、mimo balance（既有 0.1/0.2 边界用例 `mimo-connector.test.ts:168-191`，`balance_limit !== null` 蕴含 `limit > 0`，guard 语义未变）、tavily（既有用例 `tavily-connector.test.ts:106-115` 覆盖 `plan_limit<=0` throw，guard else 分支实际不可达）、glm/minimax（`total<=0 continue` / `interval_total>0` / `weekly_total>0` 前置 guard 保证 limit>0，status 不会进入 for_ratio 的 unknown 分支）、exa/deepseek/getoneapi/tikhub（调用侧 guard 输出 "unknown" 迁移前后一致）。无新缺口。
    - AC1/AC3 复核：`connectors/` 下 grep 无 `status_for_*/classify_status` 定义残留；connector 测试套件实测 25 文件 / 243 passed / 1 skipped，无因迁移引入的新失败。
    - 契约区 drift（AC1 收窄为仅删阈值 helper、utility 保留）：Round 1 已核为合理范围精化，处置表 t175_code_f002 注明用户认可；本轮无新增 drift。
- 总体判断：f001 已按建议修复为具备判别力的回归输入，本轮无新增 blocker 亦无新增 minor。
- 系统性 follow-up：无

verdict: PASS
