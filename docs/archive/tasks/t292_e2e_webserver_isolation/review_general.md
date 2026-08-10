# Task review t292（reviewer_focus: 通用）

- task：`t292_e2e_webserver_isolation`
- spec：`docs/tasks/t292_e2e_webserver_isolation/spec.md`
- diff_anchor：`fe46d0b7aff70b5cba35a735cadb76242b6d8261`
- target：`git diff fe46d0b7aff70b5cba35a735cadb76242b6d8261`
- round：1
- reviewed_at：2026-08-11 00:39 UTC+8

## Findings

### t292_gen_f001 - `pnpm lint` 门禁失败：动态 delete 触发 `no-dynamic-delete`

- 严重度：important
- 锚点：无直接 AC，按 blocking 硬阈值「可观测行为缺陷」——`pnpm lint`（`pnpm check` 组成部分，ci.yml:25 / nightly.yml:24 均跑 `pnpm check`）对改动后文件报错 exit 1；husky pre-commit 的 lint-staged 对 `*.{ts,tsx}` 跑 `eslint --fix`，提交 playwright.config.ts 会被拦截。
- 位置：`playwright.config.ts:15`（`delete process.env[key]`，key 为循环变量）
- 问题：本 diff 在 config 顶层新增 for 循环删除代理 env，`@typescript-eslint/no-dynamic-delete` 对计算属性 delete 报 error（`pnpm exec eslint playwright.config.ts` exit 1；anchor 版本同文件 lint 干净，错误为本 diff 新引入）。task 验证参考声称「eslint 干净」，与实测不符。
- 建议：循环展开为 6 条静态 `delete process.env.http_proxy;` 等（静态属性不触发该规则），语义不变；或在该语句加 eslint-disable 注释并注明理由。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无
- 本轮新发现：1 条
- 未进表的提示：
    - 跨平台 env 前缀：`test:e2e:cli` 的 `E2E_NO_WEBSERVER=1` 是 POSIX 语法，Windows shell 下不可用；但 `tests/e2e/cli/cli_flow.spec.ts:10` 已硬编码 `node_modules/electron/dist/electron`（无 win32 .exe 分支，对比 `tests/e2e/packaged/smoke.spec.ts:28` 有 win32 路径），cli e2e 本就 Linux/macOS-only，env 前缀不新增平台限制——可接受。若未来支持 Windows cli e2e，需 cross-env。
    - 全量 `pnpm lint` 另报 `scripts/repo_template/**/*.js` 的 parsing error（tsconfig include 之外），anchor 已存在、与本次 diff 无关，未计。
    - spec 验证结论措辞「webServer: undefined」与实现的条件展开（`...(E2E_NO_WEBSERVER === "1" ? {} : { webServer })`）语义一致：`exactOptionalPropertyTypes` 下不能赋 `undefined`，config 注释已说明——不算不一致。
    - 实测需 `MOCK_FIXTURE=synthetic` 前置：漏设时 settings/hash 路由用例失败，设后全部通过（与 spec 测试策略「运行前置」一致，非本 diff 回归）。
- 总体判断：AC-001~005 全部实测通过（cli 4 passed + 5174 无监听；带全 6 种代理变量 web 10 passed；无代理 10 passed；git status 仅 4 个预期文件，未动任何凭据/密钥文件），但改动文件新引入 eslint error，`pnpm check` / pre-commit 门禁变红——1 条未解决 important。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-11 00:42 UTC+8)

前轮 finding 复核（以 diff 与代码为准，不采信处置表）：

- **t292_gen_f001**（important，动态 delete 触发 no-dynamic-delete）：已消除。`playwright.config.ts:7-12` 现为 6 条静态 `delete process.env["http_proxy"]` / `["https_proxy"]` / `["HTTP_PROXY"]` / `["HTTPS_PROXY"]` / `["all_proxy"]` / `["ALL_PROXY"]`，原 for 循环（anchor 版本 `playwright.config.ts:15`）已移除，语义不变——仍覆盖 spec 上下文区要求的全部 6 个大小写变体。实测 `pnpm exec eslint playwright.config.ts` exit 0（0 error）；`pnpm typecheck` exit 0。静态属性 delete 不触发 `no-dynamic-delete`，且对不存在的 env 无副作用，未引入新问题。

本轮新发现：0 条

未进表的提示：无

总体判断：Round 1 唯一 blocker 已按建议修复并经实测验证（eslint/typecheck 均干净），无新引入问题，无未解决 critical / important。

系统性 follow-up：无

verdict: PASS
