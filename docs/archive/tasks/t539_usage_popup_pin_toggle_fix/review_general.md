# Task review t539（reviewer_focus: 通用）

- task：`t539_usage_popup_pin_toggle_fix`
- spec：`docs/tasks/t539_usage_popup_pin_toggle_fix/spec.md`
- diff_anchor：`c4599ec715df8b4f78906a90650ab7a99215c544`
- target：`git diff c4599ec715df8b4f78906a90650ab7a99215c544`
- round：Round 1
- reviewed_at：2026-09-30 19:28 UTC+8

## Findings

零 finding。

复核记录（按评审要点逐项，diff 实际内容）：

- 规格合规：AC-001（pin 解耦三处：`should_hide` 纯函数、`blur` 处理器、`handle_browser_window_focus` 参数删除 + index 接线同步）由新语义单测覆盖；AC-002（`open_or_toggle` `isVisible() && isFocused()` 反转 + show 路径复用重锚/提权/跟 Space）由失焦走显示、聚焦走 hide、隐藏走显示三用例覆盖；AC-003（`should_show_tray_menu_on_right_click` 纯函数三条件 + index 右键接线 + 源码哨兵用例）覆盖。更新的 6 处旧断言（3 处 spec 点名 + 3 处 toggle 连带）均有 t539 理由注释，符合「整体改写并写明理由」，非就地改预期造假绿。`floating` 跨 Space、Windows/Linux 独立行为、新增配置键均未动，符合非范围。`WindowLike` 只加 `isFocused` 只读查询，符合约束。
- 实现正确性：`open_or_toggle` 失焦分支复用既有 `show_panel`（重锚 + `elevate_for_show` + showInactive/focus），无新分支逻辑；`handle_browser_window_focus` 删除 pin 参数后 touched 窗口的 hide 语义不变（只 hide 不销毁）；dock-badge 等其余 `WindowLike` 构造点已补 `isFocused`（typecheck 全仓通过）。空值：`ensure_window` 非空目标上调 `isFocused`，destroyed 窗口在 `handle` 入口先判存活；`open_or_toggle` 的 target 来自 `ensure_window` 恒存活。无问题。
- 安全审视：无外部输入、无拼接执行、无 secret/日志变动。无问题。
- 契约·类型·Breaking：`should_hide_popup_on_outside_focus` 与 `BrowserWindowFocusArgs` 删除 `pin_to_top` 为内部调用契约（两处调用方同步改完，typecheck 过）；`WindowLike` 加只读方法对生产 `BrowserWindow` 恒成立；无配置键/schema 变更。无 `any`/强转。无问题。
- 性能与资源：`isFocused` 同步查询单次调用，无循环/IO。无问题。
- 架构与可维护性：右键判定抽为控制器纯函数供 index 复用，与 `should_hide` 同构，错层无；注释同步（p258/t503/t539 标记准确）。无问题。
- 健壮性与可观测：blur 处理器删 pin 短路后仍保留存活/可见守卫；toggle 反转不吞错。无问题。
- 测试可信与覆盖：红绿证据完整（新写 5 用例先跑出 3 失败：blur 钉住、toggle 失焦、helper 缺失；实现后 56+10 全绿）；断言触达真实控制器行为（fake 窗口状态机 + spy 调用序列），无 mock 被测逻辑；`pnpm test` 全仓 341 passed | 1 skipped 文件绿。AC-004 `[deploy]` 真机部分本轮未执行，见下。
- 文档/配置一致性：`architecture.md` 收起句与 `window-management.md` popup/toggle/右键三段与实现一致，md_format 通过。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：可自动验证部分全部实现并通过；AC-004 真机走查待用户执行，不阻塞合入（spec 可测试性声明已列替代验证）。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——reviewer 独立重跑 `main_panel_controller.test.ts`（56 passed，含改写后的 pin 解耦三用例与新增 AC-001 用例），并核对 `should_hide`/blur/handle 三处 pin 删除与 index 接线同步。
- AC-002：`re_verified`——同上复跑覆盖失焦走显示/聚焦走 hide/隐藏走显示三用例；逐行核对 `open_or_toggle` 反转条件与 `show_panel` 复用路径。
- AC-003：`re_verified`——同上复跑覆盖 helper 三条件用例 + 右键接线哨兵用例；核对 index 右键分支与 helper 语义一致。
- AC-004：`trust_prior`——`[deploy]` 真机 `Command+Tab` + 双全屏 Space 走查无法在 CI/单测环境复验，依赖用户按 p271 复现步骤手工执行；单测侧失焦/跨 Space 显示路径已由 AC-002/003 等价覆盖。

coverage = 3 / 4。`trust_prior` 占比 25%（≤30%），无需人工抽查提示；但 AC-004 本身即为用户真机走查项，合入后仍需用户执行一次。

reviewed_scope: d7a9baa8e6884584

verdict: PASS
