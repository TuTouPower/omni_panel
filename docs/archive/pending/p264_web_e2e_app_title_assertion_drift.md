# p264 t493 标题简化后部分存量 web e2e 用例仍断言 "Omni Panel" 导致失败

- 现象：跑全量 `pnpm test:e2e:web` 时，`tests/e2e/web/app_lifecycle.spec.ts:10`、`tests/e2e/web/popup_platform_behavior.spec.ts:9` 与 `tests/e2e/web/popup_view.spec.ts:10` 报 `expect(received).toContain("Omni Panel")` 失败，实际收到的 `app-title` 为 `"Usage"`。
- 影响：全量 `test:e2e:web` 套件红 3 个用例；阻碍 web e2e 作为无障碍门禁全绿执行。
- 根因：t493（commit `9fb1d2dc`）将 `PanelTitleBar` 中的 `app-title` 统一从 `Omni Panel - ${panel}` 简化为仅 `{panel}`（如 `"Usage"`），但在迁移时遗漏了上述 3 个直接调用 `popup.getTitle()` 并强断言包含 `"Omni Panel"` 的 web e2e 用例（而 `popup_theme.spec.ts` 已改为断言 `toBeTruthy()`）。
- 测试缺口：web e2e 存量用例与现有 UI 标题呈现规范不一致。应将上述 3 个用例的标题断言与现有规范对齐。
- 线索：`tests/e2e/web/app_lifecycle.spec.ts:15`、`tests/e2e/web/popup_platform_behavior.spec.ts:15`、`tests/e2e/web/popup_view.spec.ts:14`。
- 处理：main
