# OmniUsage

多平台 AI 服务用量监控桌面应用（Electron + React + TypeScript）。一处看全 Claude / Codex / Antigravity / Kimi / 智谱 GLM / MiniMax / DeepSeek / Tavily / Firecrawl / MiMo / OpenCode Go 的用量与费用。

> 文档真相在 `docs/omni_powers/op_blueprint/`（omni_powers 工作流）。本文件是门牌，不重复 blueprint 内容。

## 常用命令

```bash
pnpm install          # 装依赖
pnpm start            # 开发（electron-vite dev）
pnpm build            # 构建
pnpm package          # 打包 + 启动产物（scripts/package-and-run.ts）
pnpm make:win         # 仅打包 Windows
pnpm test             # vitest 单元 + 集成
pnpm test:e2e         # Playwright E2E
pnpm test:packaged    # 打包 smoke
pnpm check            # typecheck + lint + format + deadcode + arch
```

打包产物：`artifacts/win-unpacked/OmniUsage.exe`。

## 文档导航（docs/omni_powers/op_blueprint/）

- `prd.md` — 产品需求 / 定位 / 明确不做
- `architecture.md` — 技术栈 / 目录 / 模块 / 数据流 / 安全边界（**唯一架构真相**）
- `domain.md` — 术语表 / 业务不变量
- `conventions.md` — 命名 / 风格 / 日志 / 新增连接器步骤
- `test.md` — 测试分层 / 覆盖 / 打包 smoke / 调试入口（CDP 端口等）
- `spec_index.md` — 已实现功能清单 → `specs/{feature}.md`

工作流：`/opintake "<需求>"` 新需求 → `/oprun` 续跑 → `/opstatus` 看状态。

## 项目约束

- **测试纪律**：每任务完成前 `pnpm test`；涉及打包须真实启动产物验证；涉及 UI 须手工点击关键路径。自动化通过 ≠ 产物可用。详见 `test.md`。

## Agent 约定

- **Issue tracker**：GitHub Issues (`TuTouPower/omni_usage`) 是唯一 triage surface，external PRs 不算。
- **Triage labels**：默认五角色（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）。
- **工作流**：omni_powers 三区（`docs/omni_powers/`）—— `op_blueprint/`（稳定真相）/ `op_execution/`（在做的事）/ `op_record/`（归档）。新需求走 `/opintake`。
