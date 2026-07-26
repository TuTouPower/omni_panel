# Task plan

## 步骤与验证

源码侧（先红后绿不适用于纯重构，直接搬运 + 验证）：

1. 读 `ProviderCard.tsx` 全文，划定抽出边界。优先抽错误态（`render_state`/`render_error_banner`/`is_auth_error`，行数最独立、props 最少），其次概览/明细渲染。→ 验证：边界内代码只依赖少量 props，可封装为独立组件。
2. 新建源码子组件文件（如 `provider_card_states.tsx` / `provider_card_content.tsx`），剪切对应渲染函数为组件，`ProviderCard` 改为引用。保持 `ProviderCard` 导出签名与 memo 不变。→ 验证：`wc -l ProviderCard.tsx` < 400；typecheck 通过。

测试侧：

3. 新建公共 fixture helper（如 `tests/unit/renderer/components/provider_card_fixture.ts`），迁入 `makeGroup`、`makePeriod`、`hex_to_rgb`，并导出统一 `useTheme` mock 安装函数（或各文件重复 `vi.mock`，按 vitest mock 提升规则选最稳方案）。→ 验证：helper 可被各测试文件 import。
4. 按功能域把 30 个 `it` 分到多个测试文件（overview 聚合 / colors / states 错误态 / label_map / collapse 菜单 / drag 等），每文件带独立 `describe`。→ 验证：拆分前后 `it` 总数一致（30）；各文件 `wc -l` < 600。
5. 原 `provider_card.test.tsx` 清空或改为只保留一个功能域，删除已迁出用例与已归并的 fixture。→ 验证：无重复 `it`。
6. 跑 typecheck 与 `pnpm test`。→ 验证：全绿，无新增失败，覆盖率不下降。

## 风险与回退

- 风险：vitest `vi.mock` 提升（hoisting）在跨文件共享 fixture 时行为差异，导致 `useTheme` mock 失效。
    - 缓解：mock 语句保留在每个测试文件内（vitest 推荐），仅共享纯数据 fixture；或封装为 `setup` 函数显式调用。
- 风险：拆分源码时子组件 props 漏传/改序，行为漂移。
    - 缓解：抽出组件 props 与原闭包内引用一一对应；typecheck + 全量测试兜底。
- 回退：源码改动集中在 ProviderCard 相关新/旧文件，测试为纯移动；`git checkout -- <file>` 按文件回退。

## Finalization 时更新的 blueprint

- 无（文件拆分，不改架构约定）。
