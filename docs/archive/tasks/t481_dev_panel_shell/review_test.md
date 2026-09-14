# Task review t481（reviewer_focus: 测试）

- task：`t481_dev_panel_shell`
- spec：`docs/tasks/t481_dev_panel_shell/spec.md`
- diff_anchor：`35d8c0152c7c1ab6091736dfe675fb6a1519463c`
- target：`git diff 35d8c0152c7c1ab6091736dfe675fb6a1519463c`
- round：1

## Findings

本轮零 finding。

测试审查独立重跑了 t481 定向集合、Web bridge/LocalAPI 通路、真实临时 Git 仓库、PanelTitleBar、ECharts option 和 style token 回归；未发现恒真/弱化断言、关键逻辑 mock 掉、`.skip`/`.only` 或为掩盖失败而放宽阈值。全量 Vitest 中 t481 相关文件均通过；剩余失败可复现地集中在 `better-sqlite3` native binding 缺失和未修改的 refresh-service 集成用例。

## 结论

- 定向集合 `6 files / 116 tests` PASS，热力图纯函数 `1 test` PASS；scanner 使用真实 `git init/commit` fixture，不以 mock 替代 Git 解析。
- author date 与 committer 字段、cutoff、身份过滤/降级、重叠根去重、缺失根继续扫描和并发合并均有行为断言。
- LocalAPI 使用真实监听端口和 `fetch`，Web bridge 使用真实 `fetch` mock 断言 endpoint/body/hash；桌面 sender 校验和 manager 接口由类型/实现复核。
- PanelTitleBar 既有四面板断言已同步为五面板，lazy-ECharts mock 同步新增 `CalendarComponent`，style token 断言通过。
- 全量结果：3,704 tests，3,336 passed、2 skipped、366 failed；失败未落在 t481 新增/修改测试，失败原因与代码差异无关。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|trust_prior|自动化覆盖菜单/IPC 接线，真实桌面窗口聚焦行为需部署态人工签收。|
|AC-002|re_verified|`PanelTitleBar.test.tsx` 19 tests 通过，包含五入口顺序和 Dev 按钮。|
|AC-003|re_verified|`usageboard-web.test.ts` t481 用例断言 hash 与三条宿主 HTTP 委托；LocalAPI test 断言 endpoint。|
|AC-004|re_verified|真实 Git fixture 与 manager 状态测试通过，View 的状态/错误呈现经代码复核。|
|AC-005|re_verified|scanner fixture + global config/missing config 两段断言覆盖 author filter 与 fallback。|
|AC-006|re_verified|`CommitHeatmap.test.ts` 断言 option 数据、色阶 max、tooltip repository detail。|
|AC-007|re_verified|config schema 与 View save 调用断言/复核通过；跨重启真实 Electron 持久化留部署态抽查。|
|AC-008|re_verified|type/space token suite、Prettier、ESLint 和 Electron/Web build 通过。|
|AC-009|re_verified|missing root + valid root scanner test 通过；Git 命令实现为只读参数。|
|AC-010|re_verified|LocalAPI真实端口 test + Web bridge host endpoint test 通过，共享 manager 接线已核对。|
|AC-011|re_verified|author/committer、identity filtering and visible fallback scanner test 通过。|
|AC-012|re_verified|overlapping roots test 断言一个 repository summary；实现 common-dir 去重已核对。|
|AC-013|re_verified|manager concurrent start test 断言合并；cancel/error 分支由代码审查覆盖。|

coverage = 12 / 13

reviewed_scope: c600292679f83668

verdict: PASS
