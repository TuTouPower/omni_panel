# Task plan

## 步骤与验证

1. 批量读候选 spec，按"可平移 / 需 rewrite / 需留 electron"复核分类 → 验证：分类表
2. `SettingsPage` 加 `open_via_hash(page)` 静态方法（web 版，`page.goto("#setting")`）→ 验证：typecheck
3. 批量迁纯 DOM spec：改 fixture import + `omni`→`webPage`，`omni.app.firstWindow()` 删 → 验证：每文件 grep 无 omni 残留
4. 迁 openSettings rewrite spec：同上 + `openViaIpc`→`open_via_hash` → 验证：grep 无 openViaIpc
5. `pnpm test:e2e:web` 跑全 web/ → 验证：全绿；失败的回 specs/（留 T012）
6. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：spec 隐含 Electron 依赖（如 `omni.app.windows()`、`app.evaluate`）未识别 → 迁后跑红 → 回 specs/
- 风险：web SPA 某些 DOM 在 web 模式隐藏（is_web 隐藏托盘/窗口按钮）→ 断言调整或留 electron
- 风险：openSettings web 版无新窗口，spec 断言"settings 窗口独立"失效 → 改断言"hash=#setting"
- 回退：失败 spec `git mv web/ specs/` 还原

## Finalization 时更新的 blueprint

- 无（架构未变）
