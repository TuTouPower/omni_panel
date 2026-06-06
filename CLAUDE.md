# OmniUsage

多平台 AI 服务用量监控桌面应用。

## 对标项目

- **参考仓库**：`<参考仓库路径>`（macOS 原生版，Swift + SwiftUI）
- **分析报告**：`<分析报告路径>/UsageBoard_analysis_2026-05-24.md`

## 项目目标

重新实现 UsageBoard 的全部功能，改为 **Electron 桌面端全平台**（Windows / macOS / Linux）。

## 核心功能

集中展示多种 AI 服务的用量和费用：Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily。

## 架构对标

| UsageBoard (原版)               | OmniUsage (本版)                       |
| ------------------------------- | -------------------------------------- |
| Swift 6 + SwiftUI + AppKit      | Electron                               |
| 菜单栏 NSPopover                | 系统托盘（左键=用量面板，右键=设置）   |
| Python 子进程插件               | TypeScript 插件（编译后 Node 子进程）  |
| 插件元数据自描述（注释块 JSON） | 复用该设计模式                         |
| macOS Keychain 凭证存储         | 系统原生 keychain / credential manager |
| PluginSnapshot 数据模型         | 复用核心数据模型                       |

## 关键设计保留

- **插件系统**：TS 源文件 → esbuild 编译为单文件 JS → Electron 内置 Node 子进程执行（`ELECTRON_RUN_AS_NODE=1`），CLI 参数输入、stdout JSON 输出、元数据自描述
- **独立刷新调度**：每个插件独立周期刷新，缓存感知
- **双层架构**：Core 逻辑层与 UI 层分离

## 设计 Demo

`docs/design/omni-usage/` 是前端 UI 设计 demo，仅供参考，**未经用户明确许可绝对禁止修改其中任何文件**。

- 读取、查看：自由。
- 修改、删除、重命名：必须先获得用户确认，否则一律不动。

## 测试要求

测试要做完好的单元测试、集成测试、用户端到端测试，尽量少用 mock，多用真实环境。

- **每个任务完成前必须跑 `pnpm test`**，确认全部通过或已记录已知失败。
- **涉及打包的任务**：必须真实启动打包产物验证（`pnpm package && ./dist/OmniUsage-win32-x64/OmniUsage.exe`），确认渲染进程正常加载、托盘出现、功能可用。
- **涉及 UI 的任务**：必须手工点击操作验证关键路径。
- 自动化通过 ≠ 产物可用。打包 smoke 未验证时不能说"已修复"，只能说"自动化路径通过，packaged 行为未验证"。
- 详细规范见 `docs/test.md`。
