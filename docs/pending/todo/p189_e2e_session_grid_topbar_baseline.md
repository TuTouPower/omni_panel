# p189 web e2e：session grid 顶边与 topbar 底边差 ~33px

- 现象：`tests/e2e/web/session_panel.spec.ts` t323 布局用例 `expect(|grid.top - topbar.bottom|) <= 1` 失败，实测差约 33px。
- 影响：会话面板布局 e2e 失败；断言未计入 t380 引入的 `.session-rail-toggle-row`（h-8 ≈ 32px）夹层。
- 根因：t380 将 rail-toggle 下移为顶栏下方独立行；测试仍要求 grid 直顶 topbar。t406 仅改背景 token，未动布局。
- 测试缺口：应断言 grid 顶边对齐 toggle 行底边，或与 rail-scroll 同基线（已有第二断言）；更新 t323 AC 语义。
- 线索：t406 黑盒 e2e；`SessionShell` 结构 header → rail-toggle-row → main
- 处理：未开
