# Task plan

## 步骤与验证

1. 红：`icon.test.tsx` 加用例（`<VendorMark id="cpa" />` 渲染 `img.vendor-logo-img` 且 src 含 cpa，无内联 SVG）→ 验证：`pnpm vitest run tests/unit/renderer/components/icon.test.tsx` 失败（当前回落 VENDOR_MARKS 圆环）。
2. `Icon.tsx`：import `cpa.png` + 注册 `VENDOR_LOGOS["cpa"]`，删 `VENDOR_MARKS["cpa"]` → 验证：新用例转绿。
3. 视觉抽查 28px 下渲染（含深色主题）→ 验证：dev 启动肉眼确认。
4. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：`VENDOR_MARKS["cpa"]` 删除后有测试/代码仍引用旧 fallback；PNG 无透明通道深色主题下白底。
- 回退：改动仅 `Icon.tsx` 数行 + 测试，`git checkout` 还原。

## Finalization 时更新的 blueprint

- 无（纯资产接线）。
