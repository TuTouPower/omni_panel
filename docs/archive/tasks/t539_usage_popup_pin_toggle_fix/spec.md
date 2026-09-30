# Task spec

## 背景

macOS 用量弹窗（`mainPanelMode=popup`）两处行为与“失焦隐藏 + 托盘点击即现”预期不符：`pinToTop=true` 后点外部不收；弹窗开着经 `Command+Tab` 切走后点托盘无反应、需第二击。根因见 p271：pin 与自动收起绑死 + `open_or_toggle` 用全局 `isVisible()` 做切换（Space/focus 盲区，p253 复发）。

## 契约区

### 范围

- 解耦 `pinToTop` 与自动收起：popup 点外部收起判定只看模式/可见性/焦点归属，不看 pin；pin 只保留窗口层级语义（创建/展示/隐藏/配置变更的 `setAlwaysOnTop` 基线与提权恢复不动）。
- 修正 `open_or_toggle` 跨 Space/失焦反转：已可见但失焦或不在当前 Space 时托盘左键走显示路径（重锚托盘 + 展示期提权 + 跟到当前 Space），不走 `hide()`；同 Space 聚焦态的显隐交替不变。
- 同构修正托盘右键菜单切换：可见但失焦/在它 Space 时再次右键显示到当前 Space，不误收。
- 更新锁死旧行为的三处单测（`should_hide` pin 豁免、blur 钉住不收、t536 钉住豁免）为新语义，并补跨 Space/失焦回归用例。

### 非范围

- floating 模式跨 Space toggle 是否改不动（p271 吃不准单列）。
- Windows/Linux 独立行为不改（共享控制器逻辑改动带来的同语义收敛除外）。
- 不新增配置键；不改展示期提权/隐藏恢复的层级数值与 `visibleOnFullScreen` 声明。
- 不改 `activate`/agent/history/dev 的 `open_or_focus` 路径。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`pinToTop` 开启时 popup 点外部自动收起——弹窗可见、焦点在他窗，hide 被调用且窗口不销毁；与 pin 关闭行为一致。
- [ ] AC-002：弹窗已可见但失焦或在它 Space 时，托盘左键单击一次即在当前 Space 显示（位置重锚托盘下方、盖住全屏），不发生先 hide 需第二击；同 Space 聚焦态单击仍 hide，交替正常。
- [ ] AC-003：托盘右键菜单已可见但失焦或在它 Space 时，再次右键一次即在当前 Space 显示，不误收；同 Space 可见态再次右键仍收起。
- [ ] [deploy] AC-004：macOS 真机 `Command+Tab` 切应用 + 双全屏 Space 下，AC-002/AC-003 各一次点击即达预期，无需来回切换找回。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：可自动测试（controller 单测：pin=true/blur 与 `should_hide` 外部聚焦组合）。
- AC-002：可自动测试（controller 单测：visible-but-unfocused/stale-Space 走显示路径；同 Space 聚焦走 hide）。
- AC-003：可自动测试（tray 菜单切换单测或控制器同构单测；接线在 `index.ts` 则以行为单测覆盖）。
- [deploy] AC-004：不可自动测试——`blur` 在 `showInactive` NSPanel + 应用失活下的可靠性与全屏 Space 层级需真机；替代为人工按 p271 复现步骤走一遍左键/右键各一次。

## 上下文区

- 来源：p271（2026-09-30 核实：`.scratch/repro_popup_pin_toggle_20260930.ts` 3 FAIL 复现；`should_hide`+blur+`handle_browser_window_focus` 三处 pin 豁免与 `open_or_toggle:398-410` 全局 `isVisible()` 切换为双根因；t503 只修提权未修切换，p253 复发）

### 有意不测

- floating 跨 Space toggle：产品语义未定，不补，避免锁死争议行为。
- Windows/Linux 真窗 taskbar/Space 差异：CI 无真窗，共享逻辑由 darwin 单测等价覆盖。

### 测试策略

- 单测（`tests/unit/main/main_panel_controller.test.ts` 续写）：pin=true 外部聚焦收起、blur 钉住收起、`handle_browser_window_focus` pin=true 收起三处改断言；新增 visible-but-unfocused 再次 toggle 走显示（含重锚 + 提权 + `setVisibleOnAllWorkspaces` 重申）与同 Space 交替对照；tray 菜单切换同构用例。
- `pnpm test` 全量无回归；`typecheck`/`lint` 过；`python3 .repo_template/scripts/md_format.py --check` 过。
- 真机 `[deploy]` 按 AC-004 手工走查并记录 Space/全屏组合。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：解耦后钉住用户点外部即收，若其依赖常驻会被打扰（用户本次已明确要收起）；toggle 显示条件收紧后同 Space 快速双击节奏变化。
- 回退：revert 单个执行 commit。

### 依赖与约束

- 无前置依赖；约束：改动限主面板控制器、托盘接线及对应单测；`WindowLike` 若需扩展只加只读查询，不加新行为。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：焦点与主面板收起一句去 `pinToTop 豁免`，改 pin 只管层级。
- `docs/specs/window-management.md`：popup 失焦隐藏与置顶级别两段同改；macOS 空间策略补 toggle 跨 Space 跟随一句。
