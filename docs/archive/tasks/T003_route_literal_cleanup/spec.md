# Task spec

## 背景

T001/T002 review 遗留合并：

- T002_test_f003：`main-panel-controller.ts:121` 仍传 `"popup"` 给 `get_renderer_url`（route 值应为 usage）。`use_route` VALID_ROUTES 兜底（popup->usage）故行为无差异，但字面量残留与 route 统一前提冲突。
- T001_test_f001：preload route switch 无回归断言守护 route 值；若未来再改名，静态源码层面无 test 守门。

## 范围

- `src/main/core/main-panel/main-panel-controller.ts` L121：`get_renderer_url("popup")` → `get_renderer_url("usage")`
- `tests/unit/route_values.test.ts`：新建，仿 `first_paint_theme.test.ts` 静态源码断言风格，守护 route 值在五处统一（preload/index.ts、route_api.ts、main-panel-controller.ts、window-manager.ts、use-route.ts）

## 非范围

- 不改 `MainPanelShellMode` 值（system/popup/floating，非 route 语义）
- 不改 main-panel-controller 其他 `"popup"`（L126/L181 为 shell mode）

## 验收标准

- [ ] `main-panel-controller.ts` L121 = `get_renderer_url("usage")`，无 `get_renderer_url("popup")` 残留
- [ ] `route_values.test.ts` 断言五处 route 值统一为 usage/setting/tray/agent
- [ ] `pnpm test` 全绿（含新 test）

## 依赖与约束

- 无
