# legacy_css_cleanup

Renderer 窗口统一使用设计 token、共享 ui 组件与 Tailwind utility，业务组件不再依赖跨窗口手写 CSS 类。

## 样式体系

- 全局样式入口只保留 token、基础规则、必要动画和可复用 `@utility`；组件级业务选择器不在全局样式中定义。
- 共享组件只消费语义 token 与 utility，不通过组件级手写类或 `dark:` 分支表达主题差异。
- 明暗主题和 accent 由同一套语义 token 提供，Web 与 Desktop 使用一致的视觉入口。
- 会话窗口历史 BEM 风死类名（`conversation-*` / `session-*` / `library-*` / `selection-*` / `preview-*` 前缀且无 CSS 定义）已清零（t419）；测试挂钩迁 `data-testid`，拖拽态用 `data-dragging` / `data-drop-target`。无定义裸 class 状态钩（如 `collapsed` / `expanded` / `selected` / `on`）不在清零范围。

## 图标与资产

- 操作和导航图标来自 `lucide-react`。
- Vendor logo、品牌 mark 和数据可视化 SVG 作为专用资产保留，并由对应组件负责主题适配。
- 旧手绘操作图标不保留实现或引用。

## Web 与 Desktop

- Web 与 Desktop 复用同一套 token 和共享组件形态。
- Web 设置支持三档主题与五档 accent 的即时切换和刷新恢复。
- 视觉像素级一致性仍需人工对照，自动化测试覆盖可观察交互与状态保持。

## 验证

- 静态门禁覆盖类型检查、lint、格式、deadcode、架构依赖和设计 token drift。
- 单元测试、Web E2E、Electron E2E 与 packaged smoke 覆盖组件行为、主题交互、窗口启动和打包运行。
