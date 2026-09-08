# Task review t458（reviewer_focus: 通用）

- task：`t458_session_library_title_cwd_ui`
- spec：`docs/tasks/t458_session_library_title_cwd_ui/spec.md`
- diff_anchor：`1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- target：`git diff 1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- round：1
- reviewed_at：2026-09-08 07:47 UTC+8

reviewed_scope: 1051c38807bcb17e

## 评审过程记录

- diff 共 8 文件 +263/-15：`SessionLibrary.tsx`、`SessionLibrary.test.tsx`、`usageboard-web.test.ts`、`session_library_mount_refill.spec.ts`、`architecture.md`、`workspace.md`、`specs_index.md`、task front matter。
- 依赖前提核实：anchor（t457 提交）已含查询层 `title`/`directory`——`TokenStatsSessionFilters`（`src/shared/types/token-stats.ts`）、`SessionHistorySearchContentFilters`（`src/shared/types/ipc.ts`）、store LIKE 过滤、web 桥 `getSessions` 透传、桌面 IPC 直传均在 anchor 落地并有 t457 测试。本 task 只做 renderer→bridge 接线，与 spec「依赖 t457（查询契约先落地）」一致。
- 门禁实测（worktree 内）：`pnpm typecheck` ✓；`pnpm lint` ✓；`pnpm test` 286 files / 3546 passed（2 skipped，与本改动无关）；`pnpm test:e2e:web` 96 passed（含 `session_library_mount_refill.spec.ts` 3 passed）。

## Findings

（无）

## 结论

- 本轮新发现：0 条
- 未进表的提示：
    1. `tests/e2e/web/session_library_mount_refill.spec.ts:105-109`：该测试前提（50 条不溢出）与筛栏像素几何硬耦合，每次筛栏增删元素都可能再触发视口调整。既有 t334 设计权衡，spec 已声明「筛栏像素级布局与换行」有意不测，本轮改动以注释留痕（ch 1900→1856、视口 +100），适配方式最小。若再次触发，可考虑按 `clientHeight` 动态设定视口替代绝对值。
    2. `SessionLibrary.tsx:107-118` 与 `SessionLibrary.tsx:283-291`：content search filters 与 `backend_filters` 对 `sources`/`title`/`directory`/`start_at`/`end_at` 重复 spread 构造。既有模式延续（改动前两处已重复 sources/search/日期），非本次引入；若后续再增筛选条件建议提取共享 helper。
- 总体判断：AC-001～AC-006 逐条核对通过——独立标题/目录输入进 `backend_filters` 与 content search filters（`SessionLibrary.tsx:111-112`、`287-288`），空串不进请求，`has_filters` 与清空筛选覆盖两新 state（`SessionLibrary.tsx:465-472`、`637-638`），分页经 `load_more` 复用同一 `backend_filters` 不丢条件；6 个新组件用例 + 1 个 web 桥用例断言均触达请求参数与渲染结果。e2e 视口适配判断为正确：被测行为是 refill 语义而非布局，筛栏增高导致 50 条恰好溢出属预期布局几何变化，调视口恢复测试前提且非掩盖行为回归，已实测 spec 通过。文档沉淀（architecture.md/workspace.md/specs_index.md）与实现一致。无 critical/important 未解决问题。
- 系统性 follow-up：无

verdict: PASS
