# Task plan

## 步骤与验证

1. 红灯测试：为新的「即将重置」卡片组件写失败测试（渲染、折叠、拖拽、空态）。→ 验证：`pnpm exec vitest run tests/unit/renderer/components/upcoming_reset_card.test.tsx` 失败。
2. 实现 `UpcomingResetCard` 组件，复用 `CollapsibleCard` + `DragGrip` + `UpcomingResetRow`。→ 验证：单测通过。
3. 在 `PopupView` 概览页将卡片纳入 `.overview-grid`，替换原 `UpcomingResetBanner` 位置；决定 `UpcomingResetRail` 去留。→ 验证：视觉检查 + 相关测试通过。
4. 接入拖拽与折叠持久化：以 `__upcoming_reset__` 复用 `providerOrder` / `expandedProviders`，并在状态裁剪中保留该键。→ 验证：配置读写测试。
5. 运行 `pnpm typecheck`、改动文件 Prettier、`pnpm test`。→ 验证：全部通过。
6. Electron 黑盒验证卡片在真实窗口中的渲染、折叠、拖拽。→ 验证：`pnpm build && pnpm test:e2e:electron`。
7. 双审、收尾、归档、提交。

## 风险与回退

- 风险：保留键混入 provider 排序影响 tab 顺序或被状态裁剪删除。缓解：`use_popup_derived` 仅依据可见 provider 派生 tab；状态裁剪显式保留 `__upcoming_reset__`。
- 回退：恢复 `UpcomingResetBanner` / `UpcomingResetRail` 的概览渲染路径。

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：更新「即将重置」区域描述，从 banner/rail 改为统一卡片。
- `docs/specs_index.md`：追加 t105。
