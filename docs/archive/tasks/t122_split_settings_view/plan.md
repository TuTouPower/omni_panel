# Task plan

## 步骤与验证

1. 盘点 SettingsView.tsx 全部顶层声明（函数/组件/常量），按"工具函数 / 通用子组件 / 对话框 / hook / 主体"五类分组，列表确认搬迁边界 → 验证：盘点清单（草稿，不入库）覆盖全部顶层符号，无遗漏、无交叉引用死锁。

2. 先抽风险最低的纯工具函数（无 React 依赖：`main_panel_mode_*` / `floating_height_mode_*` / `log_level_*` / `bar_style_*` / `snapshot_items` / `connection_status` / `map_status`）到 `src/renderer/views/settings-view/lib.ts` → 验证：`pnpm typecheck` 通过，SettingsView import 改为新路径。

3. 抽通用 UI 子组件（`Toggle` / `SetRow` / `Select` / `BarSchemeField`）到 `src/renderer/components/settings/`，props 类型随组件导出 → 验证：typecheck + 该文件相关测试（settings_view smoke）通过。

4. 抽 `AccountDialog`（含 props 类型）到 `src/renderer/components/AccountDialog.tsx`；`CpaAddDialog` 同目录 → 验证：typecheck + add_account_dialog / settings_view 测试通过。

5. 抽 catalog 加载 + onAddAccount 流程到 `src/renderer/hooks/use-connector-catalog.ts`（hook 返回 `{ catalog, createInstanceAndSave }` 或类似），SettingsView 调用 → 验证：typecheck + settings_view onAddAccount 测试通过。

6. 跑 `pnpm test` 全量 + `pnpm typecheck` → 验证：全绿，SettingsView.tsx 行数 < 800。

7. 逐文件核对 diff：确认每行改动属"移动 + import + 类型导出"，无逻辑改动 → 验证：双审 code reviewer 确认零行为变化。

## 风险与回退

- 风险：抽出组件依赖 SettingsView 内部闭包变量（如 configRef / save_config），强行抽出会破坏 props 边界，导致反复改 props。
    - 缓解：盘点阶段标记每个符号的依赖；闭包依赖重的（如 onAddAccount 内联 savePluginSettings）先抽 hook 把依赖参数化，再迁组件。
- 风险：测试 mock 路径写死 `SettingsView.tsx` 内部符号（vi.mock 整个文件），抽出后 mock 失效。
    - 缓解：抽出后跑测试定位失效 mock，改 mock 路径指向新文件；保持导出形状不变。
- 风险：拆分中途超 round 阈值（机械工作量大）。
    - 缓解：按"工具函数 → 子组件 → 对话框 → hook"递进，每步独立可提交/可验证；必要时拆多个 commit（仍在同一 task 分支）。
- 回退：纯搬迁，每个子步骤独立 commit，`git revert` 单步即可回滚特定抽出。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：更新渲染层目录结构说明（SettingsView 拆出的子目录/hook）。
- `docs/blueprint/conventions.md`：若抽出过程确认了新的文件组织约定（如 settings 子组件目录命名），记录之。
