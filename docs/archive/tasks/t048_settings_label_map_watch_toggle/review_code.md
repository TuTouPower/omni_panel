# Task review t048（reviewer_focus: 代码）

- task：`t048_settings_label_map_watch_toggle`
- spec：`docs\tasks\t048_settings_label_map_watch_toggle/spec.md`
- diff_anchor：`16ee8348343ab0bc78b9945cf89965679a5a416d`
- target：`git diff 16ee8348343ab0bc78b9945cf89965679a5a416d`
- round：1
- reviewed_at：2026-07-23 16:30 UTC+8

## 范围确认

- 改动文件：`src/renderer/components/SettingsForm.tsx`、`src/renderer/lib/label-map-util.ts`、`src/renderer/views/SettingsView.tsx`；测试 `tests/unit/renderer/components/settings_form.test.tsx`、`tests/unit/renderer/lib/label-map-util.test.ts`。
- 未触碰数据层（`account-overrides.ts`、`config/types.ts`、`collect_upcoming_resets`）、主面板 bell（`ProviderCard/AccountUsageRow`）、全局阈值；spec 非范围守住。
- `LabelMapRow.account_keys` 为新增字段，所有既有调用方（`SettingsForm` / `LabelMapDialog`）只读 `raw`/`default`/`display`，新字段非破坏。`LabelMapDialog` 未渲染 bell，符合 spec 非范围。
- accountKey 维度对齐：`build_provider_usage_groups`（`provider-usage.ts:257, 274`）将 `account.id` 设为 `accountKey(period)`，`collect_upcoming_resets`（`provider-usage.ts:583`）按 `watched?.[provider]?.[account.id]` 查表；`SettingsForm` 与 `SettingsView` 的 toggle 都使用同一 `accountKey()`（`provider-usage.ts:169`），维度一致。

## Findings

### t048_code_f001 - bell 按钮的 `.lm-watch` CSS 类未定义

- 严重度：minor
- 位置：`src/renderer/components/SettingsForm.tsx:549`
- 问题：按钮声明 `className="lm-watch"`，但全仓 CSS（`src/renderer/styles/globals.css` 及其他源码样式表）没有 `.lm-watch` 规则。`globals.css` 也无全局 `button` reset 兜底。结果按钮使用浏览器默认 chrome（灰色背景、边框、内边距），紧邻的 `.lm-raw`（chip 风）、`.lm-input`（field 风）、`.lm-arrow`（纯色 chevron）都是设计系统内风格化元素。视觉上 bell 像外挂按钮而非行内 toggle，spec AC「不破坏现有 label 编辑 UI」的视觉一致性被削弱。Icon 上的 `opacity: watched ? 1 : 0.35` 反馈也被按钮默认背景弱化。
- 建议：在 `globals.css` 补一条最小样式（透明背景、无边框、行内尺寸、hover 反馈），与 `.lm-arrow` 风格对齐，例如：

    ```css
    .lm-watch {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        background: transparent;
        border: 0;
        color: var(--text-3);
        cursor: pointer;
        border-radius: 6px;
    }
    .lm-watch:hover {
        background: var(--chip-bg);
        color: var(--text-2);
    }
    ```

### t048_code_f002 - 新增 prop 命名风格混用 camelCase 与 snake_case

- 严重度：minor
- 位置：`src/renderer/components/SettingsForm.tsx:44-47`（以及 `SettingsView.tsx:360-362`）
- 问题：同一 interface 同时新增两个 prop：`watchedMetrics`（camelCase）与 `on_toggle_watched`（snake_case）。全局 CLAUDE.md 规定「命名一律 snake_case」，本文件既有 React prop 又已是 camelCase（`existingLabelMap`、`onSaveLabelMap`、`forcePercent`、`onForcePercentChange`）——本 task 新增代码同时延续 camelCase（`watchedMetrics`）和切换到 snake_case（`on_toggle_watched`），任一种都让 interface 内部不一致。测试也照搬混用（`watchedMetrics={...}` 与 `on_toggle_watched={...}` 并列）。
- 建议：二选一并贯穿本 task 新增的两侧（prop 名、test 调用、`AccountDialog` 透传）。按 CLAUDE.md 选 snake_case → `watched_metrics`；若延续文件既有 camelCase 约定 → `onToggleWatched`。当前混搭会让后续 reader 误以为有意为之的区分。

## 结论

- 本轮新发现：2 条（均 minor）。
- 总体判断：watched 状态聚合（per-raw_label 跨所有 accountKey 的 every 语义）、add/remove 分支、`save_config` 持久化、accountKey 维度对齐 `collect_upcoming_resets` 均正确，主流程可验收；两处 minor 分别是按钮缺样式与新增 prop 命名混搭，不阻断功能但应一并修。

verdict: FAIL

## Round 2 (2026-07-23 17:10 UTC+8)

- reviewed_at：2026-07-23 17:10 UTC+8
- 复核范围：`git diff 16ee8348343ab0bc78b9945cf89965679a5a416d -- src/renderer/styles/globals.css src/renderer/components/SettingsForm.tsx src/renderer/views/SettingsView.tsx tests/unit/renderer/components/settings_form.test.tsx`
- 兼检主面板 bell 未被误改：`src/renderer/{components,views}/` 下 `ProviderCard.tsx`、`UsageRows.tsx`、`UsageBarList.tsx`、`PopupView.tsx`、`ProviderOverview.tsx`、`ProviderAccountRow.tsx`、`ProviderAccountList.tsx`。

### 复核结论

- **t048_code_f001（CSS `.lm-watch`）**：已修。`globals.css:3340-3356` 新增 `.lm-watch`（display:inline-flex / 22×22 / padding:0 / background:transparent / border:0 / color:`--text-3` / cursor:pointer / border-radius:6px）与 `.lm-watch:hover`（background:`--chip-bg` / color:`--text-2`），属性与 Round 1 建议一致。与紧邻的 `.lm-arrow`（`globals.css:3336`，仅 `color:var(--text-3); flex-shrink:0`，作用于 `<Icon>`）风格对齐——同 `--text-3` 基色、hover 升 `--chip-bg`/`--text-2`；因 bell 是 `<button>` 额外补按钮 reset，合理偏离。
- **t048_code_f002（prop camelCase/snake_case 混用）**：已修。
    - `SettingsForm.tsx`：interface（L44-47）、解构（L66-67）、`onClick` 内调用（L549 `onToggleWatched(r.raw)`）一致使用 `onToggleWatched`。
    - `SettingsView.tsx`：4 处一致——`AccountDialog` 形参类型（L358-361）、`AccountDialog` 解构（L328-329）、透传 `<SettingsForm onToggleWatched={...}/>`（L475-476）、顶层 `<AccountDialog onToggleWatched={(raw_label) => {...}}/>`（L2196-2230）。
    - `settings_form.test.tsx`：JSX prop 改为 `onToggleWatched`（L537、L591、L614）。测试 describe/it 文案里的 `on_toggle_watched` 为英文描述串、局部变量 `const on_toggle_watched = vi.fn()` 为 JS 标识符，均非 React prop 名，保留无误。
- **主面板 bell（非本 task 范围）**：7 文件仍 `on_toggle_watched`（不同签名/契约，签名差异源于 `ToggleWatchedMetric` 与本 task 的 `(raw_label: string) => void`），未被误改。

### 本轮新发现

无。

verdict: PASS
