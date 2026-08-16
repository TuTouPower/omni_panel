# p188 web e2e：popup 顶栏无 title="设置" 按钮

- 现象：`tests/e2e/web/popup_demo_alignment.spec.ts` 断言 `locator('[title="设置"]')` 可见失败（element not found）。
- 影响：web e2e 全量非绿；用量面板顶栏设置入口可达性/选择器可能已改。
- 根因：t406 跑全量 e2e 时复现；与 surface token 类名无关。`PanelTitleBar`/`PopupView` 未见 `title="设置"`；疑似导航改名或改用 aria-label。
- 测试缺口：e2e 选择器与生产 DOM 漂移；应改为 role/name 或 data-testid 并补单元覆盖。
- 线索：t406 黑盒 `MOCK_FIXTURE=synthetic pnpm test:e2e:web`；artifacts `artifacts/e2e-artifacts/popup_demo_alignment-*`
- 处理：未开
