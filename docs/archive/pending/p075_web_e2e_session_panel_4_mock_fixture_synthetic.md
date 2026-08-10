# p075 web e2e session_panel 4 用例既有失败（MOCK_FIXTURE=synthetic 下）

- 来源：t249 黑盒
- 现象：`pnpm test:e2e:web`（`MOCK_FIXTURE=synthetic`）下 `session_panel.spec.ts` 4 用例失败：t228「会话库搜索/筛选/排序/预览/并排打开闭环」等「9 个会话」计数（页面显示「统计不可用」）+ t237 三个虚拟列表用例等 `.lib-card` 标题「大会话虚拟列表」hover 超时。
- 影响：web e2e 非全绿；会话库统计与虚拟列表路径无 e2e 保障。
- 根因：`MOCK_FIXTURE=synthetic` 时 mock 全量 `/v1/*` 走 `synthetic.json`，该 fixture 不含「9 个会话」统计聚合与「大会话虚拟列表」会话标题（t237 经 `page.route` 注入 `LARGE_SESSION` 但会话库卡片未找到标题对应卡片）；主仓基线（未改代码）同样 4 failed，确认为存量 fixture/测试问题。
- 测试缺口：synthetic fixture 未覆盖会话库统计端点与虚拟列表会话标题。
- 线索：`tests/e2e/fixtures/synthetic.json` 端点数 64，无 `/v1/sessionStats` 类统计端点；`scripts/e2e/session_fixture.mjs` 生成脚本亦无「大会话虚拟列表」。
- 处理：t266
