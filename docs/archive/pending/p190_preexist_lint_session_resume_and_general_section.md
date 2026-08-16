# p190 存量 lint 红：session-resume、general_section 及其余 3 处

- 现象：`pnpm lint` 全仓红。**当前全量 6 errors**（核实 2026-08-16）：
    - `src/renderer/lib/session-resume.ts:32-33`（`no-unnecessary-condition`）
    - `src/renderer/views/settings-view/sections/general_section.tsx:48`（`no-dynamic-delete`）
    - `tests/unit/renderer/views/settings_view_general.test.tsx:32`（`consistent-type-imports`，t418 引入，原条目未列）
    - 另 2 处为**未提交 WIP**（进行中 CLI 重构）：`src/main/index.ts:128`（`no-unnecessary-type-conversion`，`Boolean(process.stdout.isTTY)`）、`src/main/cli/background_serve.ts:111`（`no-unnecessary-condition`，untracked 文件）——随 WIP 提交时处理，不并入本条目修复范围。
- 影响：`pnpm lint` / `pnpm check` 门禁失败；与阴影/浮层无关，t415 未触；t412 收尾笔记已记录 session-resume/general_section 两处同残留（未记 test.tsx 与 WIP）。
- 根因：t402（8d65e9b8）引入 `as const` 模板表 + `ResumeCommandSource = keyof ...` 后，`[source as ResumeCommandSource] ?? null` 与 `!builtin` 恒真/恒假，动态 `delete next[source]` 触发 strictTypeChecked 规则；`source as ...` 断言掩盖运行时可达分支（AC-004 证明 unknown source → null 是实际行为）。eslint strictTypeChecked 规则 2026-08-11 已启用（db4f25c5），t402/t418 合入即红——**门禁当时未拦住**（CI check job 含 lint）。test.tsx:32 为 t418 的 theme vi.mock 引入 `import()` 类型注解。
- 测试缺口：CI（`.github/workflows/ci.yml` check job）**已跑** `pnpm check` 含 lint，门禁存在，缺口在合入流程（t402/t418 仍带红进 main）。无测试假绿：resume_command unknown source（session_resume.test.ts AC-004）与模板清空删键（settings_view_general.test.tsx AC-003/003b）语义正确已覆盖；修复须保持这两处运行时语义，测试即回归网。补测方向：无需新增；若改用类型守卫（如 `source in DEFAULT_RESUME_COMMAND_TEMPLATES`）替代断言，AC-004 可验证。
- 线索：`.scratch/p190_lint_verify.md`；git blame 8d65e9b8（t402）/ 78f9c4c3c（t418）；eslint.config.ts:9；已 suppress 同类位点可对照：`account-overrides.ts:33,65,108,112`（no-dynamic-delete ×4）。
- 处理：t432
