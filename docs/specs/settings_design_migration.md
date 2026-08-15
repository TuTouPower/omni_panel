# settings_design_migration

设置窗口统一使用设计系统组件与语义 token。`SettingsView` 的业务行为与数据结构见 [`ui-views-web.md`](ui-views-web.md)，本文定义设置窗口视觉、控件语义和样式约束。

## 设计范围

- `general`、`accounts`、`appearance`、`data`、`about` 全部分区使用 `ui/*` 控件和语义 token。
- 现有设置读写、账户增删改、密钥回填与脱敏、CPA 管理、添加账号和标签映射流程保持不变。
- 账户相关对话框统一使用 `Dialog`、`Button`、`Input` 等共享控件；对话框提供稳定的 dialog 语义、模态标记和可访问名称。
- 五档强调色、用量条细线/粗胶囊样式、三种用量条配色方案和三档主题保持可用。

## 交互语义

- 设置侧栏包含常规、账号、外观、数据与隐私、关于五个分区。
- 当前分区使用 `aria-current="page"`，显示 primary-container 背景、accent 文字和 accent 图标；悬停样式不覆盖当前分区状态。
- 分段控件的每个选项使用 `aria-pressed` 表示当前值；可切换设置按钮使用相同语义表达选中状态。
- 统一 `Dialog` 首帧直接呈现稳定状态，不依赖已删除的窗口专属入场动画或旧窗口 DOM 类名。

## 样式约束

- 设置窗口专属手写控件 CSS 类及其残留引用全部删除；仍被使用的结构布局规则可以保留。
- 颜色、背景、边框、焦点环和状态样式通过语义 token 表达；组件代码不增加 `dark:` 分支。
- 明暗主题由全局语义 token 提供值，设置分区和共享控件不直接写主题分支。
- 侧栏与窗口外壳同底 `surface-window`（t406）；禁止面板级 `color-mix(window, surface)` 混色底。详见 [`surface_token_unify.md`](surface_token_unify.md)。

## 验证

- Web SPA 使用 Chromium 验证设置分区、用户选项、对话框和语义状态。
- Desktop 使用真实 Electron 验证设置窗口及账户流程。
- 视觉逐屏对照属于人工验收，自动化测试不替代迁移前后截图对照。
