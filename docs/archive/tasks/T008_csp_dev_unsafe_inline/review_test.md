# Task review T008

- task：`T008_csp_dev_unsafe_inline`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 22:50 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` -> `review_code.md` / 前缀 `code`；`测试` -> `review_test.md` / 前缀 `test`。

## Findings

### T008_test_f001 - build_csp_connect_src 缺 dev_host=null 占位 '\*' 的分支用例

- 严重度：medium
- 位置：`tests/unit/main/security/csp.test.ts:22-26`（仅覆盖 dev_host="localhost:5173"）
- 问题：实现 `build_csp_connect_src` 含 `dev_host ?? "*"` 的 fallback（`csp.ts:21`），当 dev_origin 非空但 dev_host 为 null 时，ws/wss 应回退为 `ws://* wss://*`。当前两个用例只测了 dev_host 有值与 prod 两路，未覆盖 dev_host=null 这条分支。若有人删除 `?? "*"` 或把占位改成空串，现有测试不会红，防回退不充分。
- 建议：补一条用例，断言 `build_csp_connect_src("http://localhost:5173", null)` === `"'self' http://localhost:5173 ws://* wss://*"`。`build_csp_header` 同步补一条 dev_host=null 的用例，覆盖 header 中 `connect-src ... ws://* wss://*` 片段。

### T008_test_f002 - build_csp_header 组装顺序未严格断言

- 严重度：suggestion
- 位置：`tests/unit/main/security/csp.test.ts:34-44`
- 问题：dev header 用例用多个 `toContain` 分别校验各指令片段存在，未严格断言指令间顺序（`default-src` -> `script-src` -> `style-src` -> `img-src` -> `connect-src`）。若有人重排指令顺序，测试不会红。CSP 语义对指令顺序不敏感，实际安全风险低，仅为测试严谨度建议。
- 建议：可选追加一条 `expect(header).toBe(...)` 全字符串断言锁定整体顺序，或保持现状（低优先级）。

### T008_test_f003 - 验收标准"dev preamble 错 0"单测无法覆盖，需 task_report 注明归属

- 严重度：suggestion
- 位置：`spec.md:22`（验收标准第一条）
- 问题：spec 第一条验收标准"dev 模式 `pnpm start` 后 renderer 正常渲染、stdout 无 `can't detect preamble`"属运行时黑盒行为，单测层面无法覆盖。当前测试只验证 CSP 字符串构造正确，未验证 preamble 实际注入成功。此条本身可接受（单测不该承担运行时验证职责），但需在 `task_report.md` 中明确标注该验收项由 `{blackbox_cmd}`（`pnpm start` 真实启动）覆盖，避免验收遗漏。
- 建议：在 task_report 验收清单中为第一条标注"由黑盒验证（`pnpm start`）确认"，其余三条标注单测覆盖位置。

## 结论

测试整体方向正确，dev/prod 两路核心断言到位，防回退主路径有效，断言的是修复后期望行为而非旧 bug 行为。主要缺口是 `build_csp_connect_src` 的 `dev_host=null` 占位 '\*' 分支未覆盖（f001），建议补测后再收尾；f002、f003 为可选改进。spec 验收标准 2/3/4 已被单测覆盖，验收标准 1 需由黑盒验证承接并在 task_report 注明。
