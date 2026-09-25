# Renderer 模块审阅报告 — Claude Current

- **模型判断依据**: 主会话 default_sonnet
- **模块 slug**: renderer
- **审阅范围**: `src/renderer/` 全量 .ts/.tsx 文件（App 入口、views、components、hooks、lib）

______________________________________________________________________

## 高优先级

### 1. use-config.ts:1 — `eslint-disable react-hooks/rules-of-hooks` 全局禁用

- **位置**: `src/renderer/hooks/use-config.ts:1`
- **现象**: 文件首行 `/* eslint-disable react-hooks/rules-of-hooks */`。同模式出现在 `use-plugins.ts`、`use-route.ts`、`use-popup-height-report.ts`、`use-popup-ui-config.ts`、`use_popup_derived.ts`、`use_tab_navigation.ts`、`use_watched_metric_toggler.ts`、`use_dnd_handlers.ts`。
- **影响**: 条件调用 hooks 时 lint 不会报警，埋下运行时 bug 风险。当前代码实际没有条件调用，但禁用 lint 规则使未来回归无法被捕获。
- **建议**: 若 hooks 始终在顶层调用，删除禁用注释；若存在条件调用场景，重构为无条件调用 + 条件逻辑。
- **置信度**: 高
- **优先级**: 中（防御性）

### 2. PopupView.tsx — 文件超 830 行，render_body 内联闭包过多

- **位置**: `src/renderer/views/PopupView.tsx:473-781`
- **现象**: `render_body` 函数定义在组件内部，每次渲染重新创建。函数体 ~300 行，包含 50+ 个闭包引用。`refresh_providers` 在 line 786 定义、line 699 使用，依赖 JS 变量提升语义，阅读困难。
- **影响**: 每次渲染创建新函数对象；代码可读性差，调试时行号映射复杂。
- **建议**: 将 `render_body` 提取为独立组件（如 `PopupBody`），将 `refresh_providers` 移到 `render_body` 定义之前。
- **置信度**: 高
- **优先级**: 中

### 3. SettingsView.tsx:347 — `_omit` void 模式排除 displayName

- **位置**: `src/renderer/views/SettingsView.tsx:346-349`
- **现象**:
    ```ts
    const { displayName: _omit, ...rest } = plugin;
    void _omit;
    ```
    用解构 + void 来排除属性，绕过 no-unused-vars。
- **影响**: 可读性差；若 `displayName` 不存在于类型中会静默失败。
- **建议**: 使用 `omit` 工具函数或直接 `{ parameterValues, endpointOverrides, ... }` 选取需要的属性。
- **置信度**: 高
- **优先级**: 中

### 4. PopupView.tsx:233-236 — JSON.stringify 比较对象

- **位置**: `src/renderer/views/PopupView.tsx:233-236`
- **现象**:
    ```ts
    if (
        JSON.stringify(prev_c) === JSON.stringify(collapsed_accounts) &&
        JSON.stringify(prev_e) === JSON.stringify(expanded_providers)
    ) {
        return;
    }
    ```
- **影响**: 每次 effect 触发都序列化两个对象，O(n) 开销。key 顺序不同但语义相同时可能误判为不同。
- **建议**: 用 `Object.keys().length` + 逐 key 比较，或引入浅比较工具。同文件 line 40-54 已有 `arrays_equal` 和 `account_orders_equal` 可参照。
- **置信度**: 高
- **优先级**: 低（性能）

______________________________________________________________________

## 中低优先级

### 5. 命名风格不一致：snake_case / camelCase 混用

- **位置**: 全模块
- **现象**: 同一文件内混用两种命名：
    - `PopupView.tsx`: `refreshing` (camelCase) vs `refreshing_providers` / `collapsed_accounts` / `provider_order` (snake_case)
    - `SettingsView.tsx`: `pluginInfos` vs `rename_target` / `label_map_dialog`
    - `TokenStatsView.tsx`: `load_request_id` vs `handlePresetChange` / `handleCustomApply`
- **影响**: 增加认知负担；团队协作时命名预期不一致。
- **建议**: 统一为一种风格（项目 CLAUDE.md 约定 `snake_case`），存量 camelCase 来自 React/JS 生态惯性，可逐步迁移。
- **置信度**: 高
- **优先级**: 低

### 6. Icon.tsx:92 — dangerouslySetInnerHTML 渲染 SVG 路径

- **位置**: `src/renderer/components/Icon.tsx:92`
- **现象**: `dangerouslySetInnerHTML={{ __html: UI_ICONS[name] ?? "" }}`，`VendorMark` 内 `render(size)` 也使用字符串拼接 SVG。
- **影响**: 当前 `UI_ICONS` 和 `VENDOR_MARKS` 全为硬编码常量，无用户输入，XSS 风险为零。但 lint 不会标记后续引入动态值的风险。
- **建议**: 可接受。若后续支持自定义图标名，需加白名单校验。
- **置信度**: 高
- **优先级**: 低

### 7. data_section.tsx:41-49 — "清除"按钮无 onClick

- **位置**: `src/renderer/views/settings-view/sections/data_section.tsx:42-49`
- **现象**: "本地用量缓存" 行的"清除"按钮无 `onClick` handler。
- **影响**: 点击无反应，用户困惑。可能是未实现的功能。
- **建议**: 要么实现清除逻辑，要么标注 disabled 并说明。
- **置信度**: 高
- **优先级**: 中

### 8. data_section.tsx:90-101 — "重置应用"按钮无 onClick

- **位置**: `src/renderer/views/settings-view/sections/data_section.tsx:90-101`
- **现象**: "重置应用"按钮同样无 `onClick` handler。
- **影响**: 同上，危险操作区域的按钮无功能实现。
- **建议**: 同上。
- **置信度**: 高
- **优先级**: 中

### 9. settings-view/lib.ts:59-72 — session_meta 未被使用

- **位置**: `src/renderer/views/settings-view/lib.ts:59-72`
- **现象**: `session_meta` 导出后在 renderer 目录内无引用。
- **影响**: 死代码增加维护负担。
- **建议**: 删除或确认是否为外部消费（需全局搜索）。
- **置信度**: 中
- **优先级**: 低

### 10. use-popup-ui-config.ts — 13 个独立 useState

- **位置**: `src/renderer/hooks/use-popup-ui-config.ts:43-64`
- **现象**: 13 个独立 `useState` 调用管理 popup UI 配置。
- **影响**: 每个 setter 引用变化会触发 `apply_config` useCallback 重建，进而触发 config 加载 effect。状态更新时 13 个 setState 独立触发重渲染。
- **建议**: 合并为 `useReducer` 或单个 state 对象。
- **置信度**: 中
- **优先级**: 低（性能优化）

### 11. palette.ts — 硬编码用户目录路径

- **位置**: `src/renderer/lib/token-stats/palette.ts:37-44`
- **现象**: `PROJECT_COLORS` 包含硬编码路径如 `/home/testuser/omni_eval`。
- **影响**: 其他用户部署时这些颜色永远不会命中，退回到默认 `#6b7890`。不构成 bug，但设计上有局限。
- **建议**: 考虑基于目录名 hash 生成颜色，或允许用户配置。
- **置信度**: 高
- **优先级**: 低

### 12. useECharts — eslint-disable 依赖列表

- **位置**: `src/renderer/hooks/use-echarts.ts:32-33`
- **现象**: 两处 `eslint-disable-next-line react-hooks/exhaustive-deps`。
- **影响**: 依赖列表不完整，`getOption` 和 `deps` 变化时可能未正确触发更新。当前用法中 `getOption` 每次渲染都变（inline arrow），所以 effect 总是触发，掩盖了问题。
- **建议**: 明确注释为何禁用，或重构为 stable callback。
- **置信度**: 中
- **优先级**: 低

### 13. TokenStatsView.tsx — localStorage 直接读写

- **位置**: `src/renderer/views/TokenStatsView.tsx:82-124`
- **现象**: `readSavedTheme`、`saveTheme`、`load_prefs`、`save_prefs` 直接使用 `localStorage`。
- **影响**: 与主配置系统（`window.usageboard.config`）分离，导入/导出设置不包含这些偏好。不一致的持久化策略。
- **建议**: 考虑统一到 config store 或明确文档说明。
- **置信度**: 中
- **优先级**: 低

### 14. AboutSection — 外部链接无安全属性

- **位置**: `src/renderer/views/settings-view/sections/about_section.tsx:114`
- **现象**: `window.open(url, "_blank")` 无 `noopener,noreferrer`。
- **影响**: 新页面可通过 `window.opener` 访问原页面。Electron 环境下风险较低。
- **建议**: `window.open(url, "_blank", "noopener,noreferrer")`。
- **置信度**: 高
- **优先级**: 低

### 15. TrayMenu.tsx:182 — 分隔符索引硬编码

- **位置**: `src/renderer/views/TrayMenu.tsx:182`
- **现象**: `const sep_indexes = new Set([3, 5, 10]);` 硬编码分隔符位置。
- **影响**: `items` 数组增删时必须同步更新索引集合，容易遗漏。
- **建议**: 在 item 定义中用 `{ type: "separator" }` 标记，渲染时区分。
- **置信度**: 高
- **优先级**: 低

______________________________________________________________________

## 改进建议

1. **PopupView 拆分**: 将 `render_body` 提取为独立组件，减少单文件复杂度。
2. **usePopupUiConfig 重构**: 13 个 useState 合并为 useReducer，减少 re-render 触发。
3. **命名统一**: 新代码一律 snake_case，存量 camelCase 在涉及时顺手迁移。
4. **config 持久化统一**: TokenStatsView 的 localStorage 偏好迁移到 config store。
5. **空 onClick 按钮**: data_section 中"清除"和"重置"要么实现要么 disable。

______________________________________________________________________

## 不确定项

1. `session_meta`（lib.ts:59-72）是否有外部消费（preload/其他窗口），需全局搜索确认。
2. `ChatPalette` 接口命名是否应为 `ChartPalette`（当前文件内已用 `ChartPalette`，`ChatPalette` 不存在——确认无误，palette.ts:47 命名为 `ChartPalette`，正确）。
3. `useECharts` 的 `getOption` 稳定性：当前 inline arrow 每次渲染都变，但 `deps` 数组能正确触发更新。若未来 `getOption` 变为 stable callback，依赖列表需同步调整。
