# OmniUsage 任务清单

> 已完成的 Phase 1–19 移入 `docs/archive/tasks-history.md`。

---

## Phase 20: Popup 主面板高度随内容自适应

### 背景

OmniUsage 主面板是托盘弹出的 Popup 窗口。当前窗口高度偏固定，无法根据可见内容自动收缩/扩展。
目标是仿照 Omni Pot 翻译窗口的高度链路：renderer 测量内容高度，主进程按折叠状态与屏幕约束计算目标高度，再应用到 Electron `BrowserWindow`。

主面板默认展示所有可见 provider/账号卡片的展开内容；用户折叠卡片后，窗口高度应跟随可见内容缩小；用户展开卡片后，窗口高度应跟随内容增大。

### 核心规则

1. **默认展开**：主面板打开时，provider 卡片/账号卡片默认展开，窗口高度按展开内容计算。
2. **折叠驱动高度**：卡片折叠只改变 DOM 可见内容高度；renderer 不直接设置窗口高度，只上报测量后的内容高度。
3. **最小高度**：最小高度不是固定常量，而是“所有可折叠卡片都处于折叠状态时的主面板高度”。窗口缩到该高度后不允许继续缩小。
4. **最大高度**：最大高度不得超过当前显示器 work area 高度的 `85%`。
5. **超高内容滚动**：真实内容高度超过最大高度时，窗口固定在最大高度，内部滚动区域滚动。
6. **折叠状态重置**：新一轮刷新/切换 provider/数据源结构变化时，应清空旧的手动折叠状态，避免新数据继承旧折叠导致内容被隐藏或窗口异常偏小。
7. **抖动抑制**：高度上报使用 `1px` debounce 阈值，小于等于 `1px` 的高度差不触发主进程 resize。
8. **平台定位差异**：主面板由系统托盘触发，但不同平台行为不同，当前尚未完整实现，必须纳入本轮。
    - macOS：做成菜单栏 popover 风格，点击托盘/菜单栏图标后锚定在图标下方弹出；窗口不可拖动、不可自由移动；高度变化时继续保持托盘锚点。
    - Windows：做成托盘触发的普通浮动窗口；初次打开可贴近托盘图标；窗口可拖动移动；用户移动后，高度自适应不得把窗口重新吸回托盘。
    - Linux：按 Windows 浮动窗口处理；托盘实现和 bounds 可靠性差异较大，初次打开优先贴近 tray bounds，拿不到可靠 tray bounds 时使用鼠标位置或当前 work area 右下角兜底；窗口可移动。

### 数据流

```text
用户打开主面板
    ↓
Popup renderer 渲染默认展开内容
    ↓
ResizeObserver 测量内容容器高度
    ↓
renderer 上报 content_height 和 collapsed_min_height
    ↓
主进程计算目标高度
    ↓
目标高度 = clamp(content_height, collapsed_min_height, work_area.height * 0.85)
    ↓
BrowserWindow.setBounds / setSize 应用锁定尺寸
    ↓
内容超过最大高度时，renderer 内部滚动
```

### 伪代码

```ts
const MAX_HEIGHT_RATIO = 0.85;
const HEIGHT_REPORT_DEBOUNCE_PX = 1;

function report_popup_height() {
    const content_height = measure_visible_content_height();
    const collapsed_min_height = measure_all_cards_collapsed_height();

    if (Math.abs(content_height - last_reported_height) <= HEIGHT_REPORT_DEBOUNCE_PX) {
        return;
    }

    last_reported_height = content_height;
    window.usageboard.popup.report_content_height({
        content_height,
        collapsed_min_height,
    });
}

function compute_target_height(report, display) {
    const max_height = Math.floor(display.workArea.height * MAX_HEIGHT_RATIO);
    const min_height = Math.ceil(report.collapsed_min_height);

    return clamp(Math.ceil(report.content_height), min_height, max_height);
}
```

### 实现步骤

#### 20.1 Renderer 内容高度测量

- [x] 在 Popup 主面板根内容容器上接入 `ResizeObserver`。
- [x] 测量当前可见内容高度，包括标题栏、tabs、provider card、账号列表、底部状态栏。
- [x] 不把设计预览用高度写死到真实 popup。
- [x] 高度变化超过 `1px` 才上报，避免字体渲染/小数像素引发 resize 抖动。

#### 20.2 折叠状态模型

- [x] 为 provider 卡片/账号分组增加显式 `collapsed` 状态。
- [x] 默认状态为展开。
- [x] 用户点击折叠后，只隐藏卡片详情内容，保留卡片标题、摘要、状态、刷新入口。
- [x] 展开/折叠后依赖 `ResizeObserver` 自动触发高度上报，不在点击 handler 中直接改窗口尺寸。

#### 20.3 最小高度测量

- [x] 实现“全卡片折叠高度”测量。
- [x] 最小高度必须包含：标题栏、provider tabs、所有折叠态卡片 header、底部状态栏、必要 padding/border。
- [x] 当当前内容高度低于全折叠高度时，主进程仍使用全折叠高度作为窗口高度。
- [x] 不使用固定 `160px` 作为主面板最小高度；`160px` 只能作为极端兜底，不能覆盖全折叠高度规则。

#### 20.4 主进程高度控制器

- [x] 新增或复用 popup 高度控制器。
- [x] 接收 renderer 上报的 `content_height` 与 `collapsed_min_height`。
- [x] 根据当前 popup 所在 display 的 `workArea.height * 0.85` 计算最大高度。
- [x] 使用 `clamp(content_height, collapsed_min_height, max_height)` 计算目标高度。
- [x] 应用窗口尺寸时保持托盘锚点位置正确，避免高度变化后 popup 漂移。

#### 20.5 平台化窗口定位与移动策略

> 注意：本节会**回退 Phase 19.1.2 的全局自绘拖拽**实现。19.1.2 当前为所有平台 `.titlebar` 设置了 `-webkit-app-region: drag`；本节要求按平台分发：macOS 关闭 drag、Win/Linux 保留。改造时通过 platform 判断条件渲染 className 或 inline style，不要直接删除 19.1.2 的 CSS 规则导致 Win/Linux 回归。

- [x] 新增平台策略函数，例如 `get_popup_window_behavior(platform)`。
- [x] macOS：
    - [x] popup 初始位置锚定系统托盘/菜单栏图标。
    - [x] 高度变化时，以托盘锚点重新计算窗口位置，保持 popover 贴住图标。
    - [x] 禁止 renderer 自绘标题栏拖动区；`.titlebar` 不应设置 `-webkit-app-region: drag`（推翻 Phase 19.1.2 的全局 drag 行为）。
    - [x] 窗口不可由用户自由拖动；如果 Electron frame/traffic light 导致可移动，需要改为无 frame popover 行为。
- [x] Windows：
    - [x] popup 初次打开由托盘图标触发，默认贴近 tray bounds。
    - [x] 保留自绘标题栏拖动区，允许用户移动窗口。
    - [x] 记录用户是否移动过窗口；移动后高度自适应只改高度，不重新锚定到托盘。
    - [x] 关闭后再次从托盘打开，可重新按 tray bounds 定位。
- [x] Linux：
    - [x] 行为与 Windows 一致：托盘触发、浮动窗口、可移动。
    - [x] tray bounds 可用时初始贴近 tray bounds。
    - [x] tray bounds 不可靠或为空时，使用当前鼠标所在 display 的 work area 右下角兜底定位。
    - [x] 高度自适应不破坏用户移动后的位置。
- [x] 平台策略必须与高度控制器集成：
    - macOS resize 时保持托盘锚点。
    - Windows/Linux resize 时保持当前窗口左上角或用户移动后的位置。

#### 20.6 新内容重置折叠

- [x] 当刷新返回新的 provider/account 结构时，清空旧折叠状态。
- [x] 当切换 provider tab 时，默认展开当前 provider 内容。
- [x] 原因：折叠状态是用户对旧内容的临时视图选择，不应隐藏新一轮数据。
- [x] 验收：刷新后新内容默认展开，窗口按新内容高度重新计算。

#### 20.7 滚动与最大高度

- [x] 当内容高度超过 `85% work area` 时，窗口高度停在最大值。
- [x] 超出内容由主面板内部滚动，不继续增大窗口。
- [x] 折叠部分卡片后，如果内容高度低于最大值，窗口应同步缩小。
- [x] 全部折叠后，窗口应缩到全折叠高度，不再继续缩小。

#### 20.8 测试改动清单

- [x] 新增主进程单元测试：`tests/unit/main/popup_height_controller.test.ts`
    - 覆盖 `compute_target_height()`：
        - `content_height` 小于 `collapsed_min_height` 时返回 `collapsed_min_height`。
        - `content_height` 在 min/max 之间时返回 `content_height`。
        - `content_height` 超过 `workArea.height * 0.85` 时返回最大高度。
        - 小数高度向上取整，避免内容被裁切。
        - 最大高度向下取整，避免超过屏幕 `85%` 约束。
    - 覆盖 `report_content_height()` debounce：
        - 与上次已应用高度差值 `<= 1px` 时不调用 resize。
        - 与上次已应用高度差值 `> 1px` 时调用 resize。
        - `content_height` 变化但 clamp 后目标高度不变时不重复调用 resize。
    - 覆盖 `apply_locked_size()`：
        - 应用高度时保持 popup 宽度不变。
        - 应用高度时保持托盘锚点方向正确，不让窗口随高度变化漂移到错误位置。
        - 当 min/max clamp 到同一高度时，后续相同目标高度不重复 `setBounds`。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/views/popup_view_height.test.tsx`
    - 默认渲染时 provider/账号卡片处于展开态。
    - 点击折叠按钮后，详情内容从 DOM 可见区域移除或隐藏，高度上报变小。
    - 点击展开按钮后，详情内容恢复，高度上报变大。
    - 折叠全部卡片后，上报的 `collapsed_min_height` 等于当前全折叠内容高度。
    - 切换 provider tab 后，当前 provider 内容默认展开。
    - 刷新返回新的 provider/account 结构后，旧折叠状态被清空。
    - 高度测量只来自 popup 内容容器，不读取 Node API。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_window_constraints.spec.ts`
    - 覆盖最大高度：构造多 provider/多账号内容，打开托盘主面板，断言窗口高度 `<= 当前屏幕 work area * 0.85`。
    - 覆盖内部滚动：内容超过最大高度时，窗口不继续增高，主面板滚动区域可滚动到底。
    - 覆盖全折叠最小高度：折叠所有可折叠卡片后，窗口高度缩小到全折叠高度附近，并且不会继续缩小。
    - 覆盖底部空白回归：全折叠后 statusbar 贴近窗口底部，无旧的大片空白。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_card_collapse_height.spec.ts`
    - 折叠单张卡片缩小窗口高度：默认展开 → 记录窗口高度 → 折叠一张 provider/账号卡片 → 断言窗口高度下降。
    - 展开单张卡片恢复窗口高度：折叠后展开 → 断言窗口高度恢复到接近折叠前高度。
    - 折叠全部卡片回到最小高度：全部折叠 → 断言窗口高度 `<=` 全展开高度，且约等于全折叠测量高度。
    - 多 provider 场景：两个 provider 都有展开内容 → 只折叠一个 → 断言窗口高度介于“全展开高度”和“全折叠高度”之间。
    - 新数据重置折叠：第一轮折叠 → 触发刷新并返回不同 provider/account 结构 → 断言卡片重新展开，窗口高度大于折叠时高度。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_platform_behavior.spec.ts`
    - macOS：模拟或在 macOS 环境验证点击托盘后窗口锚定菜单栏图标；拖动标题栏不移动窗口；高度变化后仍贴住托盘锚点。
    - Windows：点击托盘后窗口出现；拖动标题栏后窗口位置改变；折叠/展开触发高度变化时保留用户移动后的位置。
    - Linux：点击托盘后窗口出现；tray bounds 可用时贴近托盘；tray bounds 不可用时使用当前 display 右下角兜底；窗口可拖动；高度变化不重置用户位置。
    - 该测试允许按平台条件跳过不适用断言，但每个平台至少要覆盖自身策略。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_height_debounce.spec.ts`
    - 快速连续展开/折叠多张卡片，断言 BrowserWindow 不出现高度循环 resize（监听 `bounds-changed` 事件计数）。
    - 验证小数像素变化（< 1px）不触发 resize。
    - 验证 ResizeObserver 在隐藏窗口期间不上报。

- [x] 新增本机用户端到端测试：`tests/user_e2e/specs/popup_multi_display.spec.ts`
    - 主显示器/副显示器分辨率不同，跨屏拖动 popup 后再次打开，断言最大高度按当前所在 display 的 work area 重算，而非旧 display。
    - 副显示器 work area 高度低于主显示器时，超高内容场景窗口高度按副显示器 85% 约束。
    - 该测试依赖真实多显示器环境；CI 可按环境变量跳过，但本机验收必须执行并记录结果。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`
    - 折叠多张卡片 → 触发数据源新增/删除 provider → 断言新结构默认展开。
    - 折叠 → 触发刷新但 provider 结构未变化 → 断言折叠状态保留（仅结构变化才重置）。

- [x] 更新现有 packaged smoke：`tests/packaged_smoke/smoke.spec.ts`
    - 保留已存在的 packaged app 启动、托盘、provider overview、无 CPA tab、popup 底部空白断言。
    - 增加轻量高度 smoke：打开主面板后，记录窗口高度；折叠一个可折叠卡片后，高度下降；重新展开后，高度上升。
    - packaged smoke 只做关键路径，不覆盖所有边界；完整边界放在 `tests/user_e2e/specs/popup_*`。

- [x] 更新 renderer smoke：`tests/smoke/renderer-smoke.test.tsx`
    - 确认 popup 根容器仍填满 BrowserWindow 视口。
    - 确认内容超高时滚动区域存在，底部 statusbar 不被裁切。
    - 确认折叠态下无底部大空白回归。

- [x] 更新现有 renderer 测试：`tests/unit/renderer/views/popup_view.test.tsx`
    - 保留 provider tabs、总览、单 provider 刷新、无 CPA tab 的断言。
    - 增加折叠按钮不会触发 provider refresh 的断言。
    - 增加折叠状态只影响当前可见 provider/card，不改变聚合数据的断言。

- [x] 更新 provider 聚合测试：`tests/unit/renderer/provider-usage.test.ts`
    - 不改变聚合语义。
    - 增加断言：折叠状态不进入 `buildProviderUsageGroups()`，高度/折叠只属于 UI 状态。

#### 20.9 文档改动清单

> **前置审阅**：实现前按需检索 `docs/` 下受影响文档，列出需同步清单。重点排查：`spec.md`（窗口/托盘行为）、`test.md`（验收步骤）、`test-coverage-matrix.md`（覆盖项）、`plugin-contract.md`（确认 popup 高度 IPC 不进协议）、`handoff-2026-05-30.md`（如提及窗口尺寸需同步）、`cpa-quota-guide.md`（不应涉及，复核确认）、`coverage-baseline.md`（覆盖率基线同步）。审阅产物列入 PR 描述。

- [x] **按需检索 `docs/` 受影响文档**，列出与 Phase 20 冲突或需同步的章节清单，作为本轮 PR 描述的一部分。

- [x] 更新 `docs/spec.md`
    - 在 Popup/主面板章节说明：窗口高度由内容自适应决定，不是固定高度。
    - 明确默认展开、折叠后缩小、展开后增大。
    - 明确最小高度为“所有卡片折叠后的高度”。
    - 明确最大高度为当前屏幕 work area 的 `85%`。
    - 明确超过最大高度时使用内部滚动。
    - 增加平台行为：macOS 为托盘锚定 popover 且不可移动；Windows/Linux 为托盘触发的可移动浮动窗口。
    - 明确 Windows/Linux 用户移动窗口后，高度自适应不能重新吸回托盘。
    - 明确 Linux tray bounds 不可靠时的兜底定位策略。

- [x] 更新 `docs/test.md`
    - 增加真实打包验收步骤：打开托盘主面板、折叠全部卡片、展开卡片、验证高度变化。
    - 增加最大高度验收：内容很多时窗口不得超过屏幕可用高度 `85%`。
    - 增加最小高度验收：全部折叠后高度不得继续缩小，也不得出现底部大空白。
    - 增加平台验收：macOS 窗口不可拖动且保持托盘锚定；Windows/Linux 窗口可拖动且 resize 不重置用户位置。

- [x] 更新 `docs/test-coverage-matrix.md`
    - 增加覆盖项：popup 内容高度测量。
    - 增加覆盖项：折叠状态驱动窗口缩放。
    - 增加覆盖项：全折叠高度作为最小高度。
    - 增加覆盖项：`85% work area` 最大高度约束。
    - 增加覆盖项：`1px` debounce 防抖。
    - 增加覆盖项：macOS 托盘锚定且不可移动。
    - 增加覆盖项：Windows/Linux 可移动浮动窗口且高度变化保留用户位置。
    - 标明对应测试文件：`popup_height_controller.test.ts`、`popup_view_height.test.tsx`、`popup_window_constraints.spec.ts`、`popup_card_collapse_height.spec.ts`、`popup_platform_behavior.spec.ts`。

- [x] 如新增 IPC channel，更新 `docs/plugin-contract.md` 以外的相关架构文档；不得把 popup 高度控制写入插件协议文档，因为它不是插件协议。

### 验收标准

1. 主面板默认按展开内容自动撑高。
2. 折叠卡片后窗口随内容缩小。
3. 展开卡片后窗口随内容增大。
4. 全部折叠时窗口停在全折叠高度。
5. 内容很多时窗口不超过当前屏幕可用高度的 `85%`。
6. 高度变化无明显抖动、闪烁、循环 resize。
7. 打包产物真实启动验证通过。

---

### 已发现 Bug：`apply_locked_size` Path B 顶部下跳

**发现时间**：2026-06-01 打包验收  
**严重程度**：高（影响 Windows/Linux 未拖动窗口的所有折叠/展开操作）  
**状态**：已修复（2026-06-02）

#### 现象

1. 点击托盘弹出 popup 窗口，窗口高度正常。
2. 折叠卡片后，窗口高度正确缩小，但**顶部往下跳**（看起来像从底部往上缩但其实是顶部下移）。
3. 拖动窗口后，再折叠/展开，行为恢复正常：顶部不动，底部变化。
4. 关闭重新打开，bug 复现（`user_moved` 重置为 `false`）。

#### 根因

文件：`src/main/core/popup/popup-height-controller.ts`，`apply_locked_size()` 函数，line 136-146。

当 `user_moved === false` 且 `tray_bounds` 有效时（Path B）：

```ts
// line 138-139
const x = Math.round(tray.x + tray.width / 2 - width / 2);
const y = Math.round(tray.y + tray.height + 4);

// line 141-142
x: clamp(x, work.x, work.x + work.width - width),
y: clamp(y, work.y, work.y + work.height - new_height),
```

**每次都从 tray 坐标重算 `y`**，再 clamp。clamp 上界 `work.y + work.height - new_height` 随 `new_height` 变化，导致 `y` 在不同高度下被夹到不同值。

数值示例（1080p 屏幕，tray 在底部）：

| 窗口高度      | clamp 上界 = `1080 - height` | `y` = clamp(1068, 0, 上界) | 顶部位置 |
| ------------- | ---------------------------- | -------------------------- | -------- |
| 600（初始）   | 480                          | 480                        | y=480    |
| 300（折叠后） | 780                          | 780                        | y=780    |

顶部从 y=480 跳到 y=780，下移了 300px。高度缩小了 300px，但顶部也下移了 300px，视觉上窗口整体下移而非底部上缩。

#### 为什么拖动后正常

`index.ts` line 518-521：

```ts
popupWin.on("move", () => {
    if (popup_anchor_state.suppress_move) return;
    popup_anchor_state.user_moved = true;
});
```

拖动后 `user_moved = true`，走 Path A（line 127-133），用 `current.y` 保持顶部不动，只改 `height`。

#### 为什么是设计缺陷而非逻辑错误

macOS 的 Path（line 104-122）**有意**每次都从 tray 重算 `y`，因为 macOS popover 需要持续锚定菜单栏图标。Windows/Linux 的 Path B（line 136-146）**复制了 macOS 的行为**，但 Windows/Linux 的语义不同：

- macOS：窗口不可移动，高度变化时必须重新锚定 tray → 重算 `y` 是对的。
- Windows/Linux：窗口可移动，用户未拖动时应保持初始打开位置 → 不应重算 `y`。

#### 修复方向（供后续实现参考，本轮不改代码）

Path B 应保持初始定位后的 `current.y`，不从 tray 重算。即 Windows/Linux `user_moved === false` 时，首次打开由 `index.ts` 的 tray click handler（line 492-507）完成定位，后续 resize 应与 Path A 一样用 `current.y`。

本质上 Path B 在 Windows/Linux 场景下应该和 Path A 合并：`user_moved` 的 true/false 区分只影响是否允许窗口吸回 tray，不影响 resize 时的 y 计算。

---

### 已发现设计问题：总览 tab 卡片点击跳转而非就地展开

**发现时间**：2026-06-01 打包验收  
**严重程度**：中（功能缺失，影响总览页交互体验）  
**状态**：已修复（2026-06-02）

#### 现象

1. 用户在"总览" tab 看到所有 provider 卡片（Claude、Codex 等）。
2. 点击卡片的 `>` 按钮，视图跳转到对应 provider 的独立 tab。
3. 用户期望：点击卡片后在当前总览页就地展开该 provider 的账号详情，不跳转。

#### 根因

总览 tab 渲染的是 `ProviderCard`（`src/renderer/components/ProviderCard.tsx`），不是 `CollapsibleCard`。

**`ProviderCard` 没有展开/折叠能力**，只有两个交互：

- 刷新按钮（line 38-46）：调用 `onRefresh(provider)`
- `>` 跳转按钮（line 50-59）：调用 `onSelect(provider)`

`onSelect` 在 `PopupView.tsx` line 247 直接绑定 `setActiveTab`：

```tsx
<ProviderOverview
    onSelectProvider={is_live ? setActiveTab : () => undefined}
    ...
/>
```

所以点 `>` 会切换 `activeTab`，离开总览跳到 provider 详情 tab。

**总览 tab 下没有任何展开卡片的机制。** 当前设计意图是：总览只展示摘要（provider 名称、账号数、窗口数、状态），点 `>` 跳转到 provider 详情 tab 查看账号列表。

#### 涉及文件

| 文件                                                   | 角色                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `src/renderer/views/PopupView.tsx` line 243-250        | 总览渲染入口，`onSelectProvider` 绑定 `setActiveTab` |
| `src/renderer/components/ProviderOverview.tsx` line 27 | 传递 `onSelect` 给每个 `ProviderCard`                |
| `src/renderer/components/ProviderCard.tsx` line 50-59  | `>` 按钮触发 `onSelect` → 跳转                       |
| `src/renderer/components/CollapsibleCard.tsx`          | 有展开/折叠能力，但总览未使用                        |

#### 与现有组件的关系

- `CollapsibleCard` 已实现展开/折叠（`src/renderer/components/CollapsibleCard.tsx`），在 provider 详情 tab 的 `ProviderAccountRow` 中使用。
- `ProviderAccountList` + `ProviderAccountRow` 已支持 `collapsedAccounts` + `onToggleAccount` 折叠状态管理。
- 总览 tab 的 `ProviderCard` 没有接入 `CollapsibleCard`，也没有接入折叠状态。

#### 修复方向（供后续实现参考，本轮不改代码）

两种可选方案：

**方案 A：总览卡片改为就地展开**

- `ProviderCard` 改用 `CollapsibleCard` 包裹。
- 展开后显示该 provider 的账号列表（复用 `ProviderAccountList`）。
- 移除或保留 `>` 按钮作为快速跳转的辅助入口。
- 折叠状态接入 Phase 20 的高度自适应链路。

**方案 B：保持跳转但增加展开态**

- 总览卡片保持 `>` 跳转。
- 卡片头部增加展开/折叠 chevron，展开后在总览页内显示账号摘要。
- 两种入口共存：展开看摘要，`>` 进入完整详情 tab。

方案 A 更符合用户期望（总览 = 一页看所有 provider 详情），但需考虑总览内容过长时的滚动和高度问题。方案 B 折中但交互较复杂。

---

## Phase 21: Demo UI 完整对齐

### 背景

`docs/superpowers/specs/2026-06-01-demo-ui-alignment-design.md` 已定义需要与 `docs/design/omni-usage/project/` 对齐的真实 UI 范围。
该 spec 方向可执行，但有两个边界必须保留：

1. 禁止修改 `docs/design/omni-usage/**`。
2. 缺失真实后端能力时只能显示空状态，不能导入 demo 假数据或伪造历史数据。

### 核心原则

1. 以 demo 为视觉和交互标准。
2. 以现有 Electron / IPC / 插件数据流为真实数据来源。
3. 不直接移植 demo 假数组。
4. 不修改 `docs/design/omni-usage/**`。
5. Token 历史数据不足时显示"暂无历史数据"或 0 数据，不伪造趋势；Kimi 也只有确认单位是 token 时才聚合，不能把 USD/额度当 token。
6. Electron 原生托盘菜单不能 CSS 化；本轮**只做原生菜单功能项对齐**，自绘托盘菜单窗口留 Phase 22。
7. 折叠/展开、窗口高度自适应逻辑**全部复用 Phase 20 产物**，本轮不重复实现；本轮只接入 UsageCard 的折叠按钮事件并调用 Phase 20 的高度上报。

### 文件范围

主要修改：

- [x] `src/renderer/views/PopupView.tsx`
- [x] `src/renderer/views/SettingsView.tsx`
- [x] `src/renderer/components/ProviderNav.tsx`
- [x] `src/renderer/components/ProviderOverview.tsx`
- [x] `src/renderer/components/ProviderCard.tsx`
- [x] `src/renderer/components/ProviderAccountList.tsx`
- [x] `src/renderer/components/ProviderAccountRow.tsx`
- [x] `src/renderer/lib/provider-usage.ts`
- [x] `src/renderer/styles/globals.css`

可能新增：

- [x] `src/renderer/components/UsageCard.tsx`
- [x] `src/renderer/components/TokenPanel.tsx`
- [x] `src/renderer/components/CardMenu.tsx`
- [x] `src/renderer/components/UsageBarRow.tsx`

禁止修改：

- [x] `docs/design/omni-usage/**`

### 实现步骤

#### 21.1 主弹窗结构对齐

- [x] 顶栏对齐 demo：logo、`OmniUsage`、刷新全部按钮、设置按钮。
- [x] tab 区固定显示"总览"。
- [x] tab 区展示全部 provider：Claude / Codex / Gemini / Antigravity / Kimi / GLM / MiniMax / DeepSeek / Tavily。
- [x] tab 保留横向滚动、active 状态、分隔线、fade 效果。
- [x] tab 切换语义遵循 Phase 20.6：切换后默认展开当前 provider 内容，清空旧折叠状态。
- [x] 总览页显示所有 provider 卡片。
- [x] 单 provider tab 显示该 provider 下的账号卡片。
- [x] 未配置或无数据 provider 显示 demo 风格空状态，不隐藏 tab。
- [x] 错误 banner、刷新中 skeleton、空状态按 demo 视觉实现。
- [x] 底部状态栏显示状态点、状态文案、更新时间。

#### 21.2 卡片行为对齐

- [x] 新增或改造 `UsageCard`，统一 provider 卡片与账号卡片视觉。
- [x] 支持拖拽手柄视觉。
- [x] 支持单卡刷新。
- [x] 支持更多菜单 `CardMenu`：编辑、关闭/启用、删除。
- [x] 支持折叠/展开，并与 Phase 20 的高度自适应联动。
- [x] 关闭状态：卡片灰化，显示“监控已关闭，不再刷新用量”，提供“启用”。
- [x] 错误状态：显示网络异常/刷新失败，提供重试。
- [x] 认证失效状态：显示凭证失效，提供重新登录入口；若当前没有真实登录能力，入口显示禁用或引导到设置页。
- [x] 限制状态：接近限制时使用红色边框/danger bar。
- [x] 所有状态来自真实 `ConnectorInfo` / `UsageItem` 映射，不使用 demo 假状态。

#### 21.3 用量展示对齐

- [x] 每张卡展示名称、最近更新时间。
- [x] 展示 5 小时用量条。
- [x] 展示一周用量条。
- [x] 展示 reset 时间。
- [x] 无对应窗口数据时显示 demo 风格空/关闭/未知状态。
- [x] 多账号时：总览显示 provider 汇总，单 provider tab 显示账号列表。
- [x] 保留 CPA 作为数据来源标签，不把 CPA 做成 provider tab。

#### 21.4 Token 面板

> **前置：provider token 字段映射**
>
> 不同 provider 返回的 token 字段差异极大，21.4 实现前必须先列出可获取字段：
>
> - **Claude**：`/api/oauth/usage` 不返回原始 token 数，仅 `utilization`（占比）。**无 token 聚合能力**，TokenPanel 该 provider 列空状态。
> - **Codex**：`rate_limit.primary_window.used_percent` 不含 token 数；如需 token 须查 `/usage` 详细接口（目前 CPA 插件未抓取）。**无 token 聚合能力**，列空状态。
> - **Gemini**：`buckets[].remainingFraction` 不含 token 数。**无 token 聚合能力**，列空状态。
> - **Antigravity**：`quotaInfo.remainingFraction` 不含 token 数。**无 token 聚合能力**，列空状态。
> - **Kimi**：`limits[]` 含 `used` / `limit`，但单位可能是 token 或额度/金额。**只有能确认单位为 token 时才可聚合**；否则 TokenPanel 也显示空状态，不能把 USD/额度当 token。
> - **GLM / MiniMax / DeepSeek / Tavily**：现阶段无插件接入，全部空状态。
>
> 结论：本轮 TokenPanel 几乎全部 provider 走空状态。Kimi 仅在确认单位为 token 时展示当前窗口 `used` 聚合值。**不补假数据**。若用户后续新增 token 历史持久化能力（如本地累计），再单独开 Phase。

- [x] 新增 `TokenPanel`。
- [x] 标题为 `Total Tokens`。
- [x] 显示总量数字。
- [x] 支持时间范围切换：今天、最近一周、最近一月。
- [x] 仅 Kimi 等含原始 `used` 且能确认单位为 token 的 provider 展示真实聚合值；单位不明或为额度/金额时显示"暂无历史数据"空状态。
- [x] 不渲染 demo 假趋势数据。
- [x] Token 面板视觉对齐 demo 的 head、grip、collapse、图表区域。

#### 21.5 设置页账号管理对齐

- [x] 关于页 logo 改成真实 logo：使用 `resources/icon.png`（已存在），不使用纯图标 badge。如需独立 logo 资源，单独提 PR 添加 `resources/logo.png`，本轮不做新资源。
- [x] 版本文案读取真实 `package.json` 或现有应用版本来源。
- [x] 账号页按 provider 分组展示。
- [x] 每个 provider 分组包含：添加按钮、总开关、账号行、状态点、账号名、编辑、删除、开关。
- [x] CPA connector 产出的多个 provider 账号按 provider 分组展示。
- [x] 非 CPA 插件归入对应 provider 或 connector 分组。
- [x] 缺失添加/编辑真实后端能力时，显示禁用态或跳转现有设置表单，不伪造功能完成。

#### 21.6 托盘菜单对齐

> **范围**：本轮**只做 Electron 原生菜单功能项对齐**（下方 7 项）。自绘托盘菜单窗口（demo 100% 视觉）留 Phase 22，不在本轮范围。

- [x] Electron 原生托盘右键菜单包含：打开主面板、立即刷新全部、暂停自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
- [x] 托盘菜单行为需与 Phase 20 的平台策略兼容：macOS popover、Windows/Linux 可移动浮动窗口。

#### 21.7 样式对齐

> **方向**：以下类名规则**从 demo CSS 复制到 `src/renderer/styles/globals.css`**，方向单向（demo → 项目），**严禁反向修改 demo**。demo 是 prototype 参考，不引入构建。

- [x] 补齐 `.tab.pinned`。
- [x] 补齐 `.tabs-fade`。
- [x] 补齐 `.tabs-chevron`。
- [x] 补齐 `.count-badge`。
- [x] 补齐 `.card.dragging`。
- [x] 补齐 `.card.drag-over`。
- [x] 补齐 `.tokens-head .card-grip`。
- [x] 补齐 `.tokens-head .card-collapse`。
- [x] 补齐 `.ctx-menu`。
- [x] 补齐 `.ctx-item`。
- [x] 补齐 `.ctx-sep`。
- [x] 补齐 `.ctx-status`。
- [x] 清理当前项目中与 demo 语义冲突的样式；只清理本轮改动触达的样式，不做无关大重构。

#### 21.8 测试改动清单

- [x] 新增/更新 renderer 单元测试：`tests/unit/renderer/views/popup_view.test.tsx`
    - 固定 provider tabs 全量显示。
    - 无数据 provider 显示空状态。
    - 总览显示 provider 卡片。
    - 单 provider tab 显示账号卡片。
    - CPA 不作为 provider tab。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/components/usage_card.test.tsx`
    - 展示名称、更新时间、5 小时条、一周条、reset 时间。
    - 关闭状态灰化并显示启用入口。
    - 错误状态显示重试入口。
    - 认证失效状态显示重新登录或设置入口。
    - danger 状态使用 danger bar / 红色边框。
    - 更多菜单展示编辑、关闭/启用、删除。
    - 折叠/展开状态正确切换。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/components/token_panel.test.tsx`
    - 展示 `Total Tokens`。
    - 时间范围切换今天/最近一周/最近一月。
    - 有真实 token 数据时展示聚合值。
    - 无历史数据时显示空状态，不渲染假趋势。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/views/settings_provider_accounts.test.tsx`
    - 账号页按 provider 分组。
    - CPA connector 账号拆入对应 provider 组。
    - 非 CPA 插件归入对应 provider 或 connector 组。
    - 添加、编辑、删除、开关入口按真实能力显示启用/禁用。

- [x] 新增/更新主进程或集成测试：`tests/unit/main/tray_menu.test.ts`
    - 右键菜单包含打开主面板、立即刷新全部、暂停自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
    - 不断言 CSS 视觉，因为 Electron 原生菜单不可 CSS 化。

- [ ] 更新 E2E：`tests/user_e2e/specs/popup_demo_alignment.spec.ts`
    - 验证顶部栏、全量 tab、总览卡片、单 provider 账号列表、底部状态栏。
    - 验证空状态、错误状态、刷新中 skeleton。
    - 验证更多菜单、关闭/启用、单卡刷新。
    - 验证折叠/展开，并与 Phase 20 高度联动。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_card_states.spec.ts`
    - 关闭状态卡片：灰化、显示"监控已关闭"、可点击"启用"恢复。
    - 错误状态：模拟插件返回错误，断言显示重试按钮，点击重试触发刷新。
    - 认证失效状态：模拟 token 过期，断言显示"凭证失效"提示与设置入口。
    - 限制接近状态：模拟 utilization ≥ 0.9，断言卡片边框/进度条切换为 danger 视觉。
    - danger bar 反色文字：fillPct ≥ 65 时文字反色（继承 19.3.3 UsageRow 行为）。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_token_panel.spec.ts`
    - 仅 Kimi 等含原始 `used` 且能确认单位为 token 的 provider 展示聚合值。
    - Claude/Codex/Gemini/Antigravity 不渲染假趋势，显示"暂无历史数据"。
    - Kimi 单位不明或为额度/金额时也显示"暂无历史数据"，不能把额度当 token。
    - 时间范围切换（今天/最近一周/最近一月）UI 可点击；无历史数据时切换不报错。
    - 折叠 TokenPanel 后窗口高度下降（与 Phase 20 高度链路联动）。

- [ ] 新增 E2E：`tests/user_e2e/specs/popup_drag_handle.spec.ts`
    - 拖拽手柄可视化存在；拖拽交互产生 `card.dragging` / `card.drag-over` className 切换。
    - 本轮不要求卡片重排持久化；若要保存顺序，另开 Phase 实现排序模型和持久化。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_theme.spec.ts`
    - 切换深浅主题，断言 `data-theme="dark"` 切换正确。
    - 深色模式下 danger 红色、空状态文字、tabs-fade 色板可读。

- [ ] 更新 E2E：`tests/user_e2e/specs/settings_provider_accounts.spec.ts`
    - 验证设置页账号管理按 provider 分组。
    - 验证 CPA 多 provider 账号拆分展示。
    - 验证版本文案和真实 logo。
    - 验证添加/编辑/删除/开关入口按真实能力显示启用/禁用，无后端能力时禁用且 tooltip 解释。

- [ ] 新增 E2E：`tests/user_e2e/specs/tray_menu_actions.spec.ts`
    - 在 test mode/mock 下触发右键托盘 7 项菜单，逐项断言行为：
        - 打开主面板：popup 显示。
        - 立即刷新全部：所有插件触发 refresh。
        - 暂停自动刷新：调度器停止；恢复后继续。
        - 开机自启：只断言 autostart API 被调用，不真实写系统启动项。
        - 设置：Settings 窗口打开。
        - 检查更新：有 updater 时触发更新检查 API；无 updater 能力时菜单项禁用或显示未配置提示。
        - 退出 OmniUsage：应用退出（packaged smoke 可单独覆盖）。

- [ ] 更新 packaged smoke：`tests/packaged_smoke/smoke.spec.ts`
    - 打包启动后验证窗口加载、托盘出现、主面板可打开。
    - 验证全量 provider tab 存在。
    - 验证折叠/展开、更多菜单、单卡刷新关键路径。
    - 验证设置页账号管理入口可用。
    - 验证托盘 7 项右键菜单可见。

#### 21.9 文档改动清单

> **前置审阅**：实现前按需检索 `docs/` 下受影响文档，列出需同步清单。重点排查：`spec.md`（主面板结构 / provider tab / 卡片状态 / TokenPanel / 托盘菜单）、`test.md`（手工验收 + 打包验收）、`test-coverage-matrix.md`（覆盖项与测试文件映射）、`plugin-contract.md`（UsageItem / ConnectorInfo 字段是否被 21.2 / 21.3 / 21.4 引用，确认不改协议）、`cpa-quota-guide.md`（CPA 多 provider 拆分入设置页的描述是否需同步）、`handoff-2026-05-30.md`（如提及 UI 布局需同步）。审阅产物列入 PR 描述。

- [x] **按需检索 `docs/` 受影响文档**，列出与 Phase 21 冲突或需同步的章节清单，作为本轮 PR 描述的一部分。

- [x] 更新 `docs/spec.md`
    - 记录 demo 对齐后的主面板结构。
    - 记录全量 provider tab 策略：即使无数据也显示空状态。
    - 记录卡片状态：正常、关闭、错误、认证失效、限制接近。
    - 记录 Token 面板的数据限制：无真实历史时显示空状态，不伪造。
    - 记录托盘菜单限制：原生菜单功能对齐，自绘菜单另算能力。

- [x] 更新 `docs/test.md`
    - 增加 demo 对齐手工验收：总览、单服务 tab、刷新全部、单卡刷新、折叠/展开、更多菜单、关闭/启用、设置页账号管理、添加/编辑入口、明暗主题。
    - 增加打包验证：`pnpm package` 后启动 `out/OmniUsage-win32-x64/OmniUsage.exe`，确认窗口加载、托盘出现、主路径可用。

- [x] 更新 `docs/test-coverage-matrix.md`
    - 增加覆盖项：全量 provider tabs。
    - 增加覆盖项：UsageCard 状态与操作。
    - 增加覆盖项：TokenPanel 有/无真实数据。
    - 增加覆盖项：Settings provider 分组账号管理。
    - 增加覆盖项：托盘右键菜单功能项。
    - 标明对应测试文件：`usage_card.test.tsx`、`token_panel.test.tsx`、`settings_provider_accounts.test.tsx`、`tray_menu.test.ts`、`popup_demo_alignment.spec.ts`、`settings_provider_accounts.spec.ts`。

### 验收标准

1. 主面板结构与 demo 对齐。
2. 所有 provider tab 固定显示，无数据时显示空状态。
3. 卡片支持刷新、更多菜单、关闭/启用、折叠/展开、错误/认证/限制状态。
4. Token 面板显示真实可得数据；无历史数据时明确空状态。
5. 设置页账号管理按 provider 分组。
6. 托盘右键菜单功能项完整。
7. 不修改 `docs/design/omni-usage/**`。
8. 不导入 demo 假数据。
9. `pnpm test` 通过。
10. `pnpm package` 后真实启动验证通过。

---

## 通用约束（每轮适用）

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API
8. 每轮输出修改文件列表
9. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
