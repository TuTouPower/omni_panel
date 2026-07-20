# Task spec

## 背景

T016 遗留 plugin_failure_modes（electron/）3 case 测 connector error/crash/slow behavior → failed card。强依赖 seed_fake_plugin 造 runtime behavior。real 无 enabled+status=failed+items=[] 的 connector（GLM/MIMO/MINIMAX 缺 secret 但 disabled 不渲染；KIMI 401 failed 带 stale items 渲染 stale banner）。synthetic 前 3 instance 无 failed。web 化需 synthetic 加入 real 的 enabled+failed connector。

## 范围

- `scripts/e2e/gen_synthetic.mjs`：末尾把 real 的一个 `enabled && snapshot.status==="failed"` connector（KIMI 401，带 stale items）+ state + secrets 加入 synthetic。web SPA 渲染 stale banner（`.card-state.err`，ProviderCard render_error_banner 分支）。
- 新 `tests/e2e/web/plugin_failure_modes.spec.ts`：2 case 测 `.card-state.err` 渲染 + retry action（泛化，不锁 provider）。原 3 case（error/crash/slow behavior 区分）合并为 failed 通用（mock 无法造 runtime behavior 区分）。
- 删 `tests/e2e/electron/plugin_failure_modes.spec.ts`（behavior 区分由 connector 单测覆盖，e2e 测 failed/stale card 渲染足够）。

## 非范围

- 不改 real fixture（data/responses.json 本机真实）
- 不改 T010 基建/mock_server
- 不补 pure failed card（L182 isFailed 分支，需 enabled+failed+items=[]，real 无；DOM `.card-state.err` 已覆盖 stale 分支，pure 分支留 SPA 单测）

## 验收标准

- [ ] synthetic.json 含 enabled+failed connector（KIMI 401 stale，real 取）
- [ ] web plugin_failure_modes 测 `.card-state.err` 渲染（real/synthetic 都绿）
- [ ] 删 electron/plugin_failure_modes.spec.ts
- [ ] `pnpm test:e2e:web` 全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- web SPA 对 enabled+failed（带 stale items）渲染 `.card-state.err` stale banner（ProviderCard render_error_banner）
