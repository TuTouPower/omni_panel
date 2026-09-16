# d061 agent 会话 shell 导出 NODE_ENV=production 会让 renderer 测试项目整体失败（React 无 act）

- 来源：t490 实施现场（2026-09-16）；同一现象在 t491/t492 期间被误判为「仓库既有故障」
- 结论：本机 agent 会话的 shell 预设了 `NODE_ENV=production`。`vitest` 的 renderer 项目因此让 `react` 解析到**生产构建**（`cjs/react.production.js`），生产构建不导出 `act`，而 `@testing-library/react` 依赖 `React.act`，于是 renderer 项目所有用例统一报 `TypeError: React.act is not a function`（并伴随 `ReactDOMTestUtils.act is deprecated…` 警告）。把渲染层用例按 `NODE_ENV=test` 运行即全部正常，与仓库代码无关。
- 证据：
    - `echo $NODE_ENV` → `production`（会话环境）。
    - 探针（renderer 项目内）：`NODE_ENV: production | react version: 19.2.6 | typeof act: undefined`；加 `NODE_ENV=test` 后同一探针输出 `NODE_ENV: test | typeof act: function`。
    - 主仓 `node -e "require('react')"`：`act-ish exports: ['Activity','useActionState']`、`typeof require('react').act === 'undefined'`（生产入口）；`node_modules/react/cjs/react.development.js` 中存在 `exports.act`。
    - 实际效果：`NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/` → 18 文件 / 216 用例全绿；不加则整目录全红（base 同样）。
- 影响：任何在本会话（或同类 agent shell）里跑 renderer 项目（`tests/unit/renderer/**`、`tests/smoke/**`、`tests/unit/web/**`）的 task 都会把该失败误判为仓库缺陷并写进 handoff/notes；反向地，若据此认定「renderer 不可测」会漏掉真实回归。同类：`node` 项目跑前需 `node scripts/ensure_sqlite_abi.mjs node`，否则 better-sqlite3 原生模块会因上一步 electron ABI 而加载失败（表现为 `Cannot read properties of undefined (reading 'stop')`）。
- 现状：有效
