# 测试规范

> omni_usage 测试的总则与约定。

---

## 1. 测试分层

| 层级           | 目录                    | 框架             | 职责                                                                                                  |
| -------------- | ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| 单元测试       | `tests/unit/`           | Vitest           | 纯函数、工具类、schema 校验、parser 逻辑                                                              |
| 集成测试       | `tests/integration/`    | Vitest           | 能在 Node 环境真实运行的主进程模块（config/cache/scheduler/runner）                                   |
| 用户端到端测试 | `tests/user_e2e/`       | Playwright       | 真实 Electron 实例，**模拟真实用户操作**                                                              |
| 打包 smoke     | `tests/packaged_smoke/` | Playwright + CDP | 验证 `dist/OmniUsage-win32-x64/OmniUsage.exe` 能正常启动、渲染、发现内置插件并覆盖 popup 窗口高度回归 |

三层职责不重叠：

- 单元/集成测试验证**模块正确性**（函数返回值、主进程模块契约）。
- 用户端到端测试验证**功能正确性**：用户看到了 Dashboard、设置了 API Key、点击了刷新看到了数据。
  E2E 不直接调 `window.electronAPI` 绕过 UI，不写脱离用户视角的冒烟测试。
- 打包 smoke 验证**产物可用性**：打包后的 exe 能否启动、渲染进程是否正常加载、托盘是否出现。

---

## 2. 通用原则

- **当前状态**：单元/集成测试有一定覆盖，但 renderer smoke 测试全部使用 mock IPC，**不验证真实 Electron 环境**。
- **少 mock，多真实**：外部服务默认使用本地可控桩；本地能力（插件发现、TS 编译、配置读写、子进程 spawn）真实测试。
- **覆盖完整**：测试要覆盖所有功能、所有 UI 状态（loading / 正常 / 错误 / 空）。
- **E2E 全程真实用户视角**：每个用例都是"用户做了某操作 → 看到某结果"。
- **稳定可复现**：显式等待条件，稳定的 `data-testid` 选择器，每个用例独立且自带配置重置。
- **命名**：测试文件、helper、变量一律 `snake_case`（E2E spec 以 `.spec.ts` 结尾）。

---

## 3. 自动化测试与真实 smoke 边界

自动化测试必须优先守住能稳定复现的产品行为，但不能把自动化通过等同于真实打包产物验收通过。

### 3.1 必须自动化覆盖

- 按钮点击是否触发实际行为（刷新 → 加载中 → 数据更新）。
- 配置读写持久化。
- Dashboard / Settings / Popup 三个视图的渲染和切换。
- provider card 显示、状态展示、错误信息。
- 空状态、加载态、错误态的 DOM 状态。
- CPA UI 回归：主 UI 不显示 CPA provider tab；CPA 数据进入对应 provider；CPA 配置只出现在设置 / 数据源页。

### 3.2 必须真实打包 smoke

以下问题涉及打包产物或 Electron 运行时，自动化只能辅助，不能单独宣称已解决：

- `dist/OmniUsage-win32-x64/OmniUsage.exe` 首次启动。
- 系统托盘真实显示效果、popup 窗口位置。
- Popup 根容器必须填满窗口高度，防止底部 body 背景空白。
- Popup 动态高度（Phase 20）：折叠/展开卡片后窗口实际跟随 `popup:reportContentHeight` 调整大小、不超过 75% 工作区、不出现额外底部留白。自动化只能覆盖控制器纯函数与 ResizeObserver 上报逻辑，真实多显示器/不同 DPI 下的 `setBounds` 行为只能人工验收。
- 渲染进程是否正常加载（白屏即失败）。
- `extraResource` 中的 bundled plugins 是否正确加载。
- ASAR 包内资源路径是否可访问。

修复涉及打包产物的任务时，完成报告必须：自动化测试结果 + 打包后真实启动验证结果。
没有真实 smoke 的，只能写"自动化路径通过，packaged 行为未验证"，不能写"已修复"。

---

## 4. 运行命令

```bash
# 单元 + 集成测试
pnpm test

# 单元测试（子集）
npx vitest run tests/unit

# 集成测试（子集）
npx vitest run tests/integration

# 端到端测试（Playwright，待实现）
pnpm test:e2e

# 打包 + 自动化 smoke
pnpm package
pnpm test:packaged

# 打包后真实启动验证
./dist/OmniUsage-win32-x64/OmniUsage.exe

# Phase 20 手动验收（打包后真实环境）
# 1. 打开托盘主面板，观察窗口高度是否按展开内容自动撑高，无不必要底部空白。
# 2. 折叠总览 provider 卡片，验证窗口高度同步缩小，顶部不往下跳。
# 3. 展开之前折叠的卡片，验证窗口高度恢复。
# 4. 折叠全部可折叠卡片，验证窗口高度停在最小高度，不继续缩小，底部无大片空白。
# 5. 拖动窗口到新位置，再折叠/展开，验证高度变化时保留用户移动后的位置。
# 6. macOS：验证窗口不可通过标题栏拖动。
# 7. Windows/Linux：验证窗口可拖动，拖动后 resize 不吸回托盘。

# Phase 30 手动验收（主面板账号级操作）
# 1. CPA 账号编辑：点击账号卡片菜单 → 编辑 → 设置窗口打开并定位到 CPA 数据源详情页。
# 2. 直接插件账号编辑：点击账号卡片菜单 → 编辑 → 设置窗口打开并定位到该插件编辑弹窗。
# 3. CPA 账号隐藏：点击账号卡片菜单 → 隐藏 → confirm 弹窗 → 确认后该账号从主面板消失，其他账号不受影响，概览聚合不包含已隐藏账号。
# 4. 直接插件账号删除：点击账号卡片菜单 → 删除 → confirm 弹窗 → 确认后该插件配置被删除，对应 scheduler 停止。
# 5. 隐藏账号恢复：打开设置 → 账号页 → "已隐藏的 CPA 账号"区域可见 → 点击恢复按钮 → 账号重新出现在主面板。
# 6. 启用/禁用切换：设置页 Toggle 正确切换插件 enabled 状态，禁用后主面板不再显示该插件账号。
# 7. 账号菜单不干扰折叠：点击账号菜单按钮不触发卡片折叠/展开。

# 类型检查
pnpm typecheck

# Lint
pnpm lint
```

---

## 5. 覆盖率

```bash
# 运行测试并生成覆盖率报告
pnpm test:coverage
```

### 查看 HTML 报告

```bash
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

### 当前阈值

| 指标       | 阈值 |
| ---------- | ---- |
| Statements | 1%   |
| Branches   | 22%  |
| Functions  | 20%  |
| Lines      | 1%   |

> 基线日期：2026-05-30。阈值 = 基线 - 5%。
> 详细基线数据见 `docs/coverage-baseline.md`。

---

## 6. 任务完成验证清单

每个任务完成前必须通过：

1. [ ] `pnpm typecheck` 通过
2. [ ] `pnpm lint` 通过
3. [ ] `pnpm test` 全部通过（或已记录已知失败）
4. [ ] 涉及打包/渲染的任务：真实启动打包产物验证
5. [ ] 涉及 UI 的任务：手工点击操作验证关键路径
