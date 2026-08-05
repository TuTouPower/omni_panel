# Task review t220（reviewer_focus: 通用）

- task：`t220_pending_tech_debt_cleanup`
- spec：`docs/tasks/t220_pending_tech_debt_cleanup/spec.md`
- diff_anchor：`34addabf4e3e27d16cf8598691a84c0ecc2e8684`
- target：`git diff 34addabf4e3e27d16cf8598691a84c0ecc2e8684`
- round：1
- reviewed_at：2026-08-05 23:41 UTC+8

## Findings

### t220_gen_f001 - auto_seed e2e 断言收紧至真实计数（`>=16`）未被实际运行验证（AC2「测试仍过」闭环缺口）

- 严重度：minor
- 锚点：AC2「`auto_seed.spec.ts` 断言基于真实连接器计数……测试仍过」
- 位置：`tests/e2e/electron/auto_seed.spec.ts:13-19`（`bundled_plugin_count`）、`:35`、`:108`
- 问题：该文件是 Playwright electron e2e（`tests/e2e/electron`），不在 `pnpm test`（vitest，见 `vitest.config.mts` include 仅 `tests/unit`/`tests/smoke`/`tests/integration`）覆盖内；task.md 记录的验证「整批 pnpm test 连跑 3 次全绿」不触达它。静态核对：`bundled_plugin_count()` 扫描的 `connectors/*/manifest.json` 与主进程 `discover_connector_definitions` 的 dev 路径（`src/main/core/paths.ts:69` → `PROJECT_ROOT/connectors`）同目录，16 个目录全部有合法 manifest 且 provider 匹配 `connectorProviderSchema`（`^[a-z][a-z0-9_]*$`），两处断言（`.card` 数 `>=16`、`.acc-row` 数 `>=16`）按渲染逻辑（`visible_providers_from_groups` 令全部 16 个 provider 可见、ProviderCard 无条件渲染 `.card`；16 个配置插件各渲染 ≥1 个 `.acc-row`）应当通过——但 AC2 的「测试仍过」未由真实 e2e 运行闭环。
- 建议：补跑 `pnpm test:e2e:electron`（需先 `pnpm build`）并记录结果；或在 task.md 明确该 e2e 不在本 task 验证范围并说明理由。

### t220_gen_f002 - 镜像树高度测量侧效应：UpcomingResetCard / token 面板无回调分支使 offscreen 镜像以展开态测量

- 严重度：minor
- 锚点：范围 p041「镜像树不再渲染死按钮」（AC1 涉及镜像行为，但镜像高度非 AC 项，属侧效应）
- 位置：`src/renderer/components/UpcomingResetCard.tsx:75-76`；`src/renderer/views/PopupView.tsx:771-772`；配合 `src/renderer/views/popup-view/UpcomingResetCardSlot.tsx:41-42`（`onToggleExpand={is_live ? onToggleExpand : undefined}`）
- 问题：正常镜像（`is_live=false`）下 UpcomingResetCard 因 `onToggleExpand=undefined` 走新分支 `collapsed=false` → 镜像把「即将重置」卡渲染为展开态，内容高度计入 `content_height`（`use_popup_height_report` → 弹窗窗口高度）。改动前镜像传 `expanded=false` → `collapsed={!expanded}=true` → 测量折叠态。开启 upcoming 阈值（默认关）且卡片处于默认折叠态时，弹窗窗口会比实际内容高（底部留白）；token 面板 `collapsed={is_live ? token_panel_collapsed : false}` 同模式（默认 `VITE_ENABLE_TOKEN_PANEL` 关，无默认影响）。spec 风险节只记录「样式依赖箭头占位」，未覆盖高度测量。倾向一致性修正（ProviderCard 镜像本就按展开态测量，`can_collapse=false`），非阻断，但建议实现侧顺带确认弹窗高度表现。
- 建议：若确认留白不理想，镜像场景可显式传 no-op `onToggleExpand`（`is_live ? onToggleExpand : () => undefined`）保留折叠测量语义；当前不修亦可，记录即可。

## 结论

- 前轮 finding 复核：Round 1，无前轮
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    1. `bundled_plugin_count()` 只查 `manifest.json` 文件存在，`discover_connector_definitions` 还校验 manifest schema 与 provider 正则；当前 16 个均合法故计数一致，未来若有非法 manifest 会分叉（测试多计数导致假失败）。健壮性提示，非当前缺陷。
    2. `ProviderAccountRow` 在镜像（`onToggleAccount=()=>undefined` 定义为非 undefined）下 `can_collapse=true`，镜像仍渲染 chevron；此为改动前既有行为，不属 p041「无回调」场景，未纳入 finding。
- 总体判断：三条 pending 均按 spec 落地——p041 三组件 `collapsible={handler!==undefined}` 仿 ProviderCard 先例、无回调不渲染 chevron 且内容常显（含新增 unit 断言）；p042 删过时常量改运行时真实计数（16 与 discover 对齐）；p047 docstring 与 `query_trend_series`/`build_trend_series` 实际行为一致（≤120 桶、不强制 null 填充）、负向等待改 `waitFor`+timeout 300 与 spec 上下文一致。AC1/AC3/AC4 直接满足，AC2 实现满足但「测试仍过」未 e2e 实跑，AC5 unit 侧绿。无 blocking finding。
- 系统性 follow-up：无

verdict: PASS
