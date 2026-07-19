# Task review T001

- task：`T001_preload_route_sync`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 03:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T001_test_f001 — preload/index.ts route switch 无直接行为测试，核心修复点缺回归网

- 严重度：medium
- 位置：`src/preload/index.ts:339-420`（`switch (current_route)` 的 `case "setting"` / `case "tray"` / `default`）；无对应测试文件
- 问题：本 task 的核心修复目的就是让设置窗走 `case "setting"` 拿到 `config_full`（含可用的 `saveSecrets`）与 `grok: route_grok_api`（settings_api）。但全仓测试没有任何文件直接 import 或运行这段 switch：
    - `tests/unit/preload/log-throttle.test.ts:22` 只 `readFileSync` 源码做命名约定检查
    - `tests/unit/renderer/first_paint_theme.test.ts:36` 只做源码文本断言（主题相关）
    - `tests/unit/preload/route_api.test.ts` 仅覆盖 `select_grok_api`（被 switch 调用的辅助函数），不覆盖 switch 本身
    - 全仓 grep `current_route` / `case "setting"` 无任何 test 命中

    这意味着如果将来有人把 `case "setting":` 改回 `"settings"`、或把该分支的 `config: config_full` 换成 `config_readonly`、或把 `grok: route_grok_api` 误删，`pnpm test` 不会失败。spec 验收清单第 2、3 条（"route 相关无 `popup`/`settings` 残留"、"判定为 `route === "setting"`"）目前只能靠人工评审，没有自动回归网。

- 建议：这是 pre-existing 缺口（非 T001 引入），但 T001 的修复语义正好落在这条无网覆盖的分支上，建议顺手补一条静态源码断言（与 `first_paint_theme.test.ts` 风格一致），最小集：
    - `expect(source).toContain('case "setting":')`
    - `expect(source).toContain('case "tray":')`
    - 在 `case "setting":` 分支体范围内断言含 `config: config_full` 与 `grok: route_grok_api`
    - `expect(source).toContain('|| "usage"')`（fallback）

    放入 `tests/unit/preload/`（新文件 `route_switch.test.ts` 或并入 `log-throttle.test.ts` 的源码静态检查段）。这样 spec 三条验收都有自动化对应。

- 备注：若评估"源码文本断言太脆"属于另一流派观点，则至少应在 spec 的"非范围"显式登记此缺口并指向后续 task；当前 spec 既未登记缺口又未补测试，处于"无网且未记录"状态。

### T001_test_f002 — route_api.test.ts 测试描述用旧 route 值 "settings"

- 严重度：low
- 位置：`tests/unit/preload/route_api.test.ts:25` — `it("exposes the full Grok API to settings", ...)`
- 问题：断言传入的是新 route 值 `select_grok_api("setting", ...)`（L28，正确），但 `it` 描述里写的是 "to settings"（带 s，旧值）。描述与参量不一致，容易让读者误以为测试还在锁旧 route 值。功能不断言失败，仅文档层面误导。
- 建议：把描述改为 `"exposes the full Grok API to the setting route"` 或 `"to setting"`，与参量保持一致。属本次 route 值同步漏改的文案尾巴。

### T001_test_f003 — it.each 覆盖列表缺 "agent" route

- 严重度：suggestion
- 位置：`tests/unit/preload/route_api.test.ts:39` — `it.each(["usage", "tray", "unknown"])`
- 问题：`src/renderer/hooks/use-route.ts:6` 的 `VALID_ROUTES = ["usage", "setting", "agent", "tray"]`，测试覆盖了 usage/tray/unknown 但未覆盖 "agent"。由于 `select_grok_api` 只对 "setting" 特判，其他全部走 readonly，"agent" 与列表中任意项语义等价，不构成 bug。
- 建议：加入 `"agent"` 显式锁定 agent 窗拿 readonly Grok API，与 `it.each(["usage", "tray", "agent", "unknown"])` 形式一致，提升测试的文档价值并防止未来 agent 窗被特判时无测试告警。纯建议，非阻塞。

## 结论

approve（可合并）。T001 的测试侧改动方向正确：

- `pnpm test` 全量 131 文件 / 1331 用例全绿，含 `route_api.test.ts` 4 条
- `route_api.test.ts` 的断言断的是"期望行为"（setting → 5 keys，其他 → 1 key），不是锁旧 bug
- spec 三条验收（test 全绿 + grep 无 route 相关残留 + route 值为 `setting`）人工核验通过：`src/preload/index.ts` 残留的 `"popup"` 仅属 `MainPanelMode` 类型（L205），与 route 无关；`"settings"` 在 preload/route_api.ts 与 preload/index.ts 的 route 相关位置已清零

唯一保留意见：preload/index.ts 的 route switch 作为本 task 的核心修复点仍无任何直接测试（pre-existing 缺口），spec 验收第 2、3 条无自动回归网。建议 T001 顺手补 f001 的静态源码断言（最小投入），或在 spec "非范围" 显式登记此缺口交给后续 task；否则将来 route 重构回滚时单测不会报警。f002、f003 为文档/覆盖广度建议，不阻塞合并。
