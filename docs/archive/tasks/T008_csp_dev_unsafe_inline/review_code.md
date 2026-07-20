# Task review T008

- task：`T008_csp_dev_unsafe_inline`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 10:25 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

无。

## 结论

实现严格落在 spec 范围内：

- `src/main/security/csp.ts:10-14` `build_csp_script_src` 二元分支与 spec 验收标准逐字对齐：`null` → `"'self'"`；`"http://localhost:5173"` → 含 `'unsafe-inline'`、`'unsafe-eval'` 与 dev origin。
- `src/main/security/csp.ts:16-23` `build_csp_connect_src` 照搬原内联逻辑（含 A15 dev ws/wss scope 到 dev host），未借机改动；符合 spec 非范围 "connect-src 仅随抽函数搬迁"。
- `src/main/security/csp.ts:25-29` `build_csp_header` 拼接顺序与原内联串一致（`default-src / script-src / style-src / img-src / connect-src`），未引入新 directive。
- `src/main/index.ts:47` import 正确；L129 调用 `build_csp_header(devOrigin, devHost)` 替换原 `cspScriptSrc` / `cspConnectSrc` 双变量，旧内联构造与 `'unsafe-eval'` 字面量已随 diff 删除，无残留死代码。
- 安全约束守住：prod 分支 (`dev_origin=null`) 只返回 `'self'`，不出现 `unsafe-inline` / `unsafe-eval`；单测 `csp.test.ts` "prod header keeps strict self script-src without unsafe-inline" 显式断言 `header.not.toMatch(/unsafe-inline.*localhost/)`，防回退有效。
- 注释真实：csp.ts 顶部块注释与 index.ts L123-125 行内注释对 "React Refresh preamble 被 CSP 拦截 → can't detect preamble" 的因果描述与 log.md 根因定位一致，无夸大。
- 命名 `csp_header` 为 snake_case，符合 CLAUDE.md 全局约定；周边 `devOrigin` / `devHost` 为 pre-existing camelCase，非本 task 改动，不动符合 "精准修改" 约束。
- spec 与 log 无遗漏关键约束：dev/prod 区分、不引入 nonce/hash、不动其他 directive 均有记录；log 记载的 `can't detect preamble` 错 0 → 验证通过的事实与代码效果一致。

总体判断：实现、测试、文档三者自洽，可直接进入 adoption。
