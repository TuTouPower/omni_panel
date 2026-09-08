# Task review t458（reviewer_focus: 代码）

- task：`t458_session_library_title_cwd_ui`
- spec：`docs/tasks/t458_session_library_title_cwd_ui/spec.md`
- diff_anchor：`1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- target：`git diff 1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- round：1
- reviewed_at：2026-09-08 07:15 UTC+8

reviewed_scope: 1051c38807bcb17e

## Findings

无。

## 结论

- 本轮新发现：0 条。

- AC 逐条核对（实现层）：

    - AC-001（独立标题输入）：`SessionLibrary.tsx:511-519` 独立 Input（aria-label「标题」），值进 `backend_filters`（`:111`，`...(title_filter ? { title: title_filter } : {})`），仅填标题时请求含 `title`、不含 `search`/`directory`。测试用 mock 按 `filters.title` 分流返回，断言 `not.toHaveProperty("search")`/`not.toHaveProperty("directory")`，并实测渲染结果只剩命中会话（SessionLibrary.test.tsx「t458 AC-001」）。✅
    - AC-002（独立工作目录输入）：`SessionLibrary.tsx:520-528`（aria-label「工作目录」），`backend_filters:112` 同构透传；测试断言不串 title（「t458 AC-002」用例，`not.toHaveProperty("title")`）。✅
    - AC-003（组合 AND + 分页不丢条件）：`backend_filters` 为 useMemo，date/agent/sort/title/directory 全部进同一对象；首页请求 `{...backend_filters, limit, offset: 0}`（`:162-166`），加载更多 `{...backend_filters, limit, offset}`（`:201`）复用同一 memo，分页天然继承条件；`load_more` 依赖数组含 `backend_filters`（`:217`）。测试「t458 AC-003」五条件同时设置后触底加载，断言第 2 页请求带 title/directory/sources/start_at/end_at/order_by/offset:50。实测通过。✅
    - AC-004（清空筛选）：清除按钮 handler 增 `set_title_filter("")`/`set_directory_filter("")`（`:636-638`），`has_filters` 计入两者（`:465-472`）；测试断言输入 value 为空且后续请求不含非空 title/directory。✅
    - AC-005（内容搜索候选过滤）：searchContent filters 中与 backend_filters 同步加 title/directory（`:287-288`），effect 依赖数组同步加入两 state（`:378`）——标题/目录变更会重启防抖搜索。测试断言 `filters` 含 title/directory/search；「被排除会话不出现」语义由后端候选过滤保证（t457 已测），UI 侧请求字段正确即达标。✅
    - AC-006（web/桌面一致）：`src/web/main-web.tsx:3,15` 挂载同一 `App` → `SessionShell`（SessionShell.tsx:8,148 引用同一 `SessionLibrary`），筛选逻辑仅存在于共享组件；web 桥 `getSessions` 序列化 title/directory（usageboard-web.ts:528-529，t457 已测含空串省略）；本 task 补 web `searchContent` body 原样透传断言（usageboard-web.test.ts「t458 AC-006」，POST body `toEqual` 全量 filters+keyword）。一致性论证成立。✅

- e2e 视口适配独立验证：改动仅第三个用例视口 2100→2200 并更新注释数值。实测复跑 `session_library_mount_refill.spec.ts` 3 用例全过：第 1 用例（4000 视口、110 条全补满）与第 2 用例（720 视口、溢出不预取）未改视口仍过，说明筛栏增高未破坏「补满至数据尽」「溢出即停」两个端点语义；第 3 用例原 2100 视口下 50 条首屏 sh 1859 > grid ch 1856 恰好溢出，refill 按定义停止，「50 条不溢出」前提确实失效，调至 2200 恢复的是测试前提而非掩盖回归——回归方向（refill 行为本身）有未改视口的第 1、2 用例独立覆盖。适配正确。✅

- 范围合规：diff 仅触及 SessionLibrary.tsx（+45）、三个测试文件、e2e 视口、architecture.md/workspace.md/specs_index.md 文档同步与 task.md front matter。无范围外行为，无「顺手改进」；非范围（卡片结构、预览、Dock、排序字段、页大小）均未动。✅

- 正确性/健壮性：空串不进请求（truthy 展开，与 t457「空/省略不约束」契约对齐，有补充用例覆盖清空回退）；`backend_filters` 引用稳定性由 useMemo 依赖完整保证，无竞态；`as const` 返回类型与 `TokenStatsSessionFilters`/`SessionHistorySearchContentFilters` 匹配（tsc 全绿）。无异常路径、资源、并发问题。安全：两输入经 React 受控组件渲染、值仅作查询参数透传，无注入/渲染面。✅

- 未进表的提示：

    - 文件过大：`SessionLibrary.tsx` 691 行（阈值 400/800 之间，本 task 净增 45，未达 800 important 线）；`SessionLibrary.test.tsx` 1723 行、`usageboard-web.test.ts` 1192 行（测试阈值 600/1200，前者已超 600 且本 task 净增 188 行，后者 1192 接近 1200 且本 task 净增 18 行）。按降级规则不进 finding 表，建议后续 task 拆分组件筛栏与测试分组。
    - 复杂度：`SessionLibrary` 组件为单一函数组件，手算近似 CC 略高（多 state + 3 effect + 若干条件展开），本 task 仅在既有分支模式上追加同构条件展开，未新增嵌套层级；无可观测缺陷，不进表。
    - 范围外观察：e2e 注释中「grid ch 1900→1856」「sh≈1860」为实测快照数值，随样式演进会漂移；该 spec 已有运行时断言（`h.sh > h.ch` 与 offsets 序列）兜底，注释漂移不构成缺陷。

- 总体判断：AC-001～AC-006 全部落地且有真实断言，单测 108 通过、e2e 3 用例实测通过、tsc/eslint 干净，无 critical/important/minor finding。

- 系统性 follow-up：无。

verdict: PASS
