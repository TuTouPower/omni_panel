# OmniUsage

多平台 AI 服务用量监控桌面应用。

## 对标项目

- **参考仓库**：`<参考仓库路径>`（macOS 原生版，Swift + SwiftUI）
- **分析报告**：`~/testuser_ubuntu/my_skills/analyze-repo/report/UsageBoard_analysis_2026-05-24.md`

## 项目目标

重新实现 UsageBoard 的全部功能，改为 **Electron 桌面端全平台**（Windows / macOS / Linux）。

## 核心功能

集中展示多种 AI 服务的用量和费用：Claude、OpenAI Codex、智谱 GLM、MiniMax、DeepSeek、Tavily。

## 架构对标

| UsageBoard (原版) | OmniUsage (本版) |
|---|---|
| Swift 6 + SwiftUI + AppKit | Electron |
| 菜单栏 NSPopover | 系统托盘 + 独立窗口 |
| Python 子进程插件 | 同样支持插件化（语言待定） |
| 插件元数据自描述（注释块 JSON） | 复用该设计模式 |
| macOS Keychain 凭证存储 | 系统原生 keychain / credential manager |
| PluginSnapshot 数据模型 | 复用核心数据模型 |

## 关键设计保留

- **插件系统**：子进程隔离 + JSON 协议 + 元数据自描述
- **独立刷新调度**：每个插件独立周期刷新，缓存感知
- **双层架构**：Core 逻辑层与 UI 层分离
