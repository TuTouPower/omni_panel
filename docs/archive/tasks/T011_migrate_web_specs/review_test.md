# Task review T011

- task：`T011_migrate_web_specs`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 02:41 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T011_test_f001 — 验收标准"vitest 不受影响"未在 log 显式验证

- 严重度：low
- 位置：`docs/tasks/T011_migrate_web_specs/log.md` "验证"小节；spec.md 验收标准第 4 条
- 问题：spec 验收标准第 4 条要求 `pnpm test`（vitest）不受影响。log "验证"小节只记 `pnpm test:e2e:web` 21 passed 与 `pnpm typecheck` 通过，未记录 `pnpm test`（vitest run）实际执行结果。本 task 改动含 `tests/e2e/pages/settings_page.ts` 新增静态方法、5 个 spec 文件位置变化，理论上不影响 vitest 单元/集成层，但缺乏显式运行证据。
- 建议：owner 在 task_report 或 log 补一行 `pnpm test` 实际运行结果（通过/被跳过的测试数），闭合验收标准第 4 条。若已运行且全绿，仅需补记。

### T011_test_f002 — popup_view 泛化丢失"CPA 不显示"负向断言

- 严重度：low
- 位置：`tests/e2e/web/popup_view.spec.ts:46-60`（"main content area is rendered with overview tab"）
- 问题：原 `specs/popup_view.spec.ts` 在同一 case 内有两条断言：
    - `getByRole("button", { name: /^Claude$/ })` / `/^DeepSeek$/` 可见（正向，硬编码 provider 名——按 spec 第 36 条应泛化，删除合理）
    - `getByRole("button", { name: /^CPA$/ }).toHaveCount(0)`（负向，验证 CPA provider 应被过滤隐藏的业务规则）
      web 版把整组 provider tab 断言替换为 `providerTabs.count() > 0`（排除"总览"），同时丢掉了"CPA 不显示"这一过滤规则验证。负向断言不是 spec 第 36 条所针对的"硬编码账号邮箱/具体 provider"，而是业务规则覆盖；mock 回放数据不含 CPA 时，该断言原本能验证过滤逻辑生效。泛化后此规则在 web 下无任何 case 覆盖。
- 建议：web 版补一条泛化负向断言，例如遍历 provider tabs 文本，断言不含 "CPA"（或断言 fixture 中被标记隐藏的 provider 不渲染）；mock 数据保真度足够支撑此断言。

### T011_test_f003 — settings_view 文件级回退丢失 4 个 web 可跑 case 的 web 覆盖

- 严重度：suggestion
- 位置：`tests/e2e/specs/settings_view.spec.ts`（整文件回退）；`docs/tasks/T011_migrate_web_specs/log.md` "回退"小节
- 问题：settings_view 6 case 中 2 case 失败（`.acct-row` 缺失 / "用量标签映射"字段缺失），按 spec 规则整文件回退 specs/ 走 Electron 通道。但其余 4 case（sidebar 渲染、plugin nav 渲染、用量条颜色方案、用量条样式）在 web SPA 下同样可跑且不依赖 Electron 专属 DOM，目前这些 case 仅在 Electron 下覆盖。spec 第 13 行"每个 spec 改"是文件级粒度，回退也按文件级——符合规则；但长期看 web 侧对 settings 主干的覆盖存在缺口。
- 建议：不在 T011 内处理（会扩大范围）。建议在 T012（electron project 整理）或拆独立后续 task 评估：把可平移的 4 case 拆出独立 web spec（例如 `web/settings_view_core.spec.ts`），2 个 Electron 专属 case 留 electron/。owner 决策即可，T011 当前回退策略符合 spec 不算缺陷。

## 结论

3 个 finding（1 low / 1 low / 1 suggestion），无 critical/high。spec 4 条验收标准的核心验证（5 spec 迁 web/、test:e2e:web 21 passed、settings_view 回退 specs/）已落实；case 计数与 log 记录一致（5+3+2+5+4+2=21）。唯一硬缺口是 vitest 运行结果未在 log 显式记录（f001），建议 adoption 阶段补记或现场运行一次 `pnpm test` 闭合第 4 条验收。f002 是测试覆盖减弱（业务规则丢失），f003 是后续迁移策略建议，均可由 owner 决策是否当场修或作遗留。
