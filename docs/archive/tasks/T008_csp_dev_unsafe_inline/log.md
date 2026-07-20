# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- 起因：用户报"软件完全黑屏，你不看日志吗"。先读 `app-2026-07-20.log`：main/connector/CPA 全正常（8 items、3 窗口广播），但当日重启后无一条 `renderer:*` 日志——renderer 根本没执行到 logger。
- 转折 1：Playwright 直连 dev server（`http://localhost:5173/#usage`）抓 console，首条 TypeError 指向 `logger-transport.ts` `api.log` undefined。**误判**：那是 Playwright 无 preload（`window.usageboard` 未注入）的副作用，非 Electron 真因。注入 mock `usageboard` 后仍白屏，且 mock 在 evaluate 时丢失——排除该路径。
- 转折 2：带 `ELECTRON_ENABLE_LOGGING=true` 重启，renderer console 转发到 stdout，抓到真因：`Uncaught Error: @vitejs/plugin-react can't detect preamble`（source: Icon.tsx）+ CSP `script-src ... 'unsafe-eval'`（无 `'unsafe-inline'`）阻断 inline 脚本。前两次启动未带此 env，故 console 不转发、一直没看到。
- 根因：`src/main/index.ts:126` dev CSP `script-src` 缺 `'unsafe-inline'`，plugin-react 的 React Refresh preamble（inline `<script type="module">`）被拦 → 所有 `.tsx` 加载失败 → 黑屏。prod 无 React Refresh，不受影响。
- 决策：dev 加 `'unsafe-inline'`（本地可接受）；抽纯函数 + 单测防回退；prod CSP 严格不变。
- 验证：修复后重启，`can't detect preamble` 错 0、`Uncaught Error` 0、`[vite] connected` × 3 窗口、React DevTools 加载提示出现。
