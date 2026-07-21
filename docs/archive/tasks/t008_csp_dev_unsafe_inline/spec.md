# Task spec

## 背景

`pnpm start`（electron-vite dev）启动后 renderer 全黑。带 `ELECTRON_ENABLE_LOGGING=true` 抓 renderer console，看到 `Uncaught Error: @vitejs/plugin-react can't detect preamble. Something is wrong.`（source: Icon.tsx），前置 CSP 警告 `script-src 'self' http://localhost:5173 'unsafe-eval'` 阻断 inline script。根因：dev CSP `script-src` 缺 `'unsafe-inline'`，plugin-react 注入的 React Refresh preamble（inline `<script type="module">`）被拦，所有 `.tsx` 模块加载失败。prod（打包版）CSP 为 `'self'` 且无 React Refresh，不受影响；此前能跑的是打包版，dev 一直黑。

## 范围

- 抽 CSP 构造为纯函数 `src/main/security/csp.ts`（`build_csp_script_src` / `build_csp_connect_src` / `build_csp_header`）。
- dev 分支 `script-src` 加 `'unsafe-inline'`（仅 dev）。
- 单测覆盖 dev/prod 两路，防回退。
- `src/main/index.ts` 改调用纯函数。

## 非范围

- 不动 prod CSP（仍 `'self'`）。
- 不引入 nonce/hash 方案（dev 本地，`'unsafe-inline'` 可接受；prod 无 inline 脚本）。
- 不改 `style-src` / `img-src` / `connect-src` 既有策略（`connect-src` 仅随抽函数搬迁）。

## 验收标准

- [ ] dev 模式 `pnpm start` 后 renderer 正常渲染（非黑屏），stdout 无 `can't detect preamble`。
- [ ] `build_csp_script_src(null)` === `"'self'"`（prod 不变）。
- [ ] `build_csp_script_src("http://localhost:5173")` 含 `'unsafe-inline'`。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 仅 dev 行为变更；安全约束：prod CSP 不得放宽。
