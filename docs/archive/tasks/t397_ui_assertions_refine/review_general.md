# Task review t397（reviewer_focus: 通用）

- task：`t397_ui_assertions_refine`
- spec：`docs/tasks/t397_ui_assertions_refine/spec.md`
- diff_anchor：`325ccabdaa135501eaa7c1e80c02dbb5410fa531`
- target：`git diff 325ccabdaa135501eaa7c1e80c02dbb5410fa531`
- round：1
- reviewed_at：2026-08-15 10:30 UTC+8

## Findings

### t397_gen_f001 - handoff.json AC-001 证据第二条误标 AC-002

- 严重度：minor
- 锚点：AC-001 evidence 文案笔误
- 位置：`docs/tasks/t397_ui_assertions_refine/handoff.json:14`（`ac_evidence["AC-001"]` 第二项）
- 问题：`"直接渲染 LabelMapDialog（非 e2e 兜底），组件层覆盖 AC-002"`——该条描述的是 AC-001 自己的组件层断言，却误写「覆盖 AC-002」。AC-002 的即时更新证据在 settings_view_watched.test.tsx，二者不混淆；属纯文案笔误。
- 建议：改为「组件层覆盖 AC-001」。

### t397_gen_f002 - app.test.tsx「未知 hash 归一化到 usage」用例名与实际覆盖不符

- 严重度：minor
- 锚点：AC-003 行为描述，非规格违例
- 位置：`tests/unit/renderer/app.test.tsx:65`（`it("未知 hash 归一化到 usage → PopupView", ...)`）
- 问题：用例 mock 掉 `use_route`（`vi.mock(".../use-route")` 直接返回 `"bogus"`），归一化逻辑实际在 `src/renderer/hooks/use-route.ts` 的 `normalize_hash`（未知 hash → `"usage"`），该 hook 无独立单测。本用例只覆盖 `App.tsx` 的 `default` 分支渲染 PopupView，并未覆盖归一化；用例名暗示了未被测试的行为。AC-003 仅要求 App 路由分发分支有直接单测，此分支覆盖真实成立，不影响验收。
- 建议：用例名改为「未知 route 命中 default 分支 → PopupView」；如需归一化覆盖，给 `use_route`/`normalize_hash` 补独立单测（超本 task 范围，可另行登记）。

## 结论

- 本轮新发现：2 条（均 minor）
- 未进表的提示：无
- 总体判断：diff 全量为测试补强 + task 文档，无任何 `src/` 生产代码改动，规格范围未偏航；五条 AC 均有真实可观察断言，逐一核验组件源码后确认断言与实现锁定关系成立（详见下）。两条 minor 不影响验收。
- 系统性 follow-up：无

### AC 逐条核验摘要

- **AC-001**（label_map_dialog.test.tsx）——直接渲染 `LabelMapDialog`，`watched_metrics={"cpa-1|label|Account 1":["five_hour"]}`；源码 `LabelMapDialog.tsx:285` 为 `data-slash={watched ? undefined : "true"}`，`accountKey` 网关格式 `{sourceInstanceId}|label|{accountLabel}` 与断言键一致。断言 `bells[0] aria-pressed=true 无 data-slash`、`bells[1] aria-pressed=false 含 data-slash='true'`、全文档仅 1 个 `[data-slash]`。改组件斜杠显隐（恒显/恒隐/反置）必挂。真实锁定。
- **AC-002**（settings_view_watched.test.tsx）——点击铃铛 → `save.mockImplementationOnce` 更新 `current_config` → `rerender(<SettingsView/>)` 模拟 config 驱动重渲染；对话框全程不关闭。`SettingsView.tsx:653` 的 `watchedMetrics` 直接来自 `config`，LabelMapDialog 的 `watched` 由 props 即时计算；若组件改为打开时快照 watched，重渲染不重挂、状态保留则断言必挂。真实验证「无需重开对话框」。
- **AC-003**——route_api：`select_kimi_api` 源码仅 `route==="setting"` 放行全量，其余 4 路由只留 `login_status`，`Object.keys` 断言与实现一致；App：5 分支 switch 逐一 stub 断言，lazy 命名导出 mock 形态与 `App.tsx` `.then(m=>({default:m.X}))` 吻合；CpaLabelMapDialog：`save_target=provider` 写 `providerLabelMaps[vendor_id]`、`=account` 写 `accountLabelMaps[target_instance_id]`，两分支 payload 精确断言且 `on_close` 触发，非空壳；AccountDialog：`mode=add && !instanceId` → AddAccountDialog、edit 渲染 Dialog+SettingsForm、Escape 触发 `onClose`，子组件 stub 合理（测分支非子组件）。
- **AC-004**（SessionRail.test.tsx）——`cls.toContain("_70%")` 与 `("_8%")`，源码 `SessionRail.tsx:32` className 含 `var(--color-surface-window)_70%,var(--color-surface)_8%`，改 70→80 或 8→10 必挂。
- **AC-005**（server.test.ts）——正则 `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/` + `date === new Date(now).toISOString().slice(0,16)+"Z"`；`format_utc_iso`（`src/shared/lib/trend.ts:52`）输出 `YYYY-MM-DDTHH:mmZ` 且 `observed_at=now` 与 `expected_iso` 同源，确定性无 flake。若丢时分/截日期/改时刻必挂。

### 验证记录

- `git diff --name-only` 确认仅 8 个测试文件 + task.md/handoff.json，无 `src/` 改动。
- 复跑 8 个受影响测试文件：8 files / 152 tests 全绿（route_api 21、app 5、cpa_label_map 2、account_dialog 3、label_map 20、settings_view_watched 6、SessionRail 7、server 88），与 handoff `tests` 计数一致。
- 危险模式排查：无 `.skip`、无删除 expect、无 mock 被测单元、无「断言改成新实现输出」；handoff `ac_evidence` 键精确为 AC-001..005。

verdict: PASS

reviewed_scope: 65b70b5a69423719
