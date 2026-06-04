# Demo 与实现对比报告

> 生成时间: 2026-06-04
> Demo: `docs/design/omni-usage/project/OmniUsage UI.html` + `OmniUsage Settings.html`
> 实现: `src/renderer/` (globals.css + React 组件)

---

## 1. CSS 变量系统

### 1.1 基本一致

Demo 和实现的 CSS 变量名、色值高度一致。以下变量完全对齐：

| 变量                                   | Light     | Dark      | 状态 |
| -------------------------------------- | --------- | --------- | ---- |
| `--blue`                               | `#3d7afd` | `#5b8dff` | 一致 |
| `--purple`                             | `#7b5cf6` | `#9a80ff` | 一致 |
| `--green`                              | `#22c55e` | `#34d27b` | 一致 |
| `--amber`                              | `#f5a524` | `#f7b53c` | 一致 |
| `--red`                                | `#ef4444` | `#ff6b6b` | 一致 |
| `--desktop`                            | `#e7eaf1` | `#0c0e13` | 一致 |
| `--win-bg` / `--card-bg` / `--text` 等 | —         | —         | 一致 |

### 1.2 实现中缺失的变量

实现引用了但 `globals.css` 未定义的 Tailwind 兼容变量：

| 变量            | 使用位置                               | 说明               |
| --------------- | -------------------------------------- | ------------------ |
| `--destructive` | `ErrorBanner.tsx`, `RefreshButton.tsx` | 应映射到 `--red`   |
| `--ring`        | `Button.tsx`                           | 未定义，可能有回退 |
| `--foreground`  | `Button.tsx`                           | 未定义             |

### 1.3 实现中多余的变量

实现为了 Tailwind/shadcn 兼容性添加了 demo 中没有的变量别名：

- `--primary`, `--primary-foreground`
- `--border`, `--card`, `--card-foreground`
- `--muted`, `--muted-foreground`
- `--radius`

这些不影响视觉一致性，但增加了维护面。

---

## 2. 进度条系统 — 最大差异点

### 2.1 Demo 使用紧凑 6px 轨道

```css
/* demo omniusage.css */
.track {
    height: 6px;
    border-radius: 99px;
}
```

网格布局: `42px 1fr 40px 76px`（标签 / 轨道 / 百分比 / 重置时间）

### 2.2 实现有两套系统并存

**旧系统** (`UsageBarRow.tsx`): `.bar-row / .track / .fill`

- 与 demo 基本一致的 6px 轨道

**新系统** (`ProviderCard.tsx`): `.ub-row / .ub-bar`

- **26px 高的粗药丸形进度条**
- 文字叠加在进度条上
- 网格布局: `100px 1fr auto`

### 2.3 差异总结

| 属性       | Demo                 | 实现新系统           |
| ---------- | -------------------- | -------------------- |
| 轨道高度   | 6px                  | **26px**             |
| 网格列     | `42px 1fr 40px 76px` | `100px 1fr auto`     |
| 百分比位置 | 轨道右侧独立列       | **叠加在进度条内**   |
| 重置时间   | 右侧独立列           | `ub-row-time` 另起行 |
| 视觉风格   | 细线式               | **粗药丸式**         |

**结论**: 实现的 `ub-*` 系统与 demo 设计不符。需要决定是回退到 demo 的 6px 细线还是保留 26px 药丸（后者更接近旧 UsageBoard 风格）。

---

## 3. 组件差异

### 3.1 实现有但 Demo 无

| 组件                       | 说明                                       |
| -------------------------- | ------------------------------------------ |
| `Skeleton.tsx`             | Tailwind 风格骨架屏（demo 用内联 shimmer） |
| `EmptyState.tsx`           | 独立空状态组件                             |
| `ErrorBanner.tsx`          | 独立错误横幅组件                           |
| `ConnectorStatusCard.tsx`  | CPA 连接器状态卡片                         |
| `CpaConnectorSettings.tsx` | CPA 连接器设置面板                         |
| `CollapsibleCard.tsx`      | 通用可折叠卡片壳                           |
| `RefreshButton.tsx`        | 独立刷新按钮组件                           |
| `TokenPanel.tsx`           | 独立 Token 面板组件                        |

### 3.2 Demo 有但实现缺失/不完整

| 功能                   | Demo 表现                                     | 实现状态                              |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| **托盘菜单窗口**       | 独立 184px 宽小窗口，菜单项完整               | 主进程有托盘，但 UI 不完整            |
| **Demo 多状态切换**    | 正常/限流警告/刷新中/网络错误/凭证无效/空状态 | 各状态有单独处理但无统一演示          |
| **卡片拖拽排序**       | 完整的 drag reorder + 视觉反馈                | 实现中有 drag 相关 class 但功能待验证 |
| **Add-account picker** | 3列网格 + 常用服务 + CPA 高级选项             | 有但 UI 细节可能未完全对齐            |
| **Settings 外观页**    | 主题选择 + 强调色选择器 + 预览                | 有但可能缺完整预览                    |

### 3.3 结构差异

| 方面           | Demo                                             | 实现                                               |
| -------------- | ------------------------------------------------ | -------------------------------------------------- |
| 菜单系统       | 两套：card-local `.card-menu` + 通用 `.ctx-menu` | 两套均有：`CardMenu.tsx` + `ProviderCard.tsx` 内联 |
| Tab 滚动指示   | 右侧渐变 `.tabs-fade.right`                      | 有                                                 |
| 可折叠图标旋转 | CSS class 驱动                                   | **inline style 驱动** (`transform: rotate(...)`)   |

---

## 4. 布局差异

| 方面                     | Demo                               | 实现                                       |
| ------------------------ | ---------------------------------- | ------------------------------------------ |
| 主窗口宽度               | 460px 固定                         | 通过 CSS 控制，应一致                      |
| 弹窗高度                 | JS 动态测量 + 视口 75% 上限        | `use-popup-height-report.ts` + 隐形 mirror |
| 设置窗口宽度             | 820px                              | 独立窗口移除圆角和阴影                     |
| 设置侧栏                 | 176px（独立窗口）/ 132px（弹窗内） | 应一致                                     |
| Settings `border-radius` | 独立窗口 `18px`                    | 独立窗口 `0`（移除了圆角）                 |

**注意**: 设置独立窗口在实现中移除了 `border-radius` 和 `box-shadow`，而 demo 保留了。

---

## 5. 视觉细节差异

### 5.1 边框

| 属性     | Demo                             | 实现 |
| -------- | -------------------------------- | ---- |
| 卡片边框 | `0.5px solid var(--card-border)` | 一致 |
| 窗口边框 | `0.5px solid var(--win-border)`  | 一致 |
| 分隔线   | `0.5px solid var(--hairline)`    | 一致 |

基本一致。

### 5.2 阴影

| 场景     | Demo                                     | 实现 |
| -------- | ---------------------------------------- | ---- |
| 窗口阴影 | 两层：`0 20px 60px -12px` + `0 4px 14px` | 一致 |
| 卡片阴影 | 两层：`0 1px 2px` + `0 6px 18px -8px`    | 一致 |
| 菜单阴影 | 两层：`0 12px 38px` + `0 2px 8px`        | 一致 |

完全一致。

### 5.3 强调色按钮

Demo 中 primary 按钮有蓝色光晕：

```css
box-shadow: 0 3px 10px color-mix(in srgb, var(--blue) 30%, transparent);
```

实现中 `Button.tsx` 使用 Tailwind，需确认是否保留了此光晕效果。

---

## 6. 动画差异

### 6.1 一致

| 动画         | 时长  | 曲线                         | 状态 |
| ------------ | ----- | ---------------------------- | ---- |
| 窗口高度变化 | 0.32s | `cubic-bezier(.32,.72,.3,1)` | 一致 |
| 进度条填充   | 0.5s  | `cubic-bezier(.3,.8,.4,1)`   | 一致 |
| 刷新旋转     | 0.8s  | linear                       | 一致 |
| 骨架屏闪光   | 1.2s  | linear                       | 一致 |
| 菜单弹入     | 0.12s | ease                         | 一致 |
| 对话框弹入   | 0.16s | `cubic-bezier(.2,.8,.3,1)`   | 一致 |
| 账户抽屉展开 | 0.22s | `cubic-bezier(.2,.8,.3,1)`   | 一致 |

### 6.2 差异

| 动画                    | Demo                                                                    | 实现         |
| ----------------------- | ----------------------------------------------------------------------- | ------------ |
| `popIn`（窗口首次出现） | 定义但主要用于 demo stage                                               | 未见独立定义 |
| 减少动效支持            | `@media (prefers-reduced-motion: no-preference)` 包裹窗口高度和抽屉动画 | 需确认       |

---

## 7. 遗留代码 / 技术债

| 问题                     | 详情                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| 两套进度条系统           | `.bar-row`（旧）vs `.ub-row`（新）并存                                    |
| 两套菜单系统             | `CardMenu.tsx`（通用 `.ctx-menu`）vs `ProviderCard.tsx` 内联 `.card-menu` |
| Tailwind + 全局 CSS 混用 | 通用组件用 Tailwind（Button/Card/Skeleton），业务组件用全局 CSS           |
| 未定义 CSS 变量          | `--destructive`, `--ring`, `--foreground` 无定义                          |
| 旧 UsageBoard CSS        | `usageboard.css` 仍存在于 demo 中，变量体系完全不同                       |

---

## 8. 优先修复建议

### P0 — 视觉一致性

1. **进度条系统统一**: 决定用 demo 的 6px 细线还是 26px 药丸，统一为一套
2. **补全缺失 CSS 变量**: `--destructive` → `var(--red)`, `--ring` → `var(--blue)`, `--foreground` → `var(--text)`

### P1 — 功能完整性

3. **托盘菜单 UI**: 完成独立菜单窗口
4. **设置窗口圆角**: 独立设置窗口是否应保留 18px 圆角（与 demo 一致）

### P2 — 代码质量

5. **统一菜单组件**: 合并 `CardMenu.tsx` 和 `ProviderCard.tsx` 内联菜单
6. **可折叠图标**: 从 inline style 改为 CSS class 驱动
7. **Button.tsx**: 确认强调色光晕效果
