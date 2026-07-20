# 测试指南

OmniUsage 测试命令、分层、覆盖率与打包 smoke 指南。硬约束入口见 `AGENTS.md`；测试规范（命名、层级、回归）见 `docs/blueprint/conventions.md` “编码与测试”小节。

## 运行命令

```bash
pnpm test                 # 单元 + 集成（vitest run）
pnpm test:coverage        # 覆盖率
pnpm test:e2e             # Playwright 用户 E2E
pnpm package              # 打包
pnpm test:packaged        # 打包 smoke（CDP）
./artifacts/win-unpacked/OmniUsage.exe   # 打包后真实启动
pnpm test:contract:live   # 连接器 live 契约测试（打真实上游）
pnpm typecheck && pnpm lint && pnpm check
```

调试入口：打包 smoke 经 CDP 连 Electron 渲染进程；连接器脚本日志打 `connector-sandbox` logger。

## 测试分层

| 层级       | 目录                  | 框架             | 职责                                                                                      |
| ---------- | --------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| 单元       | `tests/unit/`         | Vitest           | 纯函数、工具、schema 校验、parser、连接器解析逻辑                                         |
| 集成       | `tests/integration/`  | Vitest           | Node 环境可真实运行的主进程模块（config/cache/scheduler/runtime/vault/observation-store） |
| 用户 E2E   | `tests/e2e/specs/`    | Playwright       | 真实 Electron 实例，模拟真实用户操作（`.spec.ts`）                                        |
| 打包 smoke | `tests/e2e/packaged/` | Playwright + CDP | 验证 `artifacts/win-unpacked/OmniUsage.exe` 启动、渲染、发现内置连接器、popup 高度回归    |

三层职责不重叠：

- 单元/集成验证**模块正确性**（返回值、主进程模块契约）。
- E2E 验证**功能正确性**：用户看到 Dashboard、填了 API Key、点了刷新看到数据。**不直接调 `window.usageboard` 绕过 UI**。
- 打包 smoke 验证**产物可用性**：exe 能否启动、渲染是否白屏、托盘是否出现、`extraResource` 连接器是否加载。

## 通用原则

- **少 mock，多真实**：外部服务用本地可控桩；本地能力（连接器发现、TS 编译、配置读写、SQLite、cookie 捕获）真实测。
- **覆盖完整**：覆盖所有功能与所有 UI 状态（loading / 正常 / 错误 / 空）。
- **稳定可复现**：显式等待条件，稳定 `data-testid` 选择器，用例独立自带配置重置。
- **命名** `snake_case`，E2E spec 以 `.spec.ts` 结尾。
- **断言期望行为**：测试断言“应该怎样”，不锁死历史错误行为。

## 必须自动化覆盖

- 按钮点击触发实际行为（刷新 → 进入加载 → 数据更新/失败后结束加载）。
- 刷新重试契约：script / poll / probe / 观测写库失败最多尝试 3 次，任一次成功即 ready，三次均失败才 failed；session auth 错误每轮最多触发一次重新登录，登录失败不跳过剩余尝试。
- 配置读写持久化；连接器参数链路：填 secret → 存 vault → 刷新 → 脚本经 `ctx` 收到参数 → UI 显示数据。
- Dashboard / Settings / Popup 三视图渲染与切换；provider card 状态与错误信息。
- 用量条 UI 回归：细线型/粗胶囊型在概览/单账号/多账号视图行间距列结构一致。
- 空/加载/错误态 DOM。
- CPA UI 回归：主 UI 无 CPA provider tab；CPA 数据进对应 provider；CPA 配置只在设置/数据源页。
- CPA 保存回归：无变化不持久化；备注/刷新间隔不立即采集；管理密钥、CPA-Manager URL、monitor 变化仅刷新当前 CPA；保存成功立即返回账号列表，保存失败保留详情页。
- Scheduler 回归：非调度配置和插件排序变化不重建；有效计划变化才 deferred rebuild；user/system 暂停原因交错时互不解除，暂停期间配置变化不得启动 scheduler。

## 必须真实打包 smoke

自动化不能单独宣称已解决：

- `OmniUsage.exe` 首次启动；托盘真实显示、popup 位置。
- Popup 根容器填满窗口高度（防底部背景空白）；动态高度跟随 `popup:reportContentHeight`、不超 75% 工作区、无额外底部留白（多显示器/DPI 下 `setBounds` 只能人工验收）。
- 渲染进程正常加载（白屏即失败）；ASAR 内资源路径可访问。

修复涉及打包产物的任务，完成报告必须含：自动化结果 + 打包真实启动验证结果。没有真实 smoke 只能写“自动化路径通过，packaged 行为未验证”，不能写“已修复”。

## 覆盖率阈值

| 指标       | 阈值 |
| ---------- | ---- |
| Statements | 15%  |
| Branches   | 25%  |
| Functions  | 25%  |
| Lines      | 15%  |

> 基线日期 2026-05-30，阈值 = 基线 − 5%。

## 任务完成验证清单

1. [ ] `pnpm typecheck` 通过
2. [ ] `pnpm lint` 通过
3. [ ] `pnpm test` 全部通过（或记录已知失败）
4. [ ] 涉及打包/渲染：真实启动打包产物验证
5. [ ] 涉及 UI：手工点击关键路径验证
