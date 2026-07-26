# Task plan

## 步骤与验证

1. 读 `src/renderer/components/forms/OAuthDeviceForm.tsx`，确认 `secret_name` prop 在 DOM 的体现（input name / aria-label / 文案 / 是否根本不渲染） → 验证：明确 secret_name 当前是否在 DOM 可查。

2. 若 DOM 已有 secret_name 痕迹 → 直接在 `add_account_dialog.test.tsx` grok catalog 测试补断言（如 `expect(container.querySelector('input[name="OAUTH_TOKEN"]')).toBeInTheDocument()`） → 验证：测试通过。

3. 若 DOM 无 secret_name 痕迹 → 在 OAuthDeviceForm 的根容器或关键 input 加 `data-secret-name={secret_name}` 属性（最小暴露），再在测试断言 → 验证：typecheck + 测试通过，OAuthDeviceForm 其他行为不变。

4. 跑 `pnpm test` 全量 → 验证：全绿。

## 风险与回退

- 风险：加 `data-*` 属性被判为"为实现测试改产品代码"，reviewer 可能异议。
    - 缓解：`data-secret-name` 属合理的可测试性属性（非视觉/行为改动），spec 已注明目的；若 reviewer 仍反对，回退到仅依赖 on_save 断言（即放弃本 task，记遗留）。
- 风险：grok DOM 结构与其他 vendor 表单不一致，断言方式无法泛化。
    - 缓解：本 task 仅覆盖 grok（spec 非范围明确），不强行泛化。
- 回退：单 commit，`git revert` 即可。

## Finalization 时更新的 blueprint

- 无（测试增强，不改架构/约定）。
