# Task review t363（reviewer_focus: 通用）

- task：`t363_connector_struct_poll`
- spec：`docs/tasks/t363_connector_struct_poll/spec.md`
- diff_anchor：`0afb0ae34dd4206b183125d6df250942bd70d620`
- target：`git diff 0afb0ae34dd4206b183125d6df250942bd70d620`
- round：1
- reviewed_at：2026-08-14 04:00 UTC+8

## Findings

### t363_gen_f001 - glm 5h 窗口修复不完整：非 tool（text）分支仍输出 window:"second"

- 严重度：important
- 锚点：范围项 2「glm 5h 观察 window 改 'day'（或明确该字段仅展示并注释）」未全量实现
- 位置：`connectors/glm/connector.ts:148`（对比 `:120`）
- 问题：tool 分支（:120）已改 `window: pk === "month" ? "month" : "day"`，但非 tool 分支（:148）仍为 `window: pk === "5h" ? "second" : pk === "month" ? "month" : "day"`。`period_key` 对 `unit===3 && number===5` 返回 `"5h"`（:33）；`kind_for` 对无 `currentValue`/`usage` 且名称不含 tool 关键词的 limit 返回 `"text"`（:45-54），两者可命中同一 limit。此时 text 类 5h 观测产出 `window:"second"` 但 `cycleDurationMs=5*3_600_000`（else 分支 cycle 值），正是任务要修的窗口错位，在 text 路径仍残留且无「仅展示」注释。同 provider 内 tool 5h 显示 day、text 5h 显示 second，语义不一致。
- 建议：else 分支 window 同步改为 `pk === "month" ? "month" : "day"`（5h/week 均无对应 ObservationWindow，统一 day 近似展示）。

### t363_gen_f002 - firecrawl 单接口失败（一成功一失败）无测试覆盖

- 严重度：minor
- 锚点：AC-002「单接口失败不拖垮另一接口，成功侧照常产出」中「成功侧照常产出」未测试锁定；spec 测试策略明确列「单接口 5xx」
- 位置：`tests/integration/connector/firecrawl_connector.test.ts:197`、`:259`
- 问题：改动只覆盖双接口全失败（`null/null`、`success:false` 双失败），断言 error null + failed_accounts>0。无「credits 成功 + tokens 失败」用例验证成功侧仍产出 credits 观测。实现本身正确（allSettled + 成功侧分支），但 AC-002 关键语义缺测试锚定，回归无防护。
- 建议：补表驱动用例：一接口返回有效 payload、另一接口 reject（或非对象），断言成功侧观测仍在、失败侧进 failed_accounts。

### t363_gen_f003 - claude data_dir 自定义路径无测试，AC-004 新行为未被任何用例锁定

- 严重度：minor
- 锚点：AC-004「设置 data_dir 生效」；spec 测试策略列「data_dir 自定义路径」
- 位置：`connectors/claude/connector.ts:49`；`tests/integration/connector/claude-connector.test.ts:46`
- 问题：claude-connector.test.ts 的 `files.read` 断言固定 `~/.claude/.credentials.json`，其 `params: {}` 走默认分支。该断言改动前后均通过，无法区分新旧行为——读取 `ctx.params["data_dir"]` 的新路径无任何用例覆盖，「设置 data_dir 生效」契约未验证（handoff ac_evidence AC-004 也无测试证据）。
- 建议：补用例：ctx.params 设 `data_dir` 为自定义路径，断言 `files.read` 收到 `${data_dir}/.credentials.json`。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条
- 未进表的提示：kimi 周用量 `window:"week"` 未被正例测试断言（spec 测试策略未承诺该字段，仅作提示）；opencode_go 新集成测试 mock 走真实 fallback 链（/auth 302→/go 无内联→assets 拉取→/_server），单 bundle 失败经 catch 容忍，mock 真实度可接受；5 个 manifest 删 poll 段前均为 script+dead poll 并存，refresh-service 优先走 script 分支（`refresh-service.ts:181`），删除行为保持，schema `!!manifest.poll || !!manifest.script` 亦保留纯 poll 连接器校验，无纯 poll 连接器受影响。
- 总体判断：AC-001~005 与 6/7 范围项实现正确；tsc / eslint / 全量 vitest（3094 passed，9 skipped）均绿，与 handoff 一致。但范围项 2（glm 5h window）只修了 tool 分支，text 分支仍是任务要修的 window:"second" 错位，契约范围未全量完成，判定 FAIL。
- 系统性 follow-up：无

verdict: FAIL

---

# Task review t363（reviewer_focus: 通用）— Round 2

- task：`t363_connector_struct_poll`
- spec：`docs/tasks/t363_connector_struct_poll/spec.md`
- diff_anchor：`0afb0ae34dd4206b183125d6df250942bd70d620`
- target：`git diff 0afb0ae34dd4206b183125d6df250942bd70d620`
- round：2
- reviewed_at：2026-08-14 04:04 UTC+8

## 前轮 finding 复核

### t363_gen_f001 - glm 5h 窗口修复不完整（text 分支 window:"second"）

- 判定：已修复
- 证据：`connectors/glm/connector.ts:149` text 分支改 `window: pk === "5h" ? "day" : pk === "month" ? "month" : "day"`；与 tool 分支（:120 `pk === "month" ? "month" : "day"`）输出映射逐格一致——5h→day、week→day、month→month，两分支语义不再分叉。注释保留（:148）。
- 测试：`tests/integration/connector/glm-connector.test.ts:97` text_5h 断言 `window: "day"`（diff 仅此一行）；text-month→"month" 用例（:189-215）已锁定 text 分支 month 映射。`t363` 范围项 2 全量完成。

### t363_gen_f002 - firecrawl 单接口失败（一成功一失败）无测试覆盖

- 判定：已修复
- 证据：`tests/integration/connector/firecrawl_connector.test.ts:272-288` 新增「keeps the successful side when only one API fails (t363 AC-002)」：credit-usage resolve CREDIT_PAYLOAD、token-usage reject "tokens down"。断言 `observations` raw_label 恰为 `["credits"]`（若成功侧被丢弃则空数组→失败），且 `failed_accounts` 含 "tokens down"（若失败侧未登记→失败）。成功侧照常产出 + 失败侧登记两条路径都被锁定，AC-002「成功侧照常产出」有回归防护。

### t363_gen_f003 - claude data_dir 自定义路径无测试

- 判定：方向正确，但引入新编译错误（见 f004）
- 证据：`tests/integration/connector/claude-connector.test.ts:160-175` 新增「reads credentials from a custom data_dir param (t363 AC-004)」：`files.read` 断言收到 `/custom/claude/.credentials.json`、`params.data_dir="/custom/claude/"`。若 connector 忽略 data_dir 仍读 `~/.claude`，expect 即失败，能区分新旧行为；尾部斜杠顺带覆盖 `.replace(/\/+$/, "")` 剥离逻辑。默认路径用例（:46，`params:{}`）仍锁定 `~/.claude/.credentials.json`，AC-004 双路径均有用例。
- 问题：`:170` `ctx.params = { data_dir: "/custom/claude/" }` 对 `readonly` 属性赋值，tsc 报 TS2540（见下），需修复。

## 本轮新发现

### t363_gen_f004 - claude data_dir 新增用例破坏 tsc：对 readonly params 赋值

- 严重度：minor
- 锚点：修复 f003 引入的编译错误；`tsc --noEmit` 全仓从绿转红（exit 2，唯一错误）
- 位置：`tests/integration/connector/claude-connector.test.ts:170`；`src/main/core/connector/host-io.ts:45`
- 问题：`ctx.params = { data_dir: "/custom/claude/" }` 对 `ConnectorContext.params`（`host-io.ts:45` 声明 `readonly params: Record<string, string>`）赋值 → `TS2540: Cannot assign to 'params' because it is a read-only property`。vitest 经 esbuild 转译不做类型检查，运行绿（237 集成 + 单元全过），但 `tsc --noEmit` 失败，破坏 round 1 断言过的 tsc 绿门，integrate 前必须修。
- 建议：不在外部赋值 readonly 字段——给 `create_ctx` 加可选 `data_dir` 参数于构建时写入 params（如 `create_ctx(undefined, undefined, { data_dir: "/custom/claude/" })`），或构造新 ctx 对象覆盖 files.read + params 再传 run_connector。

## 结论

- 前轮 finding 复核：f001 已修复（text 分支 window 与 tool 分支一致，测试锚定 day/month）；f002 已修复（单失败用例真区分「成功侧产出」与「失败侧登记」）；f003 修复方向正确但引入 f004 编译错误。
- 本轮新发现：1 条（f004，minor）
- 未进表的提示：无
- 总体判断：范围项 2（glm 5h window）全量完成，AC-002/AC-004 关键语义补测锁定；运行态 237 个 connector 集成测试 + 相关单元测试全绿，与 handoff 一致。重要项 f001 已消除，仅余 f004 一条测试内类型错误（minor，tsc 门被打破），按判定式可 PASS，但 f004 须在 integrate 前修掉以恢复 tsc 绿。
- 系统性 follow-up：无

verdict: PASS
