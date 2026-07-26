# Task review t146（reviewer_focus: 测试）

- task：`t146_docs_blueprint_sync`
- spec：`docs/tasks/t146_docs_blueprint_sync/spec.md`
- diff_anchor：`f8c7610cbefe1113f9a8b0bac1a8e4773de1299c`
- target：`git diff f8c7610cbefe1113f9a8b0bac1a8e4773de1299c`
- round：1
- reviewed_at：2026-07-26 16:08 UTC+8

## Findings

### t146_test_f001 - domain.md 内置 provider 枚举遗漏 `cpa`

- 严重度：important
- 位置：`docs/blueprint/domain.md:13`
- 问题：当前 diff 将内置 provider 列表从 12 个补到 15 个，但 `connectors/` 目录实际存在 16 个内置连接器；`cpa` 未被列入。`connectors/cpa/manifest.json` 明确声明 `"provider": "cpa"`，且源码多处将 `cpa` 作为 provider 处理（如 `src/renderer/lib/common-services.ts:21`、`src/renderer/components/AccountDialog.tsx:146`、`src/renderer/components/AccountRow.tsx:46`）。文档与源码的 provider 枚举不一致。
- 建议：在 `domain.md` 内置 provider 列表中追加 `cpa`，使枚举与 `connectors/*` 及代码用法一致。

### t146_test_f002 - `t124` 被提前归档并附带虚假完成记录

- 严重度：important
- 位置：`docs/tasks/t124_move_session_meta_to_lib/task.md`（已删除并移至 `docs/archive/tasks/t124_move_session_meta_to_lib/task.md`）、`docs/specs/move_session_meta_to_lib.md`、`docs/archive/tasks/t124_move_session_meta_to_lib/review_test.md`
- 问题：本 diff 将 `t124` 整套任务文件从 `docs/tasks/` 移入 `docs/archive/tasks/`、新建 `docs/specs/move_session_meta_to_lib.md`，并在 task.md / review_test.md / spec.md 中均按「已完成」撰写，但对应实现与测试在当前工作区均不存在：
    - 声称 `session_meta` 已迁移至 `src/renderer/lib/session_meta.ts`，但实际 `session_meta` 仍在 `src/renderer/views/settings-view/lib.ts:59` 导出。
    - 声称 `AccountDialog.tsx` 已改从新路径导入，但实际 `src/renderer/components/AccountDialog.tsx:8` 仍 `import { session_meta } from "../views/settings-view/lib"`。
    - 声称新增 `tests/unit/renderer/lib/session_meta.test.ts`，但该测试文件不存在。
    - `docs/archive/tasks/t124_move_session_meta_to_lib/review_test.md` 给出 0 finding + `verdict: PASS`，但所审 diff 并未包含上述迁移，属于对未发生改动作出的 PASS 判定。
      这些记录与源码/测试事实不符，构成完成状态与测试覆盖的虚假归档。
- 建议：从本 task 的 diff 中撤销对 `t124` 的归档（恢复 `docs/tasks/t124_move_session_meta_to_lib/`、删除 `docs/archive/tasks/t124_move_session_meta_to_lib/` 与 `docs/specs/move_session_meta_to_lib.md`、恢复 `docs/tasks_index.json` 中 t124 的状态），待 `t124` 实际实现并通过审阅后再按流程归档。

### t146_test_f003 - conventions.md 组件命名规则与现有 settings-view sections 文件名冲突

- 严重度：minor
- 位置：`docs/blueprint/conventions.md:23`
- 问题：新增规则写明「组件文件保持 `PascalCase`」，但 `t122` 拆出的 `src/renderer/views/settings-view/sections/` 下组件文件（如 `about_section.tsx` 导出 `AboutSection`、`accounts_section.tsx` 导出 `AccountsSection`）均使用 `snake_case` 文件名。规则与现有代码实践不一致，可能造成后续命名困惑。
- 建议：要么在规则中明确 `settings-view/sections/` 等子目录 section 文件作为例外使用 `snake_case`；要么说明这些文件属于待重命名遗留项。若坚持组件文件必须 `PascalCase`，则需另行 task 重命名这些文件。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：3 条（1 条 provider 枚举遗漏、1 条 task 被提前归档并附虚假完成记录、1 条命名规则与代码冲突）
- 总体判断：文档同步在 LocalAPI 行为、ADR 编号、providerForcePercent 类型、window-management 引用等多数项上准确，但存在 provider 枚举遗漏及 `t124` 被提前归档所附带的虚假实现/测试/审阅记录，需修复后方可通过。

verdict: FAIL

## Round 2 (2026-07-26 16:32 UTC+8)

### t146_test_f004 - `usageProviderSchema` 与 `domain.md` 内置 provider 枚举不一致

- 严重度：important
- 位置：`src/shared/schemas/plugin-output.ts:6-22`
- 问题：`usageProviderSchema` 枚举仅包含 15 个内置 provider（`claude` `codex` `antigravity` `kimi` `glm` `minimax` `deepseek` `getoneapi` `tavily` `firecrawl` `exa` `tikhub` `mimo` `opencode_go` `grok`），遗漏 `cpa`。而 `docs/blueprint/domain.md:13` 已将 `cpa` 列入内置 provider 列表，`connectors/cpa/manifest.json` 声明 `"provider": "cpa"`，且 renderer 层（`src/renderer/components/AccountDialog.tsx:146`、`src/renderer/components/AccountRow.tsx:46`、`src/renderer/lib/common-services.ts:21`）均将 `cpa` 作为 provider 处理。`docs/blueprint/conventions.md:173` 亦要求"新 provider 需同步：`usageProviderSchema` 枚举"。文档与源码的 provider 窄类型枚举不一致，意味着 cpa 连接器输出的 `provider` 字段在经 `usageProviderSchema` 校验/推断的上下文中会被视为无效。
- 建议：将 `cpa` 加入 `src/shared/schemas/plugin-output.ts` 的 `usageProviderSchema` 枚举；或在 `domain.md` 中明确 `cpa` 为例外并解释其与 `usageProviderSchema` 的关系。若坚持 t146 不改源码，则应在 `task.md` 中将此项标为遗留。

### 结论

- 前轮 finding 复核：
    - t146_test_f001（`domain.md` 遗漏 `cpa`）：已修。`docs/blueprint/domain.md:13` 内置 provider 列表已追加 `cpa`，且与 `connectors/` 下 16 个 `manifest.json` 一一对应。
    - t146_test_f002（`t124` 提前归档/实现缺失）：状态变化，未彻底清理。`docs/archive/tasks/t124_move_session_meta_to_lib/` 与 `docs/specs/move_session_meta_to_lib.md` 已从 diff 中移除，但当前 diff 仍包含 `t124` 实现改动（`src/renderer/lib/session_meta.ts`、`tests/unit/renderer/lib/session_meta.test.ts`、`src/renderer/components/AccountDialog.tsx`、`src/renderer/views/settings-view/lib.ts`）以及 `docs/tasks/t124_move_session_meta_to_lib/task.md`、`docs/specs_index.md` 中新增 `t124` 完成记录。验证表明 `t124` 实现本身真实可用（`pnpm typecheck` 通过，`pnpm vitest run tests/unit/renderer/lib/session_meta.test.ts` 2 tests 通过），但 `t124` 改动仍混杂在 t146 review diff 中，且当前分支为 `t124_move_session_meta_to_lib`，与 t146 任务范围/分支隔离原则冲突。
    - t146_test_f003（`conventions.md` 组件命名规则与 `t122` section 文件名不一致）：已修。`docs/blueprint/conventions.md:23-28` 已补充"由大视图拆出的局部 section 子组件沿用所在目录的 `snake_case` 文件名，组件名仍用 `PascalCase`"，且 `src/renderer/views/settings-view/sections/{about,accounts,appearance,data,general}_section.tsx` 实际文件名与导出的组件名符合该例外。
- 类型声明与源码一致性核验：
    - `providerForcePercent`：`docs/specs/config-store.md:12` 已改为 `Partial<Record<string, boolean>>`，与源码 `src/shared/types/config.ts:63` 的 `Readonly<Partial<Record<string, boolean>>>` 及 `src/main/core/config/types.ts:99` 的 `z.record(z.boolean()).optional()` 一致。
    - LocalAPI 行为：`docs/blueprint/architecture.md` 描述（绑 `0.0.0.0`、仅 `/v1/ingest` 需 Bearer、其余 web 路由免认证）与 `src/main/core/local-api/server.ts:472` 的监听地址及 `handle_request` 中的路由/鉴权顺序一致；`tests/integration/local-api/server.test.ts` 16 tests 通过，覆盖了 health 免认证、ingest 需认证、web read 免认证等场景。
    - `runtime.ts` 失效 `D8` 引用：已删除，仅保留 `isolated-vm` 泛指。
- 交叉引用有效性核验：`architecture.md` 引用的 `specs/web-panel.md`、`window-management.md` 引用的 `ipc-api.md`/`ipc-electron.md`/`ui-views-desktop.md`/`ui-views-web.md`、`config-store.md` 引用的 `window-management.md` 均存在；`handoff.md` 引用的 `docs/archive/tasks/t121_add_account_manifest_catalog/` 与 `docs/archive/tasks/t122_split_settings_view/` 均存在；`bugs.md` 引用的 t111 commit `994139c` 存在且 message 与修复描述一致。
- 本轮新发现：1 条（`usageProviderSchema` 遗漏 `cpa`）
- 总体判断：t146 文档改动在 `providerForcePercent` 类型、`LocalAPI` 行为描述、交叉引用、`ADR` 编号、`runtime.ts` 注释修正等方面均与源码一致；但 `t124` 改动仍残留于当前 diff 且当前分支非 t146，同时源码 `usageProviderSchema` 与同步后的 `domain.md` provider 枚举不一致，需处置后方可通过。

verdict: FAIL
