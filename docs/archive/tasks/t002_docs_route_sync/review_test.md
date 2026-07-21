# Task review T002

- task：`T002_docs_route_sync`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 03:25 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T002_test_f001 — 验收 grep pattern 过窄（仅字面量）

- 严重度：low
- 位置：`docs/tasks/T002_docs_route_sync/spec.md:28`（验收标准 #1）
- 问题：`grep -rn "route=popup\|route=settings" docs/` 只匹配字面 `route=popup` / `route=settings`。不会捕获其他形式（反引号包裹的 `` `popup` ``、表格单元里的裸 `popup`、`route = "popup"` 带空格/引号变体）。当前 docs 实测零遗漏（人工复核 `docs/blueprint docs/specs docs/guides` 下 `popup/settings` 仅剩 IPC 通道组名与 `popup:reportContentHeight` 等**非 route** 语义，spec 非范围已明示），所以**本次未漏报**，但 pattern 本身对未来类似 task 不够稳健。
- 建议：本次无需修改（验收已通过）。若未来有类似 task，pattern 可放宽为 `grep -rnE "(route[=\"' ]+popup|route[=\"' ]+settings)" docs/`，或直接以 `WINDOW_CONFIGS`（`src/main/window/window-manager.ts:30`）为真相源做 key 集合 diff。

### T002_test_f002 — window-management.md URL 行的 tray `v=<version>` 分句描述不可达行为

- 严重度：low
- 位置：`docs/specs/window-management.md:14`（新 URL 行括注）
- 问题：新文档行写「tray 菜单额外从 hash 解析 `v=<version>` 上报版本」。对照代码：
    - `src/main/window/window-manager.ts:91-97` 的 `getRendererUrl(route)` 只产出 `?ou_theme=<dark|light>#<route>`，**不会**向 URL 注入 `v=`。
    - `src/main/index.ts:668` 调用 `getRendererUrl("tray")`，tray 实际 URL = `?ou_theme=...#tray`，无 `v=`。
    - `src/renderer/views/TrayMenu.tsx:21` 的正则 `/[?&]v=([^&]+)/` 在当前 hash 下永远 null，`meta` 退化为空串（TrayMenu.tsx:120 的 `app_version ? \`v${app_version}\` : ""` 走 else 分支）。
    - 描述的是 TrayMenu 的防御性解析能力，但**当前 main 永不喂入** `v=`，属运行时不可达行为，对读者形成误导（仿佛 tray URL 携带 `v=`）。
- 建议：删除该括注分句，或改写为「TrayMenu 渲染层保留对 hash 中 `v=` 的解析（历史兼容），当前 main 未注入」。**非阻塞**，不影响 5 条验收标准。

### T002_test_f003 — spec 前提「代码层 route 真相完全统一」与 main-panel-controller 不符（T001 遗留，非 T002 范围）

- 严重度：low（对 T002 非阻塞；记录为 T001 候工项）
- 位置：`src/main/core/main-panel/main-panel-controller.ts:121`（`get_renderer_url("popup")`）
- 问题：T002 spec 背景说「T001 修复 preload 层 route 同步后，代码层 route 真相完全统一为 `usage`/`setting`/`tray`/`agent`」。实测 main-panel-controller.ts:121 仍传字面 `"popup"` 给 `getRendererUrl`，运行时 URL 哈希为 `#popup`，与 docs 的 `route=usage` 表面冲突。
    - 缓解因素：`src/renderer/hooks/use-route.ts:6-9` 的 `VALID_ROUTES = {"usage","setting","agent","tray"}` + `normalize_hash` 会把 `"popup"` 规范化回 `"usage"`，所以**用户可见行为无差异**，App.tsx 的 `default` 分支也兜底到 `PopupView`。
    - 这是 **T001 范畴**的待清理字面量，T002 spec 已明示「不改代码（属 T001）」，故 T002 文档同步本身**无误**（docs 对齐的是 `WINDOW_CONFIGS` 这个真相源，而非 main-panel-controller 的硬编码字符串）。
- 建议：将 `main-panel-controller.ts:121` 的 `"popup"` 改为 `"usage"` 列入 T001 收尾或新开 follow-up task。本条仅作为测试评审的 drift 风险记录，不影响 T002 通过。

### T002_test_f004 — 是否补 docs-code route 一致性回归测试（价值评估）

- 严重度：suggestion（非阻塞，评估结论：**不补**）
- 位置：`tests/unit/renderer/first_paint_theme.test.ts`（既有源码级断言）
- 问题：评审重点要求评估「补 `first_paint_theme.test.ts` 风格的源码-文档一致性检查」的价值。
- 评估：
    - 现有 `first_paint_theme.test.ts:16` 已断言 `?ou_theme=${theme}#${route}` URL 格式与 WINDOW_CONFIGS `setting` 配置项；`tests/unit/preload/route_api.test.ts` 覆盖 `select_grok_api(route, ...)`。**源码层真相已被测**。
    - 补「WINDOW_CONFIGS keys ⊇ docs/specs/window-management.md 表格 keys」断言收益低：4 行小表，每次合法编辑文档都要同步改测试，ROI 不高；且 markdown 表格解析对修辞（列宽、空格、换行）敏感，易误报。
    - docs-spec 一致性更适合通过 lint/grep CI（如本 task 验收命令）守门，而非单测。
- 建议：**不补单测**。把 T002 的两条 grep 命令固化为 CI step（若尚未纳入）即可，成本/收益更优。

## 结论

**通过**（5 条验收标准全部满足，finding 全部 low/suggestion 且非阻塞）。

逐条核验：

- AC#1 `grep -rn "route=popup\|route=settings" docs/` → 仅 `docs/tasks/T002_docs_route_sync/spec.md` 自身描述命中（符合排除约定），其余零匹配 ✓
- AC#2 `grep -rn "popup/settings/tray" docs/blueprint docs/specs docs/guides` → exit 1，零匹配 ✓
- AC#3 `docs/specs/ui-views.md:72` 含 `### TokenStatsView（token 统计，route=agent）`；所列 6 个组件（MetricDonut / BarChart / Heatmap / SessionTable / Segmented / RangePicker）与 `src/renderer/views/TokenStatsView.tsx:4-9` import 一一对应；数据管线 `filtered / aggregate / chart-data (agentSegments/compositionSegments/modelSegments/projectSegments)` 与 `src/renderer/lib/token-stats/{filter,aggregate,chart-data}.ts` 命中一致；过滤维度 `agent/platform/range/metric/xAxis` 与 TokenStatsView.tsx:21 的 `AgentFilter / Granularity / Metric / XAxis` 及 `PLATFORM_OPTIONS/RANGE_OPTIONS` 一致 ✓
- AC#4 `docs/specs/window-management.md:12` 含 `agent` 行；四行表与 `src/main/window/window-manager.ts:30-68` `WINDOW_CONFIGS`（usage/setting/tray_menu/agent 的 route、尺寸、frame、showWhenReady、roundedCorners、titleBarStyle）逐一对照一致 ✓
- AC#5 `pnpm test` 不受影响：`grep -rln "docs/specs\|docs/blueprint" tests/` 零命中，无任何测试读取 docs；docs-only 改动 ✓

其他正向核验：

- URL 格式 `?ou_theme=<dark|light>#<route>` 与 `window-manager.ts:95,97` 一致（query 在前 hash 在后）✓
- `architecture.md` L103 route 权值 `usage/setting/tray/agent` 与 WINDOW_CONFIGS keys 集合一致 ✓
- `ipc.md` L27 grok route 表述 `setting` / `usage` / `tray` 与 `src/preload/route_api.ts` + `tests/unit/preload/route_api.test.ts` 路由分权一致 ✓

T002 是教科书级纯文档同步 task，docs 与 `WINDOW_CONFIGS` 真相源完全对齐。f001–f004 均为 low/suggestion，不构成本 task 阻塞；其中 f002（tray `v=` 描述）和 f003（main-panel-controller `"popup"` 字面量）建议作为后续小 task 收口。
