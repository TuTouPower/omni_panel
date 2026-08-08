# Task review t266（reviewer_focus: 通用）

- task：`t266_web_e2e_synthetic_session_fixture`
- spec：`docs/tasks/t266_web_e2e_synthetic_session_fixture/spec.md`
- diff_anchor：`54e65a67272ada41fe9e532953f66e6314c67671`
- target：`git diff 54e65a67272ada41fe9e532953f66e6314c67671`
- round：1
- reviewed_at：2026-08-08 18:25 UTC+8

## Findings

### t266_gen_f001 - mock_server.mjs 新增代码未过 prettier（format:check 回归）

- 严重度：minor
- 锚点：行为缺陷 + 可复现失败——`pnpm format:check` 在 `tests/e2e/fixtures/mock_server.mjs` 报错；`pnpm check`（docs/blueprint/testing.md「综合门禁速查」）含 format:check。
- 位置：`tests/e2e/fixtures/mock_server.mjs:75-80,95-101`
- 问题：新增 `/v1/sessions` 排序三元表达式与数组兜底字面量不满足项目 prettier（tabWidth 4），`npx prettier --check` 报错；锚点版本该文件通过 prettier，本次 diff 引入回归。`prettier --write` 后 diff 显示重排 av/bv 三元与数组换行。纯格式，无功能影响。
- 建议：`prettier --write tests/e2e/fixtures/mock_server.mjs`。

### t266_gen_f002 - synthetic.json 重序列化为 2-space，脱离仓库 prettier 规范

- 严重度：minor
- 锚点：行为缺陷 + 可复现失败——`pnpm format:check` 在 `tests/e2e/fixtures/synthetic.json` 报错（锚点版本通过）。
- 位置：`tests/e2e/fixtures/synthetic.json`（全文件）
- 问题：语义上仅新增 `GET /v1/sessionStats`（逐 key 比对：其余 64 个 key 与锚点版本完全等价），但整个文件被以 2-space（`JSON.stringify(x, null, 2)` 输出）重写，未走仓库既有的 prettier 格式化步骤（旧提交版本 4-space 且通过 format:check；lint-staged 对 `*.json` 配 prettier --write）。内容可复现（`build_session_responses()` 输出的 11 个 session key 与入库 synthetic.json 逐字一致，AC-2 内容层面成立），但提交形态不符合仓库格式规范。
- 建议：`prettier --write tests/e2e/fixtures/synthetic.json`（或生成后补 prettier 步骤再提交）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - mock `/v1/sessions` 过滤仅实现 search/sources/order_by/direction/limit/offset，未覆盖真实 `query_sessions` 的 `start_at`/`end_at`/`source`（单数）/`env` 参数。会话库 UI 可发送日期范围参数，但无现行用例使用；属 spec 明确列出的 4 参数范围内的有意取舍，不作为 finding，留作后续如需补日期过滤 e2e 时扩展 mock。
    - mock 排序在缺 `direction` 时跳过排序（生产默认 DESC），渲染层恒发 order_by+direction，当前无差异。
    - AC-2 完整性受环境约束：`gen_synthetic.mjs` 依赖 `tests/e2e/fixtures/data/responses.json`（本机缺失），无法在本机完整重跑；本 task 改动的 session fixture 部分已核实可复现，非 session 部分依赖录制产物，未纳入本 task 变更。
    - `pnpm format:check` 全量尚另有 10 个文件失败（docs/archive/\*、SessionCard.tsx、SessionRow.tsx、VirtualMessageList.tsx、grok/opencode-extractor.test.ts），均不在本 diff，为存量红态；本 task 新增 2 个（f001/f002）。
- 总体判断：3 条 AC 均满足（AC-1 实跑 `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 61 passed 含原 4 失败全过、无回归；AC-2 session fixture 部分可复现；AC-3 其他 web e2e 保持通过），无未解决 critical / important，仅有 2 条 minor（格式回归，修复机械）。mock_server 单测 9 条通过。
- 系统性 follow-up：无

verdict: PASS
