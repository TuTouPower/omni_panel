# Task review t519（reviewer_focus: 综合）

- task：`t519_renderer_components_and_perf`
- spec：`docs/tasks/t519_renderer_components_and_perf/spec.md`
- diff_anchor：`c127319fb420179c7585bea71de14df7b3878270`
- target：`git -C '/Users/karson/kar/code/omni_panel_t519' diff c127319fb420179c7585bea71de14df7b3878270`
- round：1
- reviewed_at：2026-09-25 19:25 UTC+8

reviewed_scope: 6de68e2db2f86491

## Findings

Round 1 零 finding。

## 审计与总结

- 范围与代码审查：
    - `src/renderer/components/AddAccountDialog.tsx` & `src/renderer/components/add_account/form_registry.tsx`：
        - `local_cli` 未就绪或扫描无效时禁用导入按钮并拦截保存（A62 / AC-001）；
        - 表单分支由 7 个 if 级联重构成 `FORM_REGISTRY` 注册表驱动，表单渲染与保存统一抽象（A100 / AC-002）；
        - `generate_instance_id` 改用 `crypto.randomUUID()`，杜绝 `Math.random`（A75）；
    - `src/renderer/components/Icon.tsx`：
        - MiMo 图标改走 `mimo.svg` 统一资产文件，删除数百字符冗长内联 SVG（A68 / AC-003）；
        - 图标三表（`VENDOR_THEME_LOGOS`、`VENDOR_LOGOS`、`VENDOR_MARKS`）重构合并为 `VENDOR_REGISTRY` 单一来源（A110 / AC-003）；
        - 告警输出统一走 `createLogger("renderer:icon")`，消除未捕获的裸 `console.warn`（A69 / AC-003）；
    - `src/renderer/views/DevPanelView.tsx`：
        - 状态轮询自适应：`running` 状态 1000ms 刷新，非运行状态降频为 10000ms（10s）；
        - 监听 `visibilitychange` 事件在窗口隐藏时暂停轮询，切回前台立即恢复（A71 / AC-004）；
    - `src/renderer/lib/provider_registry.ts` & `src/renderer/lib/provider-usage.ts`：
        - 建立 `provider_registry.ts` 作为前端厂商元数据与顺序的单一真相源，`common-services.ts` 与 `provider-usage.ts` 均引用该源（A101）；
        - 远端文本字段通过 `sanitize_remote_string` 实施 64 字符上限与控制字符过滤，防御 UI 破版（A76 / AC-005）；
        - 抽取 `is_weekly_like` 统一收口 Grok weekly 等配额周期判定逻辑（A102）；
        - `AccountKey` 引入强类型 `AccountKeyObject` 并保持对字符串 key 兼容（A106）；
        - `compare_providers` 采用 `PROVIDER_ORDER_MAP` 实现 O(1) 排序；`resolve_convergent_time` 与 `resolve_convergent_epoch` 采用单遍 min/max 遍历，消除多次 filter/reduce/find 低效遍历（A120 / AC-005）；
        - `use_popup_derived.ts` 使用 Set 查找消除 O(n²) 排序过滤（A121）；
    - `src/renderer/components/ProviderOverview.tsx` & `src/renderer/views/PopupView.tsx`：
        - `ProviderOverview` 实施 `React.memo` 并在内部 `useMemo` 缓存派生 Map 与 Set（A117 / AC-006）；
        - `PopupView` 下沉 `useNowTick` 相对时间订阅至独立的 `RelativeTimeDisplay` 组件，30s 时间轮巡不再触发 `PopupView` 整树卡片重绘（A125 / AC-006）；`lastUpdated` 聚合由 `useMemo` 缓存。
    - `src/main/core/connector/runtime.ts` & `connectors/grok_bot/connector.ts`：
        - 连接器沙盒环境注入受限的 `crypto.randomUUID()`，`grok_bot` 消除 `Math.random` 伪随机（A75）。
- 门禁与测试：
    - 全量 332 个测试套件通过（4073 passed, 8 skipped）；
    - `pnpm check`（tsc, eslint, prettier, knip, depcruise）全部无报警。

### AC 复验方式

- AC-001：`verified`，查证 `AddAccountDialog.tsx:152-154, 340-350`，测试 `add_account_dialog.test.tsx:968-990` 验证未就绪禁用导入。
- AC-002：`verified`，查证 `form_registry.tsx:39-173` 与 `AddAccountDialog.tsx:190-205, 360`，测试 `add_account_dialog.test.tsx:40-200` 验证表单注册表驱动。
- AC-003：`verified`，查证 `Icon.tsx:230-265, 340-360`，测试 `icon.test.tsx:175-185` 验证 MiMo 图标改走资产文件与 logger 告警。
- AC-004：`verified`，查证 `DevPanelView.tsx:92-130`，测试 `dev_panel_view.test.tsx:65-102` 验证隐藏暂停轮询与前台恢复。
- AC-005：`verified`，查证 `provider_registry.ts` 与 `provider-usage.ts` 职责解耦与单遍遍历，测试 `provider-usage.test.ts:1550-1623` 验证算法等价性与字符串清洗。
- AC-006：`verified`，查证 `ProviderOverview.tsx:55-85` 与 `PopupView.tsx:50, 700`，测试 `provider_overview.test.tsx:80-105` 验证 memo 避免重复重绘。

coverage = 6 / 6 (100%)

verdict: PASS
