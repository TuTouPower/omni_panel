# OmniUsage

> 一处看全多家 AI 服务的用量、额度与费用。常驻桌面进程，跨 Windows / macOS / Linux。

把分散在各家控制台 / 本地凭证 / 网页后台的 AI 用量数据集中读出来、统一展示，如实标注每条数字的来源与新鲜度。对标 macOS 原生版 UsageBoard。

## 目标用户

同时用多家 AI 服务（Claude、Codex、GLM、MiniMax…）的重度用户与团队。痛点：额度分散在各家控制台/本地凭证/网页后台，无法一眼看清“哪个账号快用完了”。

## 支持的连接器

12 个内置连接器，覆盖四种采集模式：

| 连接器      | 类型            | 采集方式                                                        |
| ----------- | --------------- | --------------------------------------------------------------- |
| Claude      | 本地凭证型      | 读取 `~/.claude`                                                |
| Codex       | 本地凭证型      | 读取 `~/.codex` 会话日志                                        |
| Antigravity | 聚合代理（CPA） | 经 CPA-Manager 代拉                                             |
| Kimi        | 聚合代理（CPA） | 经 CPA-Manager 代拉                                             |
| 智谱 GLM    | 官方 API 轮询   | 余额接口                                                        |
| MiniMax     | 官方 API 轮询   | 余额接口                                                        |
| DeepSeek    | 官方 API 轮询   | 余额接口                                                        |
| Tavily      | 官方 API 轮询   | 余额接口                                                        |
| Firecrawl   | 官方 API 轮询   | 余额接口                                                        |
| MiMo        | 网页登录型      | 受控窗口捕获 Cookie                                             |
| OpenCode Go | 网页登录型      | 受控窗口捕获 Cookie                                             |
| CPA-Manager | 聚合代理        | 一份管理密钥代拉 Claude×N + Codex×N + Antigravity + Kimi 多账号 |

配套能力：多账号、账号级隐藏、provider 聚合概览、明暗主题、代理、自定义刷新间隔、数据标签映射、配置导入导出、系统托盘、悬浮 / 弹出两种主面板形态。

## 成功标准

- 每条展示的数字都能追溯到 `observedAt`（观测时刻）+ `source`（来源）。
- 采集失败保留上次成功数据并明确标 stale，绝不把旧数据装成新的。
- CPA 单账号失败不拖垮同渠道其他账号（错误归属到账号，不到渠道）。
- 多账号 provider 概览用 `sum(used)/sum(limit)` 聚合，不对百分比取平均。
- 密钥默认不出主进程；用量面板/托盘不拉密钥；日志强制脱敏。

## 安装

### 方式一：下载安装包（推荐）

到 [Releases](https://github.com/TuTouPower/omni_usage/releases) 下载对应平台的安装包：

- Windows：`OmniUsage-Setup-x.y.z.exe`（NSIS 安装器）
- macOS：`OmniUsage-x.y.z.dmg` / `.zip`（x64 + arm64）
- Linux：`OmniUsage-x.y.z.AppImage` / `.deb` / `.rpm`

### 方式二：从源码构建

```bash
pnpm install          # 装依赖
pnpm start            # 开发（electron-vite dev）
pnpm package          # 打包 + 启动产物
pnpm make:win         # 仅打包 Windows 安装器
pnpm make:mac         # 仅打包 macOS
pnpm make:linux       # 仅打包 Linux
```

打包产物路径：`artifacts/`。

## 隐私

- **完全本地运行**，无任何遥测、无上报、无云端依赖
- 密钥存于本地 AES-256-GCM 加密 Vault（`{userData}/secrets.vault`），主密钥独立文件 `vault.key`
- 渲染进程永远只拿 `hasSecret` 布尔，**不见明文密钥**
- 配置导入导出含明文密钥，用户自行负责导出文件的安全（详见 [secret-vault spec](docs/specs/secret-vault.md)）
- 网络请求仅由主进程宿主统一发出（[net-client](src/main/core/connector/net-client.ts)），连接器沙箱无直接出网能力
- LocalAPI 仅监听 `127.0.0.1`，绝不变成通用开放代理

## 开发

```bash
pnpm install          # 装依赖
pnpm check            # typecheck + lint + format + deadcode + arch
pnpm test             # vitest 单元 + 集成
pnpm test:e2e:web     # Playwright 测 web SPA（chromium, mock 后端, 日常）
pnpm test:e2e:electron # Playwright Electron 驱动（专属能力, 手动跑）
pnpm test:packaged    # 打包 smoke
```

详见 [测试指南](docs/guides/testing.md)。

## 架构与文档

技术栈：Electron + React + TypeScript + better-sqlite3 + undici + Zod。

文档结构以 [`AGENTS.md`](AGENTS.md) 为行为入口，真相分层放 `docs/`：

- [`AGENTS.md`](AGENTS.md) — agent 行为入口与按需导航（目录与读写规则、单 task 流程、硬约束）
- [`docs/blueprint/architecture.md`](docs/blueprint/architecture.md) — 技术栈 / 目录 / 模块 / 数据流 / 安全边界（**唯一架构真相**）
- [`docs/blueprint/domain.md`](docs/blueprint/domain.md) — 术语表 / 业务不变量 / 产品边界（明确不做）
- [`docs/blueprint/conventions.md`](docs/blueprint/conventions.md) — 命名 / 风格 / 日志 / 测试 / 新增连接器步骤
- [`docs/blueprint/decisions.md`](docs/blueprint/decisions.md) — 已确认的非显然决策（ADR）
- [`docs/specs_index.md`](docs/specs_index.md) — 已实现功能清单 → `docs/specs/<slug>.md`
- [`docs/guides/testing.md`](docs/guides/testing.md) — 测试命令 / 分层 / 覆盖率 / 打包 smoke

## 已知限制

- **不自动检查更新**（占位 UI，未实现）
- **不做趋势图**（SQLite 留了历史数据，但首版不出图）
- **不做系统钥匙串 / safeStorage**（自管 Vault，威胁模型见 [secret-vault.md](docs/specs/secret-vault.md)）
- **不为第三方开放沙箱脚本连接器**（`node:vm` 非真隔离）
- 界面语言切换、问卷、赞助入口为占位 UI，未落地

## License

[AGPL-3.0-only](LICENSE) © tutoupower
