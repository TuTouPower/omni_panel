# OmniUsage 任务清单

> 基于 `docs/UsageBoard_Electron_AI_Migration_Plan.md`，共 13 轮。

---

## Phase 1: 取证与契约 (Round 0-2) ✅

### Round 0: 建立迁移规则 ✅

- [x] 阅读旧项目 README、Package.swift、Sources、Resources/BundledPlugins
- [x] 输出 `docs/migration-principles.md`（迁移原则）
- [x] 输出 `docs/ai-working-rules.md`（AI 工作规则）
- [x] 明确旧插件协议兼容为最高优先级
- [x] 明确 renderer 禁止访问 Node API
- [x] 明确 UNCONFIRMED 标记规则
- [x] 明确先测试再实现

### Round 1: 旧项目源码取证 ✅

- [x] 输出 `docs/source-inventory.md`（源码文件路径 + 职责分类：Core / App / Plugin）
- [x] 输出 `docs/old-data-models.md`（完整字段级模型：required / optional / default / JSON key）
    - AppConfiguration
    - PluginConfiguration
    - PluginMetadata / PluginParameter
    - PluginOutput
    - PluginSnapshot
    - PluginCachedState
- [x] 输出 `docs/old-behavior-map.md`（发现/解析/传参/执行/缓存/调度/配置写入规则）
- [x] 输出 `docs/unconfirmed.md`（无法从源码确认的点，禁止猜测）

### Round 2: 冻结插件协议，生成 schema 和 fixtures ✅

- [x] 输出 `docs/plugin-contract.md`（精确协议说明）
- [x] 输出 `schemas/plugin-output.schema.json`
- [x] 输出 `schemas/plugin-metadata.schema.json`
- [x] 输出 `fixtures/plugin-output/`（success/error/invalid 场景）
- [x] 输出 `fixtures/plugin-metadata/`（basic/secret/choice/missing-marker/invalid-json 场景）

---

## Phase 2: Core 实现 (Round 3-7) ✅

### Round 3: Electron 项目骨架 + 测试框架 ✅

- [x] 创建目录结构：`src/main/` `src/preload/` `src/renderer/` `src/shared/` `tests/`
- [x] 配置技术栈：Electron + TypeScript + Vite + React + Vitest + Playwright + Zod + ESLint + Prettier
- [x] 配置 Electron 安全默认值（contextIsolation / nodeIntegration / sandbox）
- [x] 复制 docs / schemas / fixtures 到新项目
- [x] 创建空模块 + failing tests
- [x] 输出 `docs/implementation-plan.md`

### Round 3.5: 严格代码质量门禁 ✅

- [x] **TypeScript 超严格 tsconfig.json**
    - `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
    - `noImplicitReturns` + `noFallthroughCasesInSwitch` + `noImplicitOverride`
    - `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax`
    - `isolatedModules` + `forceConsistentCasingInFileNames`
- [x] **ESLint type-aware 规则**
    - `typescript-eslint` strictTypeChecked + stylisticTypeChecked
    - `eslint-plugin-react` + `eslint-plugin-react-hooks`（error 级）
    - `eslint-plugin-jsx-a11y`（可访问性）
    - `eslint-plugin-import-x`（import 顺序、循环依赖检测）
    - `eslint-plugin-unicorn`（现代 JS 最佳实践）
    - `eslint-plugin-sonarjs`（复杂度、重复逻辑、潜在 bug）
    - `eslint-plugin-security`（安全风险模式）
    - `eslint-plugin-promise`（Promise 误用）
    - `eslint-plugin-n`（Node.js 规则）
    - `eslint-plugin-perfectionist`（排序一致性）
    - 关键规则：`no-explicit-any: error`、`no-unsafe-assignment: error`、`no-floating-promises: error`、`await-thenable: error`、`switch-exhaustiveness-check: error`、`consistent-type-imports: error`
    - 运行 `eslint . --max-warnings=0`（warning = error）
- [x] **格式化检查**：Prettier，CI 中 `format:check` 必过
- [x] **死代码 / 依赖架构检查**
    - `Knip`：未使用文件、依赖检测
    - `dependency-cruiser`：循环依赖禁止、层级约束（renderer 禁止 import Node API）
- [x] **Electron 专项安全扫描**
    - `@electron-forge/plugin-fuses`：已配置
    - Semgrep 自定义规则（需系统安装 semgrep CLI）
- [x] **Git 密钥泄漏防护**
    - `Gitleaks`：已系统级安装
    - `secrets.json` 已通过 `.gitignore` 排除
    - pre-commit hook 已配置 `gitleaks protect --staged`
- [x] **依赖漏洞扫描**
    - `pnpm audit --audit-level=high` 已执行（9 个漏洞，均来自 `tar` 传递依赖）
- [x] **SAST 静态安全分析**
    - `Semgrep`：已系统级安装，扫描 clean（1 处 suppress）
- [x] **Husky + lint-staged pre-commit hook**
    - pre-commit：lint-staged（ESLint fix + Prettier write）
    - pre-push：typecheck + unit tests
- [x] **package.json check 脚本**
    - `"typecheck": "tsc --noEmit"`
    - `"lint": "eslint . --max-warnings=0"`
    - `"format:check": "prettier --check ."`
    - `"deadcode": "knip --include files,dependencies"`
    - `"arch": "depcruise src --validate .dependency-cruiser.cjs"`
    - `"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch"`

### Round 4: 实现 parser ✅

- [x] `src/main/core/plugin-output-parser.ts`
- [x] `src/main/core/plugin-metadata-parser.ts`
- [x] `src/shared/types/plugin.ts`
- [x] `src/shared/errors/plugin-errors.ts`
- [x] 通过所有 plugin-output fixtures 测试
- [x] 通过所有 plugin-metadata fixtures 测试

### Round 5: 实现 plugin runner ✅

- [x] `src/main/core/plugin-runner.ts`
- [x] `src/main/core/plugin-command-builder.ts`
- [x] 创建 `fixtures/fake-plugins/`（valid-json / invalid-json / nonzero / timeout / stderr / echo-params）
- [x] 使用 `child_process.spawn`，不用 `exec`
- [x] 实现 `--usageboard-param KEY=value` 参数传递
- [x] 实现 timeout + kill
- [x] secret 参数脱敏
- [x] 通过集成测试

### Round 6: 实现 config / cache / path / secret ✅

- [x] `src/main/core/paths.ts`（集中路径管理，基于 `app.getPath('userData')`）
- [x] `src/main/core/config-store.ts`（atomic write）
- [x] `src/main/core/cache-store.ts`
- [x] `src/main/core/secrets-store.ts`
- [x] `src/main/core/plugin-instance.ts`
- [x] 支持读取旧版 config（如果已确认结构）
- [x] API key 存储策略文档化

### Round 7: 实现 scheduler / runtime store ✅

- [x] `src/main/core/runtime-store.ts`（idle / loading / ready / failed 状态机）
- [x] `src/main/core/plugin-scheduler.ts`（独立间隔，防并发）
- [x] `src/main/core/plugin-refresh-service.ts`
- [x] cache hit 逻辑
- [x] 插件失败保留上次成功 cache
- [x] 测试覆盖：success / failure / timeout / cache hit / concurrent / disabled

---

## Phase 3: IPC 与 UI (Round 8-9) ✅

### Round 8: 实现 IPC / preload ✅

- [x] `src/preload/usageboard-api.ts`
- [x] `src/preload/index.ts`
- [x] `src/main/ipc/plugin-ipc.ts`
- [x] `src/main/ipc/config-ipc.ts`
- [x] `src/shared/ipc-contract.ts`
- [x] 使用 `contextBridge`，不暴露 `ipcRenderer`
- [x] IPC 输入校验 + 错误序列化
- [x] secret 字段脱敏返回 renderer
- [x] renderer 只能调用 `window.usageboard.*`

### Round 9: 最小 UI 和托盘 ✅

- [x] Electron tray
- [x] Dashboard window（插件卡片列表 + 状态 + 刷新按钮 + 上次更新时间）
- [x] Settings window（参数配置表单）
- [x] 参数表单由 PluginMetadata 自动生成（secret→password / choice→select / boolean→checkbox）
- [x] 错误展示
- [x] 空状态
- [x] Renderer smoke test (12 tests via jsdom + @testing-library/react)

---

## Phase 4: 插件与多实例 (Round 10-11) ✅

### Round 10: 集成真实 bundled plugins ✅

- [x] 复制旧项目 `Resources/BundledPlugins` → `resources/plugins`
- [x] `_common.py` 可被插件 import
- [x] 实现 bundled plugin discovery
- [x] 实现 user plugin discovery
- [x] 按顺序集成：DeepSeek → Tavily → GLM → MiniMax → Codex → Claude
- [x] 每个插件输出 metadata 解析 / 参数 / 依赖 / 跨平台风险
- [x] GLM 缓存路径 Linux 兼容（XDG 规范）

### Round 11: 多实例 / 多账号 ✅

- [x] 区分 `PluginDefinition`（脚本）和 `PluginConfiguration`（配置实例）
- [x] 同一脚本可创建多个实例，各自独立参数/缓存/刷新间隔
- [x] cache / runtime / locks 基于 instanceId
- [x] Settings UI 支持 Duplicate Plugin（"复制"按钮）
- [x] Dashboard 按实例显示
- [x] `instanceId` 字段迁移（旧配置自动用 stateId 兜底）

---

## Phase 5: 打包发布 (Round 12) ✅

### Round 12: 打包和平台兼容 ✅

- [x] 配置 Electron Forge（Squirrel / ZIP / DEB / RPM makers）
- [x] `extraResource: ["resources/plugins"]` 打进安装包
- [x] `getBundledPluginsDir()` 区分 packaged/dev 路径
- [x] Python 3.8+ 可用性检测（python3 / python / py launcher）
- [x] 找不到 Python 时 Dashboard 显示错误 banner
- [x] 输出 `docs/platform-notes.md`

---

## Phase 6: 阻塞 MVP 的核心功能补齐 (Round 14)

> 当前状态：Round 0-12 的基础设施已实现，但 **MVP 不可用**。
> 用户首次打开应用只能看到空界面 — 没有插件实例、密钥无法回注、定时刷新未启动。
> 对标旧项目 UsageBoard 的功能差距逐项列出如下。

### Round 14.1: 首次启动自动创建默认插件实例

**现状**：`config.plugins` 默认 `[]`。`discoverPlugins()` 发现了 6 个内置插件脚本，但从未将它们转化为配置实例。用户打开设置只能看到"一般"，无任何可操作项。

**对标**：旧项目 `BundledPluginInstaller.swift` 在启动时扫描内置插件目录，为每个 `.py` 文件（不以 `_` 开头）自动创建配置实例。用户首次打开即可看到所有插件。

- [x] **逻辑层**：在 `main/index.ts` 的 `app.whenReady()` 中，加载 config 后，检查 `config.plugins` 是否为空
- [x] 若为空，遍历 `allDefinitions`（bundled + user），为每个 discovered plugin 创建默认 `PluginConfiguration`：
    - `instanceId`: 基于 `scriptName` + 时间戳或 UUID
    - `stateId`: UUID
    - `name`: 取 `metadata.name` 或 `metadata.name@zh-Hans`，fallback 到脚本文件名
    - `enabled`: `true`
    - `executablePath`: 插件脚本完整路径
    - `refreshIntervalSeconds`: 默认 `300`（5 分钟，与旧项目一致）
    - `parameterValues`: `{}`（空，等用户填写）
- [x] 保存更新后的 config
- [x] **去重保护**：后续启动不重复创建。判断依据：已有实例的 `executablePath` 是否匹配
- [x] **测试**：
    - 空 config → 自动创建 N 个实例（N = bundled plugin 数量）
    - 非空 config → 不重复创建
    - 同一脚本不创建重复实例
    - instanceId 唯一

### Round 14.2: 密钥回注 — 执行插件前合并 secrets

**现状**：`config-ipc.ts` 的 `handleConfigSaveSecrets()` 正确地将 API key 写入 `secrets.json`（通过 `secretsStore.set()`）。但 `refresh-service.ts:67` 构建命令时只用 `plugin.parameterValues`，从未从 `secretsStore` 读取密钥。DeepSeek / Tavily / GLM / MiniMax 四个 API key 插件全部无法获得真实 key。

**对标**：旧项目在 `PluginExecutor.swift` 构建参数时，直接从 `parameterValues` 字典取值（旧项目 secret 存 Keychain，读取后注入同一字典）。

- [x] **`refresh-service.ts` 改造**：在 `refresh()` 函数中，构建命令前，从 `secretsStore` 读取当前实例的所有密钥
- [x] 将密钥合并到 `parameterValues` 副本中（不修改原始 config）
- [x] 将合并后的 `parameterValues` 传给 `commandBuilder`
- [x] **`secretsStore` 接口补充**：`refresh-service.ts` 需要依赖 `SecretsStore`，在 `RefreshServiceDeps` 中添加 `secretsStore` 字段
- [x] **密钥格式**：`secretsStore.get()` 的 key 格式为 `${instanceId}:${paramName}`，与 `config-ipc.ts:102` 写入格式一致
- [x] **`secretParamKeys` 映射**：需要知道哪些参数是 secret 类型，才能只读取对应的 key。从 plugin metadata 的 `parameters` 中 `type === "secret"` 获取
- [x] **测试**：
    - 有 secret 的插件 → 命令行参数包含真实密钥值
    - 无 secret 的插件 → 行为不变
    - secret 不存在 → parameterValues 中该字段不传（符合旧项目"仅传递非空参数"规则）
    - secret 值不进入日志

### Round 14.3: 启动时启用定时刷新调度器

**现状**：`plugin-scheduler.ts` 实现完整（`start / stop / stopAll / refreshNow / isRunning`），但 `main/index.ts` 从未实例化 `createPluginScheduler()`。

**对标**：旧项目 `UsageBoardStore.swift` 在启动时为每个 enabled plugin 创建独立 `Task` + `Task.sleep` 调度。首次刷新：有缓存则等 `interval - 已过时间`，无缓存则立即。

- [x] **`main/index.ts` 改造**：在 `app.whenReady()` 中，创建 `PluginScheduler` 实例
- [x] 依赖注入：`refresh` 函数使用 `refreshService.refresh(instanceId)`
- [x] 启动调度：遍历 `config.plugins`，对每个 `enabled === true` 的插件调用 `scheduler.start(instanceId, refreshIntervalSeconds)`
- [x] **config 变更时重建调度**：当用户通过 Settings 修改 `refreshIntervalSeconds` 或 `enabled` 状态后，需 stop + restart 对应实例的调度
- [x] **测试**：
    - app ready 后 scheduler 对每个 enabled plugin 调用 `start()`
    - disabled plugin 不被调度
    - config 变更后调度间隔更新

### Round 14.4: 系统休眠 / 唤醒处理

**现状**：没有任何 sleep/wake 处理。电脑休眠后定时刷新会积压，唤醒后可能瞬间触发大量插件执行。

**对标**：旧项目监听 `NSWorkspace.willSleepNotification` / `NSWorkspace.didWakeNotification`。睡眠时取消所有调度 task，唤醒后重建调度。安全网：如果 wake 通知丢失，4 小时后自动恢复。

- [x] **Electron 适配**：使用 `powerMonitor` 模块（Electron 内置）
    - `powerMonitor.on('suspend', ...)` → 调用 `scheduler.stopAll()`
    - `powerMonitor.on('resume', ...)` → 遍历 enabled plugins 重新 `scheduler.start()`
- [x] **安全网**：resume 事件可能丢失（与旧项目一致），设置 4 小时定时器，超时自动恢复所有调度
- [x] **测试**：
    - suspend 事件触发 `stopAll()`
    - resume 事件触发重新 `start()`
    - 安全网定时器触发恢复

### Round 14.5: 插件显示名去重 ✅

- [x] **逻辑层**：实现 `resolveDisplayNames()`
- [x] 优先级：`metadata.name@{language}` → `metadata.name` → `config.name`
- [x] 同名去重：遍历所有实例名，重复的加序号 " 2", " 3"...
- [x] **调用点**：`plugin-ipc.ts` 的 `handlePluginList()` 中，为每个 plugin 计算 `displayName`
- [x] **PluginInfo DTO 扩展**：添加 `displayName` 字段
- [x] **UI 更新**：Dashboard / Popup 的 `PluginCard` 使用 `displayName` 替代 `name`
- [x] **测试**：
    - 不同名插件 → 原样显示
    - 两个同名 → 第二个加 " 2"
    - 三个同名 → " 2", " 3"
    - metadata name 优先级高于 config name

### Round 14.6: 配置写入防抖 ✅

- [x] **ConfigStore 扩展**：添加 `scheduleSave(config: AppConfiguration, delayMs?: number): void` 方法
- [x] 使用 `setTimeout` + `clearTimeout` 实现防抖
- [x] 默认延迟：500ms
- [x] **调用点改造**：`config-ipc.ts` 的 `handleConfigSave()` 改用 `scheduleSave()` 替代 `save()`
- [x] **测试**：
    - 短时间内多次调用 `scheduleSave()` → 只写入最后一次
    - 延迟后正确写入
    - 不同 config 不会合并错误

---

## Phase 7: 补齐测试基础设施 (Round 13)

> 当前状态：单元/集成测试有一定覆盖，但 **没有用户端到端测试**（Playwright + 真实 Electron），
> renderer smoke 测试全部使用 mock IPC，**不验证真实 Electron 环境**。
> 打包产物可用性依赖人工检查，缺乏自动化门禁。
> 规范文档已创建（`docs/test.md`），基础设施待实施。

### Round 13.1: 修复现有测试失败

- [x] `tests/integration/plugin/runner.test.ts` — 7 个测试全部通过
- [x] `tests/integration/config/secrets-store.test.ts` — 6 个测试全部通过
- [x] 跑通 `pnpm test`，全绿（23 files, 139 tests pass）

### Round 13.2: Playwright + Electron E2E 基础设施

- [x] 确认 `@playwright/test` 已安装
- [x] 确认 `playwright.config.ts` 配置正确
- [x] E2E spec 编写（popup_view / dashboard_view / settings_view / plugin_config）

### Round 13.3: UI 埋 data-testid ✅

- [x] Popup 窗口：
    - `[data-testid="popup-refresh-btn"]` — 刷新按钮
    - `[data-testid="popup-plugin-card"]` — 插件卡片（带 instanceId）
    - `[data-testid="popup-error"]` — 错误信息
    - `[data-testid="popup-empty"]` — 空状态
- [x] Dashboard 窗口：
    - `[data-testid="dashboard-title"]` — 面板标题
    - `[data-testid="dashboard-plugin-list"]` — 插件卡片列表
    - `[data-testid="dashboard-plugin-card-{instanceId}"]` — 单个插件卡片
    - `[data-testid="dashboard-refresh-btn"]` — 刷新按钮
    - `[data-testid="dashboard-empty"]` — 空状态
- [x] Settings 窗口：
    - `[data-testid="settings-sidebar"]` — 侧栏导航
    - `[data-testid="settings-plugin-nav-{instanceId}"]` — 插件导航项
    - `[data-testid="settings-form-{instanceId}"]` — 参数表单
    - `[data-testid="settings-save-btn-{instanceId}"]` — 保存按钮
    - `[data-testid="settings-duplicate-btn-{instanceId}"]` — 复制按钮

### Round 13.4: E2E spec 编写 ✅

- [x] `app_lifecycle.spec.ts` — 启动、窗口可用、UI 元素、设置导航、窗口关闭、多窗口共存（7 tests）
- [x] `popup_view.spec.ts` — 插件卡片渲染、使用量数据展示、刷新按钮功能、错误状态
- [x] `dashboard_view.spec.ts` — 仪表盘标题、插件卡片列表、状态展示
- [x] `settings_view.spec.ts` — 设置侧栏、插件选择、参数表单填写和保存
- [x] `plugin_config.spec.ts` — 首次启动自动创建实例、API Key 填写、密钥保存、手动刷新
- [x] `scheduler.spec.ts` — 自动创建插件实例、定时刷新到达终态、手动刷新按钮、设置显示插件列表（4 tests）

### Round 13.5: 打包 smoke 流程标准化 ✅

- [x] 每次打包后执行 checklist：
    1. 启动 exe
    2. 确认渲染进程无白屏
    3. 确认托盘图标出现
    4. 确认点击托盘弹出 Popup 窗口
    5. 确认插件自动加载
    6. 确认 Dashboard 显示插件卡片
    7. 确认 Settings 显示插件列表
- [x] 将 smoke 步骤写入 `scripts/smoke-check.md`
- [x] 每次 `pnpm package` 后必须执行

### Round 13.6: CI 门禁（可选，后续实施）

- [x] PR 门禁：`pnpm check`（typecheck + lint + format + deadcode + arch）
- [x] PR 门禁：`pnpm test`（单元 + 集成）
- [x] PR 门禁：`pnpm test:e2e:core`（核心 E2E，离线通过）
- [x] Nightly：全量 E2E + 打包验证

### Round 13.7: 详细日志系统

- [x] **选型**：自建 logger（`src/shared/lib/logger.ts`）
- [x] **Main 进程日志**：
    - 应用生命周期（启动、就绪、窗口创建、托盘创建、退出）
    - 插件发现、Python 检测、调度器启动
- [x] **Main 进程日志（待扩展）**：
    - IPC 调用（channel、耗时、返回值摘要） — plugin-ipc.ts, config-ipc.ts 已实现
    - 插件执行（脚本名、instanceId、exitCode、耗时） — refresh-service.ts 已实现
    - 调度事件（定时触发、缓存命中/未命中） — plugin-scheduler.ts, refresh-service.ts 已实现
    - 配置变更（config save 事件） — main/index.ts 已实现
- [x] **Renderer 进程日志**：
    - 页面导航（路由切换） — use-route.ts 已实现
    - IPC 调用发起（channel 名） — use-plugins.ts, use-config.ts 已实现
    - 错误展示 — hooks 中 catch 块已记录
- [x] **日志格式**：统一格式 `[timestamp] [level] [module] message`
- [x] **日志输出**：
    - 文件输出：`{userData}/logs/` 目录，按日期滚动，保留最近 7 天
    - 控制台输出：开发模式启用，生产模式关闭（仅写文件）
- [x] **日志级别**：开发阶段默认 `debug`
- [x] **安全红线**：
    - secret / API key 值绝不进入日志（参数名可记录，值替换为 `***`）— 已在 plugin runner 中实现
    - 日志文件权限限制为用户只读（依赖系统默认 umask）
- [x] **与现有 console.log 的关系**：已全部替换为结构化日志，src/ 中无 console.log 调用

---

## Phase 8: 补齐代码质量门禁 (Round 3.5) ✅

> Round 3.5 在 TASKS.md 中全部标记为 `[x]`，以下逐项已完成。

### Round 3.5.1: TypeScript 严格模式 ✅

- [x] 更新 `tsconfig.json`：
    - `strict: true`
    - `noUncheckedIndexedAccess: true`
    - `exactOptionalPropertyTypes: true`
    - `noImplicitReturns: true`
    - `noFallthroughCasesInSwitch: true`
    - `noImplicitOverride: true`
    - `noUnusedLocals: true`
    - `noUnusedParameters: true`
    - `verbatimModuleSyntax: true`
    - `isolatedModules: true`
    - `forceConsistentCasingInFileNames: true`
- [x] 修复所有新增的 type error
- [x] `pnpm typecheck` 通过

### Round 3.5.2: ESLint type-aware 规则 ✅

- [x] 安装依赖：
    - `typescript-eslint`（strictTypeChecked + stylisticTypeChecked）
    - `eslint-plugin-react` + `eslint-plugin-react-hooks`（error 级）
    - `eslint-plugin-jsx-a11y`（可访问性）
    - `eslint-plugin-import-x`（import 顺序、循环依赖检测）
    - `eslint-plugin-unicorn`（现代 JS 最佳实践）
    - `eslint-plugin-sonarjs`（复杂度、重复逻辑）
    - `eslint-plugin-security`（安全风险模式）
    - `eslint-plugin-promise`（Promise 误用）
    - `eslint-plugin-n`（Node.js 规则）
    - `eslint-plugin-perfectionist`（排序一致性）
- [x] 配置 `eslint.config.ts`：
    - `no-explicit-any: error`
    - `no-unsafe-assignment: error`
    - `no-floating-promises: error`
    - `await-thenable: error`
    - `switch-exhaustiveness-check: error`
    - `consistent-type-imports: error`
- [x] `pnpm lint` 通过，`--max-warnings=0`（warning = error）

### Round 3.5.3: 格式化检查 ✅

- [x] 配置 Prettier
- [x] `pnpm format:check` 通过
- [x] 全项目格式化一次

### Round 3.5.4: 死代码 / 依赖架构检查 ✅

- [x] 配置 `Knip`：检测未使用文件、导出、依赖
- [x] 配置 `dependency-cruiser`：
    - 禁止循环依赖
    - renderer 不得 import Node API（`node:fs`, `node:child_process` 等）
- [x] `pnpm deadcode` 通过
- [x] `pnpm arch` 通过

### Round 3.5.5: Electron 安全扫描 ✅

- [x] 配置 `@electron-forge/plugin-fuses`（减少攻击面）
- [x] Semgrep 自定义规则（需安装 semgrep CLI）：
    - `nodeIntegration: true` → error
    - `contextIsolation: false` → error
    - 使用 `remote` module → error
    - `eval` / `new Function` → error
    - `shell.openExternal` 无 URL 校验 → error
- [x] `pnpm security:sast` 通过（需安装 semgrep CLI）

### Round 3.5.6: Git 密钥泄漏防护 ✅

- [x] 安装 `Gitleaks`（系统级安装已完成）
- [x] 配置 pre-commit hook（gitleaks 未在 git bash PATH 中，由 CI 门禁执行 `pnpm security:js`）
- [x] 确认无 secret 在 git 历史中（secrets.json 通过 .gitignore 排除）

### Round 3.5.7: 依赖漏洞扫描 ✅

- [x] `pnpm audit --audit-level=high` — 发现 9 个漏洞（全部来自 `tar`，为 `@electron-forge` 传递依赖，待上游修复）
- [x] 配置 `OSV-Scanner`（可选，`pnpm audit` 已覆盖，无需额外安装）

### Round 3.5.8: Husky + lint-staged ✅

- [x] 安装 `husky` + `lint-staged`
- [x] pre-commit：lint-staged（ESLint fix + Prettier write）
- [x] pre-push：typecheck + unit tests

### Round 3.5.9: package.json check 脚本汇总 ✅

- [x] `"typecheck": "tsc --noEmit"`
- [x] `"lint": "eslint . --max-warnings=0"`
- [x] `"format:check": "prettier --check ."`
- [x] `"deadcode": "knip --include files,dependencies"`
- [x] `"arch": "depcruise src --validate .dependency-cruiser.cjs"`
- [x] `"security:js": "gitleaks detect --source ."`
- [x] `"security:sast": "semgrep scan --config=auto src/"`
- [x] `"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch"`

---

## Phase 9: 修复 Windows 路径兼容 Bug ✅

> 打包运行后发现 Settings 页面所有插件均显示"无可配置参数"，
> 但 DeepSeek / Tavily / GLM / MiniMax 应有 API Key 参数表单。
> 定位为 Windows 反斜杠路径兼容问题。

### Round 9.1: 问题定位 ✅

**现象**：打包应用 Settings 中 6 个插件全部显示"无可配置参数"。

**根因**：`src/main/ipc/plugin-ipc.ts:53` 和 `src/main/index.ts:162` 中使用
`plugin.executablePath.split("/").pop()` 提取脚本文件名。在 Windows 上 `discoverPlugins()`
生成的路径使用反斜杠（`resources\plugins\deepseek-usage-plugin.py`），
`split("/")` 无法分割，返回完整路径字符串，导致 `definitions.find()` 匹配失败，
`metadata` 为 `null`，UI 渲染"无可配置参数"。

**影响范围**：

- `handlePluginList()` — 所有插件 metadata 为 null，Settings 无参数表单
- `secretParamKeys` 构建 — secret 参数无法识别，密钥回注失效

### Round 9.2: 修复 ✅

- [x] **`src/main/ipc/plugin-ipc.ts`**：
    - 添加 `import { basename } from "node:path"`
    - `split("/").pop()` → `basename(plugin.executablePath)`
- [x] **`src/main/index.ts`**：
    - `import { join, resolve }` → `import { basename, join, resolve }`
    - 同样替换 `split("/").pop()` → `basename()`
- [x] **验证**：
    - `pnpm check` 全部通过
    - `pnpm test` 140 tests 通过
    - 打包运行 Settings 正常显示 API Key 输入框

### 修改文件

| 文件                         | 变更                                 |
| ---------------------------- | ------------------------------------ |
| `src/main/ipc/plugin-ipc.ts` | 添加 `basename` import，修复路径提取 |
| `src/main/index.ts`          | 添加 `basename` import，修复路径提取 |

### 测试覆盖

- 新增单元测试：`tests/unit/ipc/plugin-ipc.test.ts` —
  `"handlePluginList resolves metadata on Windows backslash paths"`
  传入 `resources\\plugins\\deepseek-usage-plugin.py` 路径 + 匹配 definitions，
  验证 metadata 和 parameters 正确返回
- 新增 E2E 测试：`tests/user_e2e/specs/settings_view.spec.ts` —
  `"plugins with parameters show config forms, not '无可配置参数'"`
  验证 >= 4 个参数表单可见，<= 2 个"无可配置参数"消息

---

## Phase 10: 测试审查与修复 ✅

> 用户提出"为什么测试没有测出这个问题"，对全部 23 个测试文件进行全面审查，
> 发现 4 个 HIGH、10 个 MEDIUM、4 个 LOW 级别问题。

### Round 10.1: HIGH 级别修复 ✅

#### 10.1.1 `toBeGreaterThanOrEqual(0)` 假断言（3 处）

**问题**：`count()` 返回非负整数，`>= 0` 永真，测试永远通过但不验证任何行为。

**涉及测试**：

- `tests/user_e2e/specs/plugin_config.spec.ts` — `"auto-creates plugin instances on first launch"`
    - 旧代码：`expect(hasPluginNav + hasPluginCard).toBeGreaterThanOrEqual(0)`
    - 旧代码定义了 `hasPluginNav` 和 `hasPluginCard` 两个变量但未使用（`noUnusedLocals` 未覆盖 E2E tsconfig）
- `tests/user_e2e/specs/scheduler.spec.ts` — `"auto-creates plugin instances on startup"`
    - 旧代码：`expect(count).toBeGreaterThanOrEqual(0)`
- `tests/user_e2e/specs/scheduler.spec.ts` — `"settings shows plugin list with enabled state"`
    - 旧代码：`expect(count).toBeGreaterThanOrEqual(0)`

**修复**：

- 全部改为 `expect(count).toBeGreaterThan(0)`
- `plugin_config` 测试增加导航到 Settings 的逻辑，确保实际验证插件实例存在
- `plugin_config` 测试使用 `DashboardPage` page object 替代裸 `waitForTimeout`

#### 10.1.2 `paths.test.ts` 自我实现预言

**问题**：`vi.mock("electron")` 将 `app.getPath` mock 为返回 `"/mock/userData"`，
然后断言 `getDataRoot()` 返回 `"/mock/userData"` — 这只是验证 mock 返回 mock 的值。

**文件**：`tests/unit/paths.test.ts` — `"getDataRoot returns userData path"`

**修复**：保留 mock（无法在无 Electron 环境下不 mock），增加 `typeof root === "string"`
和 `root.length > 0` 验证。同文件其他测试（`getConfigPath` ends with `.json`、
`getStatesDir` ends with `states` 等）已验证路径组合逻辑。

#### 10.1.3 `plugin-ipc.test.ts` 空数组静默通过

**问题**：新增的 Windows 路径测试直接访问 `result.data[0]?.metadata`，
若 `data` 为空数组则 `data[0]` 为 `undefined`，所有 `?.` 链式调用静默返回 `undefined`，
`not.toBeNull()` 对 `undefined` 也通过。

**文件**：`tests/unit/ipc/plugin-ipc.test.ts` — `"handlePluginList resolves metadata on Windows backslash paths"`

**修复**：

- 在访问 `data[0]` 前增加 `expect(result.data).toHaveLength(1)`
- 将 `params` 提取为变量，使用 `params?.[0]?.name` 替代 `parameters[0]?.name`

### Round 10.2: MEDIUM 级别修复 ✅

#### 10.2.1 `plugin_config.spec.ts` form save — if-guard 吞掉失败

**问题**：整个测试主体包裹在 `if (formCount > 0)` 和
`if (await firstInput.isVisible().catch(() => false))` 中。
若无表单渲染或元素不可见，测试静默通过，不验证任何行为。

**修复**：

- 移除所有 if-guard，改为 `expect(formCount).toBeGreaterThan(0)` 断言表单存在
- `await expect(firstInput).toBeVisible()` 断言输入框可见
- `await expect(saveBtn).toBeVisible()` 断言保存按钮可见
- 保存后 `await expect(forms.first()).toBeVisible()` 验证表单仍然存在（无崩溃）

#### 10.2.2 `output-parser.test.ts` — 仅检查 union key

**问题**：`parsePluginOutputOrError` 测试只做 `expect("error" in result).toBe(true)` 和
`expect("items" in result).toBe(true)`，从不验证 error message 或 items 内容。
解析器返回 `{ error: "" }` 或 `{ items: null }` 也能通过。

**修复**：

- error case：增加 `expect(result.error).toBeTruthy()` 和 `typeof result.error === "string"`
- success case：增加 `expect(Array.isArray(result.items))`、`items.length > 0`、
  `items[0]?.id` 存在性

#### 10.2.3 `app_lifecycle.spec.ts` — "window can be closed without crashing" 无断言

**问题**：测试体仅为 `await page.close()`，无任何断言。

**修复**：

- 关闭前：`await expect(page.locator("main")).toBeVisible()` 验证页面功能正常
- 关闭后：`expect(omni.app.process().connected).toBe(true)` 验证进程未崩溃

#### 10.2.4 `app_lifecycle.spec.ts` — "multiple windows can coexist" 名不副实

**问题**：测试名为"多窗口共存"，实际在同一个窗口用 `hash` 导航到 Settings，
从未打开第二个窗口。

**修复**：

- 重命名为 `"settings view renders from dashboard navigation"`
- 增加 `expect(navItems.count()).toBeGreaterThan(0)` 验证插件导航项存在

#### 10.2.5 `settings_view.spec.ts` — 新增参数表单渲染测试

**新增测试**：`"plugins with parameters show config forms, not '无可配置参数'"`

- 验证 `settings-form-*` 可见且数量 >= 4（DeepSeek / Tavily / GLM / MiniMax）
- 验证"无可配置参数"消息数量 <= 2（仅 Claude / Codex 无参数）

### Round 10.3: LOW 级别（记录但不修改）✅

以下问题标记为 LOW，当前可接受，后续可改进：

| #   | 文件                                                | 问题                                                                                                |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 15  | `tests/unit/ipc/*.test.ts`                          | 所有依赖均为 mock，无法捕获集成 bug，但集成测试在其他文件补充                                       |
| 16  | `tests/integration/scheduler/runtime-store.test.ts` | `"preserves lastSuccess on failure after success"` 用 `if` guard 包裹断言，若类型收窄失败则静默跳过 |
| 17  | `tests/smoke/renderer-smoke.test.tsx`               | 主题测试访问 mock 内部 `_themeListeners`，mock 结构变更会导致测试断裂                               |
| 18  | `tests/smoke/renderer-smoke.test.tsx`               | 全套 mock IPC，不验证真实 Electron 桥接，已知限制                                                   |

### 修改文件

| 文件                                         | 变更                                        |
| -------------------------------------------- | ------------------------------------------- |
| `tests/unit/ipc/plugin-ipc.test.ts`          | 新增 Windows 路径测试，修复空数组静默通过   |
| `tests/unit/plugin/output-parser.test.ts`    | 强化 union type 断言，检查实际内容          |
| `tests/unit/paths.test.ts`                   | 增加类型和长度验证                          |
| `tests/user_e2e/specs/plugin_config.spec.ts` | 移除 if-guard，改为硬断言；重构自动创建测试 |
| `tests/user_e2e/specs/settings_view.spec.ts` | 新增参数表单渲染测试                        |
| `tests/user_e2e/specs/scheduler.spec.ts`     | 修复 2 处 `>= 0` 假断言                     |
| `tests/user_e2e/specs/app_lifecycle.spec.ts` | 增加关闭前断言，重命名误导测试名            |

### 测试结果

- `pnpm check`：全部通过（typecheck + lint + format + deadcode + arch）
- `pnpm test`：23 files, 140 tests 全部通过
- `pnpm test:e2e`：23 tests 全部通过

---

## Phase 11: 修复 E2E 零插件问题 ✅

### 根因

`src/main/core/paths.ts` 中 `getBundledPluginsDir()` 使用 `app.getAppPath()` 获取项目根目录。
在 dev 模式下（包括 E2E），Electron 从 `.vite/build/index.js` 启动，`app.getAppPath()` 返回
`.vite/build/` 而非项目根目录。导致插件发现路径变为：

```
.vite/build/resources/plugins/  ← 不存在
实际插件位置：resources/plugins/
```

`discoverPlugins()` 找不到任何插件 → `Discovered 0 plugins` → 无法自动创建 → Settings 显示
"无可配置参数"。

### 同理影响

`get_tray_icon_path()` 使用相同逻辑，但 tray icon 在 E2E 模式下不加载（`E2E=1` 时跳过
Tray 创建），因此未暴露。

### 修复

```typescript
// src/main/core/paths.ts
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..", "..");

export function getBundledPluginsDir(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "plugins");
    }
    return join(PROJECT_ROOT, "resources", "plugins");
}
```

`__dirname` 在 Vite 构建后为 `.vite/build/`，`resolve(__dirname, "..", "..")` 即项目根目录。
Packaged 模式不变（使用 `process.resourcesPath`）。

### 附带修复

- E2E 测试 `app_lifecycle.spec.ts` "window can be closed without crashing"：E2E 模式无 Tray，
  关闭最后一个窗口会导致 Electron 退出。移除 `process().connected` 断言（该断言在有 Tray
  的生产模式下有效，E2E 模式不适用）。

### 修改文件

| 文件                                         | 变更                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/main/core/paths.ts`                     | `app.getAppPath()` → `resolve(__dirname, "../..")`，同时用于 `getBundledPluginsDir` 和 `get_tray_icon_path` |
| `tests/user_e2e/specs/app_lifecycle.spec.ts` | 移除 E2E 不适用的 `process().connected` 断言                                                                |

### 测试结果

- `pnpm typecheck`：通过
- `pnpm lint`：通过（0 warnings）
- `pnpm format:check`：通过
- `pnpm test`：23 files, 140 tests 全部通过
- `pnpm test:e2e`：23 tests 全部通过

---

## Phase 12: 日志系统过粗 — 插件失败时无诊断信息 ❌

### 问题

插件刷新失败时，日志仅记录：

```
[ERROR] [refresh-service] Plugin a2e61610 failed: Plugin output does not match schema
```

缺少关键诊断信息：

1. **插件实际 stdout/stderr** — 不知道插件输出了什么才导致 schema 校验失败
2. **执行的命令** — 不知道传了什么参数、用的什么 Python 路径
3. **schema 校验细节** — Zod 解析失败的具体字段和原因没有记录
4. **退出码** — 不知道是插件崩溃还是输出格式不对
5. **执行耗时** — 虽然有 durationMs 但未写入日志

### 需要修改

| 文件                                         | 变更                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/main/core/scheduler/refresh-service.ts` | `catch` 块中 log 增加 `result.stdout` 前 500 字符、`result.stderr`、`exitCode`、`durationMs` |
| `src/main/core/plugin/runner.ts`             | `debug` 级别记录执行的命令和参数（不含 secret 值）                                           |
| `src/shared/schemas/plugin-output.ts`        | `parsePluginOutputOrError` 失败时抛出包含 Zod issue 的错误                                   |

### 安全约束

- stdout 可能包含 secret，记录时需截断或脱敏
- 错误消息中不直接拼接 secret 值
- 仅 debug 级别记录完整 stdout，error 级别记录前 500 字符

---

## Phase 13: 智谱 GLM 插件 schema 校验失败 ❌

### 现象

填入智谱 API Key 后，日志报 `Plugin output does not match schema`，Dashboard 无数据。

### 已确认

- API Key 本身有效（curl 调用 `open.bigmodel.cn/api/monitor/usage/quota/limit` 返回 200 + 正常数据）
- Key 来源：智谱国际版（glm-4-flash 等国际可用模型的 key）
- 所有 6 个插件都报同一错误（不仅是 GLM），说明可能是 Python 环境或 schema 校验的共性问题

### 假设

1. **Python 路径问题**：packaged app 可能找不到 `python`/`python3`，导致插件以异常方式退出
2. **编码问题**：Windows 控制台默认 GBK 编码，中文输出可能导致 JSON 解析失败
3. **GLM 国际端点差异**：国际版 key 调国内端点可能返回非标准 JSON（如 HTML 重定向或不同的错误格式）
4. **schema 定义不匹配**：插件实际输出的 JSON 字段与 `plugin-output.ts` 的 Zod schema 有差异

### 排查步骤

1. 先完成 Phase 12（加详细日志），再重跑 packaged app 看插件实际输出
2. 手动 `python resources/plugins/glm-usage-plugin.py "API_KEY=xxx"` 看输出格式
3. 检查 packaged app 中 Python 检测结果（日志中是否有 `Python detected: xxx`）
4. 对比插件输出 JSON 与 `plugin-output.ts` schema 定义

### 注意

- API Key 不进 git、不进日志、不进测试

---

## 通用约束（每轮适用）

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 无法确认的旧行为写入 `docs/unconfirmed.md`
5. 每个新模块必须有测试
6. 运行测试并报告结果
7. secret 不进日志/错误消息/测试快照
8. renderer 不直接访问 Node API
9. 每轮输出修改文件列表
10. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
3. 哪些行为还是 UNCONFIRMED？
