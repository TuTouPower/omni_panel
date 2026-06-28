# OmniUsage

多平台 AI 服务用量监控桌面应用（Electron + React + TypeScript）。

## 核心功能

集中展示多种 AI 服务的用量和费用：Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily、Firecrawl、MiMo、OpenCode Go。

## 设计 Demo

`docs/design/omni-usage/` 是前端 UI 设计 demo，仅供参考，**未经用户明确许可绝对禁止修改其中任何文件**。

- 读取、查看：自由。
- 修改、删除、重命名：必须先获得用户确认，否则一律不动。

## 测试要求

- **每个任务完成前必须跑 `pnpm test`**，确认全部通过或已记录已知失败。
- **涉及打包的任务**：必须真实启动打包产物验证（`pnpm package && ./artifacts/win-unpacked/OmniUsage.exe`）。
- **涉及 UI 的任务**：必须手工点击操作验证关键路径。
- 自动化通过 ≠ 产物可用。打包 smoke 未验证时不能说"已修复"，只能说"自动化路径通过，packaged 行为未验证"。
- 详细规范见 `docs/test.md`。

## Agent skills

### Issue tracker

GitHub Issues (`TuTouPower/omni_usage`), external PRs not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
