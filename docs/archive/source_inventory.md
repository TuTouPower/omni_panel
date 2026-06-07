# 源码清单

> 来源：`<参考仓库路径>`

## UsageBoardCore（纯逻辑层，不依赖 SwiftUI）

| 文件                                                  | 职责                               | 分类 |
| ----------------------------------------------------- | ---------------------------------- | ---- |
| `Sources/UsageBoardCore/Models.swift`                 | 所有数据模型定义                   | Core |
| `Sources/UsageBoardCore/PluginMetadataParser.swift`   | 解析插件脚本头部注释块             | Core |
| `Sources/UsageBoardCore/PluginExecutor.swift`         | 子进程执行插件，捕获 stdout/stderr | Core |
| `Sources/UsageBoardCore/ConfigStore.swift`            | 配置文件读写                       | Core |
| `Sources/UsageBoardCore/PluginStateStore.swift`       | 缓存状态读写                       | Core |
| `Sources/UsageBoardCore/BundledPluginInstaller.swift` | 安装内置插件符号链接               | Core |
| `Sources/UsageBoardCore/PluginDisplayNames.swift`     | 插件显示名去重                     | Core |
| `Sources/UsageBoardCore/JSONCoding.swift`             | JSON 编解码工具                    | Core |
| `Sources/UsageBoardCore/UpdateChecker.swift`          | 应用更新检查                       | Core |
| `Sources/UsageBoardCore/AppRelauncher.swift`          | 应用重启                           | Core |

## UsageBoardApp（UI 层）

| 文件                                                       | 职责                               | 分类 |
| ---------------------------------------------------------- | ---------------------------------- | ---- |
| `Sources/UsageBoardApp/UsageBoardApp.swift`                | App 入口，NSStatusItem + NSPopover | App  |
| `Sources/UsageBoardApp/UsageBoardStore.swift`              | 主 Store，调度/刷新/配置/UI 状态   | App  |
| `Sources/UsageBoardApp/DashboardView.swift`                | 仪表盘 SwiftUI 视图                | App  |
| `Sources/UsageBoardApp/SettingsView.swift`                 | 设置页 SwiftUI 视图                | App  |
| `Sources/UsageBoardApp/AppLocalization.swift`              | 多语言文本                         | App  |
| `Sources/UsageBoardApp/DesignSystem/UBDesignTokens.swift`  | 设计 token                         | App  |
| `Sources/UsageBoardApp/DesignSystem/BrandTile.swift`       | 品牌卡片                           | App  |
| `Sources/UsageBoardApp/DesignSystem/CountdownLabel.swift`  | 倒计时标签                         | App  |
| `Sources/UsageBoardApp/DesignSystem/PlanTag.swift`         | 订阅标签                           | App  |
| `Sources/UsageBoardApp/DesignSystem/AppIconSquircle.swift` | 图标                               | App  |

## Bundled Plugins（内置插件）

| 文件                                                | 职责          | 分类   |
| --------------------------------------------------- | ------------- | ------ |
| `Resources/BundledPlugins/_common.py`               | 插件公共模块  | Plugin |
| `Resources/BundledPlugins/claude-usage-plugin.py`   | Claude 用量   | Plugin |
| `Resources/BundledPlugins/codex-usage-plugin.py`    | Codex 用量    | Plugin |
| `Resources/BundledPlugins/glm-usage-plugin.py`      | 智谱 GLM 用量 | Plugin |
| `Resources/BundledPlugins/minimax-usage-plugin.py`  | MiniMax 用量  | Plugin |
| `Resources/BundledPlugins/deepseek-usage-plugin.py` | DeepSeek 用量 | Plugin |
| `Resources/BundledPlugins/tavily-usage-plugin.py`   | Tavily 用量   | Plugin |

## 其他

| 文件                                  | 职责                                |
| ------------------------------------- | ----------------------------------- |
| `Package.swift`                       | SPM 包定义，swift-tools-version 6.3 |
| `Resources/PluginAuthoringGuide.html` | 插件开发指南                        |
| `Tests/PluginTests/`                  | Python 插件测试                     |
