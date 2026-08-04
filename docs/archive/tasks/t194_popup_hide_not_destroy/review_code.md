# Task review t194（reviewer_focus: 代码）

- task：`t194_popup_hide_not_destroy`
- spec：`docs/tasks/t194_popup_hide_not_destroy/spec.md`
- diff_anchor：`bb31938d443e98df45c996839fea004249494109`
- target：`git diff bb31938d443e98df45c996839fea004249494109`
- round：1
- reviewed_at：2026-08-03 21:22 UTC+8

## Findings

### t194_code_f001 - popup 隐藏后重开不再重定位到托盘（行为回退）

- 严重度：minor
- 锚点：行为缺陷 + 失败场景（无对应 AC 明文，属 hide 语义变更的隐式副作用；spec 非范围「不改窗口……定位」指不改定位代码，但定位行为被本 task 隐含改变）
- 位置：`src/main/core/main-panel/main-panel-controller.ts:186-191`（open_or_toggle popup 分支改 hide）；`position_popup` 只在 `create_panel_window`（`:157`）创建期调用，show 路径不重定位
- 问题：t194 前 popup 每次打开都走 `close()` → 重开走 `create_panel_window` → `position_popup` 重新锚定到托盘下方。t194 后 hide 保留窗口，重开走 `ensure_window`（`:173-177`）返回同一 hidden 窗口 → 仅 `target.show()`，不重定位。失败场景：popup 打开后被托盘切换隐藏；期间托盘移动或显示拓扑变化（笔记本拔外接屏、改 DPI）；重开 → popup 以隐藏时的旧 bounds 出现，可能落在已移除显示器坐标或偏离当前托盘位置。t194 前该场景重开会重锚定到当前托盘，可见行为回退。
- 建议：popup 模式在 `show()` 前调用 `position_popup(target)`（或监听窗口 `show` 事件），保留「打开锚定托盘」的既有 UX，同时维持 hide 不销毁语义。若判定「popup 允许用户拖走后保留位置」是期望行为，需在 spec 记录该决策，避免实现与文档漂移。

### t194_code_f002 - open_or_toggle 两分支在 hide 语义后完全重复

- 严重度：minor
- 锚点：代码质量（DRY）
- 位置：`src/main/core/main-panel/main-panel-controller.ts:182-191`
- 问题：`MainPanelShellMode` 仅 `"popup" | "floating"`，两分支体均为 `target.hide(); return;`，verbatim 重复。本 task 把 popup 分支从 `close()` 改为 `hide()` 后两分支才变得相同（此前 floating=hide、popup=close，分叉有意义）。
- 建议：合并为 `if (target.isVisible()) { target.hide(); return; }`，t194 注释保留在合并后的分支上方。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：2 条（均 minor，不阻断）
- 未进表的提示：
    - 文件过大：无。本 task 触及/新建文件行数均远低于阈值（main-panel-controller.ts 245 行、use-now-tick.ts 38 行、测试文件 90–349 行；spike code 103 行），不构成提示。
    - 复杂度：无。open_or_toggle 分支数未增加，useNowTick 新增分支 ≤ 4，未达阈值。
    - 范围外观察：`popup_collapse_persistence.spec.ts` 与 `main_panel_window_modes.spec.ts` 的修复实际在修**基线已坏**的测试（旧 `#popup` filter 对 `#usage` 路由从不匹配；popup_collapse_persistence 缺 config.json 时 connectors 目录有内容会触发 config-store P0「已有用户数据但 config 缺失」启动拒绝）。这两处不在 p038 记录的 11 例失败清单内，建议核对 p038 清单完整性（基线失败数可能被低估）。修复本身正确且必要（测试现在才有意义），但属 p038 清理范畴而非 t194 需求，改动小，不阻断。
- 总体判断：AC1–AC4 实现与测试到位（open_or_toggle/hide 隐藏不销毁、ensure_window 复用窗口、useNowTick 可见性降级、apply_config_change 保留 close 重建语义、AC1/AC3 单元+e2e 覆盖、AC4 模式切换用例存在），AC5 属 `[deploy]` 待人工签收；2 条 minor 不阻断。
- 系统性 follow-up：无（p038 已登记 `docs/pending.md`）

verdict: PASS
