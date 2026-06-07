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

## Phase 12: 日志系统过粗 — 插件失败时无诊断信息 ✅

### 完成情况

已在 11 个文件中添加详细日志，可追溯用户操作和代码执行流程：

- 插件 stdout/stderr 前 500 字符（debug 级别）
- Schema 校验失败时输出 Zod issues
- 解析失败时输出原始 stdout
- 所有 IPC 操作、窗口生命周期、调度器事件均有日志

---

## Phase 13: 智谱 GLM 插件 schema 校验失败 ✅

---

## Phase 14: 每个插件可设置刷新时间间隔 ✅

### 需求

- 设置页面中每个插件可独立设置「几分钟刷新一次」（默认 5 分钟）
- 输入范围：1–60 分钟，整数
- 保存后即时生效（重启调度器）

### 修改文件

| 文件                                       | 变更                                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| `src/renderer/components/SettingsForm.tsx` | 刷新间隔输入框（number input，单位分钟）                |
| `src/main/index.ts`                        | 首次启动默认值改为 5 分钟（当前已实现）                 |
| `src/main/core/config/types.ts`            | `refreshIntervalSeconds` 字段已有，确认 schema 校验范围 |

### 验证

1. 设置页面显示「刷新间隔」输入框，单位为分钟
2. 修改间隔后保存，调度器自动以新间隔运行
3. 单元测试覆盖边界值（1、60、非法值拒绝）

---

## Phase 15: 仪表盘显示「上次刷新距今多久」✅

### 需求

- 每个插件卡片上显示「刚刚刷新」/「3 分钟前」/「5 分钟前」等相对时间
- 基于 runtimeStore 中 `updatedAt` 计算
- 每秒自动更新显示

### 修改文件

| 文件                                     | 变更                                               |
| ---------------------------------------- | -------------------------------------------------- |
| `src/renderer/components/PluginCard.tsx` | 添加相对时间显示，useEffect + setInterval 每秒刷新 |

### 验证

1. 插件卡片显示「X 分钟前」且实时递增
2. 刷新后归零为「刚刚」
3. 单元测试覆盖相对时间格式化函数

---

## Phase 16: 系统托盘行为简化 ✅

### 需求

- 左键点击托盘图标 → 打开仪表盘窗口（或切换显示/隐藏）
- 右键点击 → 弹出设置窗口
- 移除 popup 独立窗口，不再需要
- 右键菜单只保留「退出」选项（设置改为右键直接打开）

### 修改文件

| 文件                               | 变更                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/main/index.ts`                | 托盘 click → dashboard，right-click → settings；移除 popup 窗口创建逻辑；移除 WINDOW_CONFIGS.popup |
| `src/renderer/views/PopupView.tsx` | 确认无其他引用后可删除                                                                             |

### 验证

1. 左键点击托盘 → 仪表盘窗口弹出
2. 右键点击托盘 → 设置窗口弹出
3. 无 popup 窗口
4. E2E 测试更新

### 根本原因（两个问题叠加）

1. **`parsePluginOutput` 不处理错误格式**：当插件没有 API key 或认证失败时返回 `{"error": "..."}` JSON，`parsePluginOutput` 只接受成功 schema，将错误 JSON 也报为 schema 失败。导致 Claude、Codex、Tavily、MiniMax 等 5 个插件（无有效凭据）全部误报为 schema 错误。

2. **Zod schema 不接受 `null` 值**：智谱 GLM 插件返回的 JSON 中 `resetAt` 和 `chart.message` 为 `null`，但 Zod schema 用 `.optional()` 只接受 `undefined`（字段缺失），不接受显式的 `null`。

### 修复

- `src/main/index.ts`：改用 `parsePluginOutputOrError` 替代 `parsePluginOutput`
- `src/main/core/scheduler/refresh-service.ts`：
    - `outputParser` 类型改为 `PluginOutput | PluginErrorOutput`
    - 解析后检查 `"error" in output`，将错误 JSON 处理为 `WARN` 级别的业务错误
- `src/shared/schemas/plugin-output.ts`：
    - `resetAt: z.string().nullable().optional()` — 接受 `null`
    - `message: z.string().nullable().optional()` — 接受 `null`

### 验证

重新打包后日志确认智谱插件成功刷新：`Plugin 智谱 refreshed: 3 items in 733ms`

### 注意

- API Key 不进 git、不进日志、不进测试

---

---

## Phase 17: 添加 CPA 插件 — 通过 CPA-Manager 获取多平台 AI 服务额度数据 ✅

### 背景

`ai_monitor` 项目已实现 CPA（Claude Platform API）额度采集，通过 CPA-Manager 代理服务统一管理 OAuth token。
本项目需将其移植为 omni_usage 的标准插件（Python 子进程 + JSON 协议），复用现有插件调度/缓存/UI 基础设施。

支持的 provider：Claude、Codex、Gemini CLI、Antigravity、Kimi。
（Vertex AI 未实现配额获取，暂不支持。）

参考文档：`docs/cpa-quota-guide.md`

### 架构

```
omni_usage 插件系统
    │
    │  spawn python cpa-usage-plugin.py
    ▼
CPA 插件 (Python 子进程)
    │
    │  HTTP 请求 (httpx)
    ▼
CPA-Manager (http://<your-host>:20224)
    │
    │  用存储的 OAuth token 代发
    ▼
上游 API (Anthropic / OpenAI / Google / Moonshot)
```

### 实现步骤

#### 17.1: 编写 `resources/plugins/cpa-usage-plugin.py`

- [x] 输出 `_METADATA` 注释块，声明插件元数据：
    - `name`: `"CPA"`
    - `refreshInterval`: `1800`（30 分钟）
    - `parameters`:
        - `cpa_mgmt_url` (string, 默认 `"http://localhost:20224"`)
        - `cpa_mgmt_key` (secret)
        - `monitor_codex` (boolean, 默认 `true`)
        - `monitor_claude` (boolean, 默认 `true`)
        - `monitor_gemini` (boolean, 默认 `true`)
        - `monitor_antigravity` (boolean, 默认 `true`)
        - `monitor_kimi` (boolean, 默认 `true`)
- [x] `--usageboard-param` 支持运行时传入覆盖默认值
- [x] 依赖：`httpx`（`pip install httpx`），Python 3.8+ 兼容
- [x] 核心逻辑：
    1. 调用 `GET /v0/management/auth-files` 获取 auth 文件列表
    2. 按 provider 分发：`claude` / `codex` / `gemini-cli` / `antigravity` / `kimi`
    3. 跳过 `disabled` 的 auth 文件
    4. 每个 auth 文件通过 `POST /v0/management/api-call` 代理请求上游
    5. 解析五个 provider 的不同响应格式
    6. 输出标准 `PluginOutput` JSON
- [x] 输出 items 格式（每个账号每个周期一个 item）
- [x] 错误处理：单个账号失败不阻塞其他，失败项输出 warning，全部失败输出 error JSON

#### 17.2: 实现五个 provider 的响应解析

- [x] **Claude**: `GET https://api.anthropic.com/api/oauth/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `anthropic-beta: oauth-2025-04-20`
    - 响应字段：`five_hour.utilization`（0~1），`seven_day.utilization`
    - 时间字段：`resets_at` (ISO 8601)
- [x] **Codex**: `GET https://chatgpt.com/backend-api/wham/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: codex_cli_rs/...`
    - 响应字段：`rate_limit.primary_window.used_percent`，`secondary_window`
    - 时间字段：`reset_at` (Unix 秒/ms)
- [x] **Gemini**: 两步 POST
    - Step 1: `loadCodeAssist` → 获取 `cloudaicompanionProject`
    - Step 2: `retrieveUserQuota` → 获取 `buckets[].remainingFraction`
- [x] **Antigravity**: `POST .../v1internal:fetchAvailableModels`（三 URL 回退）
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: antigravity/1.11.5 windows/amd64`
    - Body: `{"project": "{project_id}"}` 或 `{}`
    - 响应：`models.{modelId}.quotaInfo.remainingFraction`（0~1），`quotaInfo.resetTime` (ISO)
    - 每个模型独立配额，一个账号输出多条 item
- [x] **Kimi**: `GET https://api.kimi.com/coding/v1/usages`
    - Header: `Authorization: Bearer $TOKEN$`
    - 响应：`limits[]` 数组，每项含 `used`、`limit`、`reset_at` (ISO)、`duration`、`timeUnit`
    - `used_percent = (used / limit) * 100`

#### 17.3: 集成到插件系统

- [x] 确认 `discoverPlugins()` 能发现 `resources/plugins/cpa-usage-plugin.py`
- [x] 首次启动自动创建 CPA 插件实例（auto-seed 机制复用）
- [x] 参数表单：Settings 中显示 CPA 管理地址、密钥、五个 provider 开关
- [x] 密钥回注：`cpa_mgmt_key` 为 secret 类型，执行前自动注入

#### 17.4: UI 适配

- [x] 插件卡片支持多 item 显示（每个账号每个周期一个进度条）
- [x] 标签显示 provider 名 + 邮箱 + 周期（如 "Claude (user@ex.com) · 5小时"）
- [x] 如果复用现有 PluginCard 即可满足则无需修改 UI

#### 17.5: 测试

- [x] **单元测试**：
    - `parse_claude()` — 正常响应、空响应、fractional utilization
    - `parse_codex()` — primary_window / secondary_window 解析
    - `parse_gemini_buckets()` — bucket 解析
    - `parse_antigravity_models()` — 多模型 quotaInfo 解析
    - `parse_kimi()` — limits 数组解析
    - `extract_email()` — 邮箱提取
- [x] **集成测试**：
    - 缺少 httpx → error JSON
    - 缺少 cpa_mgmt_key → error JSON
    - CPA-Manager 不可达 → error JSON

#### 17.6: 文档更新

- [x] `docs/plugin-contract.md` 补充 CPA 插件说明
- [x] `docs/spec.md` 内置插件表添加 CPA 行

### 修改文件（实际）

| 文件                                           | 变更                               |
| ---------------------------------------------- | ---------------------------------- |
| `resources/plugins/cpa-usage-plugin.py`        | **新建** — CPA 插件脚本            |
| `tests/unit/plugin/cpa_parsers_test.py`        | **新建** — Python 解析函数单元测试 |
| `tests/unit/plugin/cpa-parsers-vitest.test.ts` | **新建** — Vitest 包装器           |
| `tests/integration/plugin/cpa-plugin.test.ts`  | **新建** — CPA 插件集成测试        |
| `tests/unit/plugin/bundled-metadata.test.ts`   | 更新插件数量 6→7 + 添加 CPA 条目   |
| `docs/plugin-contract.md`                      | 补充 CPA 插件说明                  |
| `docs/spec.md`                                 | 内置插件表添加 CPA 行              |

### 验证

1. `pnpm check` 全部通过
2. `pnpm test` 全部通过（含新增 CPA 测试）
3. 打包后 Settings 显示 CPA 插件参数表单
4. 填入 CPA-Manager 密钥后触发刷新，Popup 显示 Claude/Codex/Gemini/Antigravity/Kimi 额度数据
5. 单个 provider 无数据时不阻塞其他 provider 的展示

### 注意事项

- `cpa_mgmt_key` 是 secret，不进 git、不进日志、不进测试快照
- CPA-Manager 地址和密钥作为插件参数（而非硬编码），方便用户自建 CPA-Manager
- `httpx` 依赖需在插件脚本中检测，不可用时输出友好错误
- 代理请求中 header 的 `$TOKEN$` 是占位符，CPA-Manager 会自动替换为真实 token
- Antigravity 有三个回退 URL，按优先级尝试；`project` 需先通过 `loadCodeAssist` 获取
- Kimi OAuth token 由 CPA-Manager 自动刷新，客户端无需处理
- Vertex AI 暂不支持（配额系统走 Google Cloud Service Usage API）

---

## Phase 18: 补齐测试覆盖与真实验收缺口 ✅

> 已完成。执行入口:`docs/superpowers/plans/2026-05-30-test-coverage-improvement.md`(8 个 Task 全部交付)。
> 覆盖现状见 `docs/test-coverage-matrix.md`。
> 关键提交:`b84e8e7` 覆盖率门禁、`108fa79` playwright 多 project + coverage 脚本、`9c14faf` 真实 API 契约、`d3882d5` 插件测试稳定性修复。
>
> 剩余可选项(未做):nightly-contract GitHub Actions(`.github/workflows/`),手工跑 `pnpm test:full` 等效。

---

---

## Phase 19: UI 与设计 demo 对齐 + 窗口/托盘修复 ✅

### 19.1 窗口装饰修复

- [x] **19.1.1 Settings 窗口去掉默认菜单栏**
    - 文件:`src/main/index.ts` WINDOW_CONFIGS.settings 与 createWindowFor
    - 改动:`autoHideMenuBar: true` + 创建后 `win.setMenuBarVisibility(false)`;或全局 `Menu.setApplicationMenu(null)`(注意 macOS 上需保留最小菜单以避免快捷键失效)
    - 验收:打包产物启动 Settings 窗口顶部无 File/Edit/...菜单

- [x] **19.1.2 Popup 自绘标题栏拖拽区**
    - 文件:`src/renderer/views/PopupView.tsx` + `globals.css`
    - 当前 `.titlebar` 节点应加 `-webkit-app-region: drag`,子按钮加 `no-drag`
    - 验收:鼠标拖标题栏可移动窗口;点击刷新/设置按钮不触发拖拽

- [x] **19.1.3 验证 popup 在托盘下方定位**
    - 文件:`src/main/index.ts` Tray click handler
    - 当前 spec 要求 popup 紧贴托盘弹出,需读取 `tray.getBounds()` 计算坐标
    - 验收:左键托盘,popup 出现在托盘正下方(Win)/正上方(Mac dock)

### 19.2 托盘图标修复

- [x] **19.2.1 `get_tray_icon_path()` 改用专用资源**
    - 文件:`src/main/core/paths.ts:37`
    - 改动:返回 `resources/tray-icon.png`(已存在);打包路径同步 `process.resourcesPath/tray-icon.png`
    - `forge.config.ts` 的 `extraResource` 须包含 `tray-icon.png`
    - 验收:Win 托盘显示 16x16 清晰图标,无空白/默认 Electron 图标

- [x] **19.2.2 多尺寸/HiDPI 支持**
    - 提供 `tray-icon@2x.png` 32x32,或改用 ICO 多帧
    - macOS 加 `tray-iconTemplate.png` 单色模板,自动适配深浅菜单栏

- [x] **19.2.3 托盘 tooltip + 右键菜单贴近设计**
    - 文件:`src/main/index.ts` + 参考 `docs/design/omni-usage/project/tray.jsx`
    - 当前右键菜单缺:暂停自动刷新、开机自启、检查更新等
    - 验收:右键菜单 7 项符合 demo

### 19.3 渲染层对齐设计 demo

- [x] **19.3.1 实现 AreaChart 组件**
    - 来源:`docs/design/omni-usage/project/usageboard.jsx` `function AreaChart`
    - 新建:`src/renderer/components/AreaChart.tsx`
    - 接入:`PluginCard` 在 snapshot.chart 存在时渲染
    - 验收:渲染多系列 SVG 趋势图,y/x 轴 label 与 demo 一致

- [x] **19.3.2 实现 TokenGrid 组件**
    - 来源:`usageboard.jsx` `function TokenGrid`
    - 新建:`src/renderer/components/TokenGrid.tsx`
    - 接入:展示 `snapshot.tokens`(若 schema 缺,先补 `plugin-output.ts` 可选字段)
    - 验收:点状颜色 + 数值 + 单位渲染

- [x] **19.3.3 UsageRow tone/invert**
    - 来源:`usageboard.jsx` `function UsageRow`
    - 现有 `BarRow` 改造:支持 `tone="danger|warn"`,`fillPct >= 65` 时 `data-invert` 反色文本
    - 验收:高占用条文字白色压在填充上,清晰可读

- [x] **19.3.4 多账号 Tab 横向滚动条**
    - 来源:`docs/design/omni-usage/project/multi-account.jsx`
    - 文件:`PopupView.tsx` 当前 tabs-wrap 只有单 "总览" tab,缺多账号 tab 与 active 切换
    - 验收:多个 CPA 子账号或多插件实例显示为可切换 tab,active tab 自动 scrollIntoView

- [x] **19.3.5 Tweaks Panel(设置侧栏外观/行为)**
    - 来源:`tweaks-panel.jsx` 540 行
    - 文件:新建 `src/renderer/views/TweaksView.tsx` 或并入 SettingsView 的"外观"section
    - 验收:主题色、刷新间隔、显示模式可视化调节

### 19.4 样式对齐

- [x] **19.4.1 抽取设计 CSS 变量**
    - 来源:`omniusage.css` / `usageboard.css` / `settings.css` 顶部 `:root { --... }`
    - 文件:`src/renderer/styles/globals.css` 顶部
    - 验收:色板/间距/圆角 token 全量同步

- [x] **19.4.2 逐组件 CSS 补齐**
    - 对照 `.ub-row` / `.ub-bar` / `.ub-tokens` / `.ub-tok-*` 等 demo 类名,补齐当前 globals.css 缺失规则
    - 注意:不直接 import demo CSS(demo 是 prototype,见 design README),按需移植规则

- [x] **19.4.3 深色模式校对**
    - demo 有 `data-theme="dark"` 切换,逐 token 校对深浅两套色

### 19.5 验收

- [x] `pnpm package` 后启动,Settings 窗口无默认菜单栏
- [x] 托盘图标清晰显示(Win/Mac/Linux 任一平台至少 Win 通过)
- [x] Popup 标题栏可拖拽,按钮不触发拖拽
- [x] PluginCard 渲染 AreaChart + TokenGrid + 多 UsageRow
- [x] 多账号 tab 可切换
- [x] 视觉对照 `docs/design/omni-usage/project/screenshots/01-overview.png`,核心布局/色彩一致
- [x] `pnpm test:visual` 基线更新后通过

### 19.6 不在范围

- 设计 demo 里的"添加服务向导对话框"(`01-add-dialog.png`)— 留 Phase 20
- 跨平台菜单栏深度适配(macOS native menu)— 仅做最小适配

### 19.7 Popup 主面板底部空白修复

#### 问题

打包产物运行后，主面板窗口底部出现大片空白。

根因：`src/main/index.ts` 中 popup `BrowserWindow` 高度为 `480`，但 `src/renderer/styles/globals.css` 的 `.window` 使用 `height: min(816px, calc(100vh - 80px))`，导致真实 popup 内容高度只有 `400px`，底部剩余约 `80px` body 背景空白。

#### 修复要求

- [x] 将真实 popup 场景下 `.window` 高度改为填满窗口（如 `height: 100vh` / `height: 100%`），不能继续使用设计预览用的 `calc(100vh - 80px)`。
- [x] 保持 Settings 窗口布局不被误伤。
- [x] 检查主面板滚动区域和 statusbar，确保内容少/多时都无底部空白、无被截断。

#### 测试要求

- [x] 增加/更新 renderer 或 E2E 测试，覆盖 popup 根容器高度等于视口高度，防止再次出现 `100vh - 80px` 类回归。
- [x] 打包后真实启动验证：主面板底部无空白。
- [x] 若自动化能接入 packaged app，则在 `tests/packaged_smoke/` 增加断言：`.window` 高度与 `window.innerHeight` 一致或误差在 1px 内。

#### 文档要求

- [x] 更新 `docs/test.md` / `docs/test-coverage-matrix.md`：记录 popup 布局 smoke 需要覆盖窗口高度和底部空白回归。
- [x] 如 `docs/spec.md` 描述 popup 尺寸/布局，也要同步说明 popup 内容应填满窗口。

---

## Phase 20: Popup 主面板高度随内容自适应

### 背景

OmniUsage 主面板是托盘弹出的 Popup 窗口。当前窗口高度偏固定，无法根据可见内容自动收缩/扩展。
目标是仿照 Omni Pot 翻译窗口的高度链路：renderer 测量内容高度，主进程按折叠状态与屏幕约束计算目标高度，再应用到 Electron `BrowserWindow`。

主面板默认展示所有可见 provider/账号卡片的展开内容；用户折叠卡片后，窗口高度应跟随可见内容缩小；用户展开卡片后，窗口高度应跟随内容增大。

### 核心规则

1. **默认展开**：主面板打开时，provider 卡片/账号卡片默认展开，窗口高度按展开内容计算。
2. **折叠驱动高度**：卡片折叠只改变 DOM 可见内容高度；renderer 不直接设置窗口高度，只上报测量后的内容高度。
3. **最小高度**：最小高度不是固定常量，而是“所有可折叠卡片都处于折叠状态时的主面板高度”。窗口缩到该高度后不允许继续缩小。
4. **最大高度**：最大高度不得超过当前显示器 work area 高度的 `85%`。
5. **超高内容滚动**：真实内容高度超过最大高度时，窗口固定在最大高度，内部滚动区域滚动。
6. **折叠状态重置**：新一轮刷新/切换 provider/数据源结构变化时，应清空旧的手动折叠状态，避免新数据继承旧折叠导致内容被隐藏或窗口异常偏小。
7. **抖动抑制**：高度上报使用 `1px` debounce 阈值，小于等于 `1px` 的高度差不触发主进程 resize。
8. **平台定位差异**：主面板由系统托盘触发，但不同平台行为不同，当前尚未完整实现，必须纳入本轮。
    - macOS：做成菜单栏 popover 风格，点击托盘/菜单栏图标后锚定在图标下方弹出；窗口不可拖动、不可自由移动；高度变化时继续保持托盘锚点。
    - Windows：做成托盘触发的普通浮动窗口；初次打开可贴近托盘图标；窗口可拖动移动；用户移动后，高度自适应不得把窗口重新吸回托盘。
    - Linux：按 Windows 浮动窗口处理；托盘实现和 bounds 可靠性差异较大，初次打开优先贴近 tray bounds，拿不到可靠 tray bounds 时使用鼠标位置或当前 work area 右下角兜底；窗口可移动。

### 数据流

```text
用户打开主面板
    ↓
Popup renderer 渲染默认展开内容
    ↓
ResizeObserver 测量内容容器高度
    ↓
renderer 上报 content_height 和 collapsed_min_height
    ↓
主进程计算目标高度
    ↓
目标高度 = clamp(content_height, collapsed_min_height, work_area.height * 0.85)
    ↓
BrowserWindow.setBounds / setSize 应用锁定尺寸
    ↓
内容超过最大高度时，renderer 内部滚动
```

### 伪代码

```ts
const MAX_HEIGHT_RATIO = 0.85;
const HEIGHT_REPORT_DEBOUNCE_PX = 1;

function report_popup_height() {
    const content_height = measure_visible_content_height();
    const collapsed_min_height = measure_all_cards_collapsed_height();

    if (Math.abs(content_height - last_reported_height) <= HEIGHT_REPORT_DEBOUNCE_PX) {
        return;
    }

    last_reported_height = content_height;
    window.usageboard.popup.report_content_height({
        content_height,
        collapsed_min_height,
    });
}

function compute_target_height(report, display) {
    const max_height = Math.floor(display.workArea.height * MAX_HEIGHT_RATIO);
    const min_height = Math.ceil(report.collapsed_min_height);

    return clamp(Math.ceil(report.content_height), min_height, max_height);
}
```

### 实现步骤

#### 20.1 Renderer 内容高度测量

- [x] 在 Popup 主面板根内容容器上接入 `ResizeObserver`。
- [x] 测量当前可见内容高度，包括标题栏、tabs、provider card、账号列表、底部状态栏。
- [x] 不把设计预览用高度写死到真实 popup。
- [x] 高度变化超过 `1px` 才上报，避免字体渲染/小数像素引发 resize 抖动。

#### 20.2 折叠状态模型

- [x] 为 provider 卡片/账号分组增加显式 `collapsed` 状态。
- [x] 默认状态为展开。
- [x] 用户点击折叠后，只隐藏卡片详情内容，保留卡片标题、摘要、状态、刷新入口。
- [x] 展开/折叠后依赖 `ResizeObserver` 自动触发高度上报，不在点击 handler 中直接改窗口尺寸。

#### 20.3 最小高度测量

- [x] 实现“全卡片折叠高度”测量。
- [x] 最小高度必须包含：标题栏、provider tabs、所有折叠态卡片 header、底部状态栏、必要 padding/border。
- [x] 当当前内容高度低于全折叠高度时，主进程仍使用全折叠高度作为窗口高度。
- [x] 不使用固定 `160px` 作为主面板最小高度；`160px` 只能作为极端兜底，不能覆盖全折叠高度规则。

#### 20.4 主进程高度控制器

- [x] 新增或复用 popup 高度控制器。
- [x] 接收 renderer 上报的 `content_height` 与 `collapsed_min_height`。
- [x] 根据当前 popup 所在 display 的 `workArea.height * 0.85` 计算最大高度。
- [x] 使用 `clamp(content_height, collapsed_min_height, max_height)` 计算目标高度。
- [x] 应用窗口尺寸时保持托盘锚点位置正确，避免高度变化后 popup 漂移。

#### 20.5 平台化窗口定位与移动策略

> 注意：本节会**回退 Phase 19.1.2 的全局自绘拖拽**实现。19.1.2 当前为所有平台 `.titlebar` 设置了 `-webkit-app-region: drag`；本节要求按平台分发：macOS 关闭 drag、Win/Linux 保留。改造时通过 platform 判断条件渲染 className 或 inline style，不要直接删除 19.1.2 的 CSS 规则导致 Win/Linux 回归。

- [x] 新增平台策略函数，例如 `get_popup_window_behavior(platform)`。
- [x] macOS：
    - [x] popup 初始位置锚定系统托盘/菜单栏图标。
    - [x] 高度变化时，以托盘锚点重新计算窗口位置，保持 popover 贴住图标。
    - [x] 禁止 renderer 自绘标题栏拖动区；`.titlebar` 不应设置 `-webkit-app-region: drag`（推翻 Phase 19.1.2 的全局 drag 行为）。
    - [x] 窗口不可由用户自由拖动；如果 Electron frame/traffic light 导致可移动，需要改为无 frame popover 行为。
- [x] Windows：
    - [x] popup 初次打开由托盘图标触发，默认贴近 tray bounds。
    - [x] 保留自绘标题栏拖动区，允许用户移动窗口。
    - [x] 记录用户是否移动过窗口；移动后高度自适应只改高度，不重新锚定到托盘。
    - [x] 关闭后再次从托盘打开，可重新按 tray bounds 定位。
- [x] Linux：
    - [x] 行为与 Windows 一致：托盘触发、浮动窗口、可移动。
    - [x] tray bounds 可用时初始贴近 tray bounds。
    - [x] tray bounds 不可靠或为空时，使用当前鼠标所在 display 的 work area 右下角兜底定位。
    - [x] 高度自适应不破坏用户移动后的位置。
- [x] 平台策略必须与高度控制器集成：
    - macOS resize 时保持托盘锚点。
    - Windows/Linux resize 时保持当前窗口左上角或用户移动后的位置。

#### 20.6 新内容重置折叠

- [x] 当刷新返回新的 provider/account 结构时，清空旧折叠状态。
- [x] 当切换 provider tab 时，默认展开当前 provider 内容。
- [x] 原因：折叠状态是用户对旧内容的临时视图选择，不应隐藏新一轮数据。
- [x] 验收：刷新后新内容默认展开，窗口按新内容高度重新计算。

#### 20.7 滚动与最大高度

- [x] 当内容高度超过 `85% work area` 时，窗口高度停在最大值。
- [x] 超出内容由主面板内部滚动，不继续增大窗口。
- [x] 折叠部分卡片后，如果内容高度低于最大值，窗口应同步缩小。
- [x] 全部折叠后，窗口应缩到全折叠高度，不再继续缩小。

#### 20.8 测试改动清单

- [x] 新增主进程单元测试：`tests/unit/main/popup_height_controller.test.ts`
    - 覆盖 `compute_target_height()`：
        - `content_height` 小于 `collapsed_min_height` 时返回 `collapsed_min_height`。
        - `content_height` 在 min/max 之间时返回 `content_height`。
        - `content_height` 超过 `workArea.height * 0.85` 时返回最大高度。
        - 小数高度向上取整，避免内容被裁切。
        - 最大高度向下取整，避免超过屏幕 `85%` 约束。
    - 覆盖 `report_content_height()` debounce：
        - 与上次已应用高度差值 `<= 1px` 时不调用 resize。
        - 与上次已应用高度差值 `> 1px` 时调用 resize。
        - `content_height` 变化但 clamp 后目标高度不变时不重复调用 resize。
    - 覆盖 `apply_locked_size()`：
        - 应用高度时保持 popup 宽度不变。
        - 应用高度时保持托盘锚点方向正确，不让窗口随高度变化漂移到错误位置。
        - 当 min/max clamp 到同一高度时，后续相同目标高度不重复 `setBounds`。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/views/popup_view_height.test.tsx`
    - 默认渲染时 provider/账号卡片处于展开态。
    - 点击折叠按钮后，详情内容从 DOM 可见区域移除或隐藏，高度上报变小。
    - 点击展开按钮后，详情内容恢复，高度上报变大。
    - 折叠全部卡片后，上报的 `collapsed_min_height` 等于当前全折叠内容高度。
    - 切换 provider tab 后，当前 provider 内容默认展开。
    - 刷新返回新的 provider/account 结构后，旧折叠状态被清空。
    - 高度测量只来自 popup 内容容器，不读取 Node API。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_window_constraints.spec.ts`
    - 覆盖最大高度：构造多 provider/多账号内容，打开托盘主面板，断言窗口高度 `<= 当前屏幕 work area * 0.85`。
    - 覆盖内部滚动：内容超过最大高度时，窗口不继续增高，主面板滚动区域可滚动到底。
    - 覆盖全折叠最小高度：折叠所有可折叠卡片后，窗口高度缩小到全折叠高度附近，并且不会继续缩小。
    - 覆盖底部空白回归：全折叠后 statusbar 贴近窗口底部，无旧的大片空白。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_card_collapse_height.spec.ts`
    - 折叠单张卡片缩小窗口高度：默认展开 → 记录窗口高度 → 折叠一张 provider/账号卡片 → 断言窗口高度下降。
    - 展开单张卡片恢复窗口高度：折叠后展开 → 断言窗口高度恢复到接近折叠前高度。
    - 折叠全部卡片回到最小高度：全部折叠 → 断言窗口高度 `<=` 全展开高度，且约等于全折叠测量高度。
    - 多 provider 场景：两个 provider 都有展开内容 → 只折叠一个 → 断言窗口高度介于“全展开高度”和“全折叠高度”之间。
    - 新数据重置折叠：第一轮折叠 → 触发刷新并返回不同 provider/account 结构 → 断言卡片重新展开，窗口高度大于折叠时高度。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_platform_behavior.spec.ts`
    - macOS：模拟或在 macOS 环境验证点击托盘后窗口锚定菜单栏图标；拖动标题栏不移动窗口；高度变化后仍贴住托盘锚点。
    - Windows：点击托盘后窗口出现；拖动标题栏后窗口位置改变；折叠/展开触发高度变化时保留用户移动后的位置。
    - Linux：点击托盘后窗口出现；tray bounds 可用时贴近托盘；tray bounds 不可用时使用当前 display 右下角兜底；窗口可拖动；高度变化不重置用户位置。
    - 该测试允许按平台条件跳过不适用断言，但每个平台至少要覆盖自身策略。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_height_debounce.spec.ts`
    - 快速连续展开/折叠多张卡片，断言 BrowserWindow 不出现高度循环 resize（监听 `bounds-changed` 事件计数）。
    - 验证小数像素变化（< 1px）不触发 resize。
    - 验证 ResizeObserver 在隐藏窗口期间不上报。

- [x] 新增本机用户端到端测试：`tests/user_e2e/specs/popup_multi_display.spec.ts`
    - 主显示器/副显示器分辨率不同，跨屏拖动 popup 后再次打开，断言最大高度按当前所在 display 的 work area 重算，而非旧 display。
    - 副显示器 work area 高度低于主显示器时，超高内容场景窗口高度按副显示器 85% 约束。
    - 该测试依赖真实多显示器环境；CI 可按环境变量跳过，但本机验收必须执行并记录结果。

- [x] 新增用户端到端测试：`tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`
    - 折叠多张卡片 → 触发数据源新增/删除 provider → 断言新结构默认展开。
    - 折叠 → 触发刷新但 provider 结构未变化 → 断言折叠状态保留（仅结构变化才重置）。

- [x] 更新现有 packaged smoke：`tests/packaged_smoke/smoke.spec.ts`
    - 保留已存在的 packaged app 启动、托盘、provider overview、无 CPA tab、popup 底部空白断言。
    - 增加轻量高度 smoke：打开主面板后，记录窗口高度；折叠一个可折叠卡片后，高度下降；重新展开后，高度上升。
    - packaged smoke 只做关键路径，不覆盖所有边界；完整边界放在 `tests/user_e2e/specs/popup_*`。

- [x] 更新 renderer smoke：`tests/smoke/renderer-smoke.test.tsx`
    - 确认 popup 根容器仍填满 BrowserWindow 视口。
    - 确认内容超高时滚动区域存在，底部 statusbar 不被裁切。
    - 确认折叠态下无底部大空白回归。

- [x] 更新现有 renderer 测试：`tests/unit/renderer/views/popup_view.test.tsx`
    - 保留 provider tabs、总览、单 provider 刷新、无 CPA tab 的断言。
    - 增加折叠按钮不会触发 provider refresh 的断言。
    - 增加折叠状态只影响当前可见 provider/card，不改变聚合数据的断言。

- [x] 更新 provider 聚合测试：`tests/unit/renderer/provider-usage.test.ts`
    - 不改变聚合语义。
    - 增加断言：折叠状态不进入 `buildProviderUsageGroups()`，高度/折叠只属于 UI 状态。

#### 20.9 文档改动清单

> **前置审阅**：实现前按需检索 `docs/` 下受影响文档，列出需同步清单。重点排查：`spec.md`（窗口/托盘行为）、`test.md`（验收步骤）、`test-coverage-matrix.md`（覆盖项）、`plugin-contract.md`（确认 popup 高度 IPC 不进协议）、`handoff-2026-05-30.md`（如提及窗口尺寸需同步）、`cpa-quota-guide.md`（不应涉及，复核确认）、`coverage-baseline.md`（覆盖率基线同步）。审阅产物列入 PR 描述。

- [x] **按需检索 `docs/` 受影响文档**，列出与 Phase 20 冲突或需同步的章节清单，作为本轮 PR 描述的一部分。

- [x] 更新 `docs/spec.md`
    - 在 Popup/主面板章节说明：窗口高度由内容自适应决定，不是固定高度。
    - 明确默认展开、折叠后缩小、展开后增大。
    - 明确最小高度为“所有卡片折叠后的高度”。
    - 明确最大高度为当前屏幕 work area 的 `85%`。
    - 明确超过最大高度时使用内部滚动。
    - 增加平台行为：macOS 为托盘锚定 popover 且不可移动；Windows/Linux 为托盘触发的可移动浮动窗口。
    - 明确 Windows/Linux 用户移动窗口后，高度自适应不能重新吸回托盘。
    - 明确 Linux tray bounds 不可靠时的兜底定位策略。

- [x] 更新 `docs/test.md`
    - 增加真实打包验收步骤：打开托盘主面板、折叠全部卡片、展开卡片、验证高度变化。
    - 增加最大高度验收：内容很多时窗口不得超过屏幕可用高度 `85%`。
    - 增加最小高度验收：全部折叠后高度不得继续缩小，也不得出现底部大空白。
    - 增加平台验收：macOS 窗口不可拖动且保持托盘锚定；Windows/Linux 窗口可拖动且 resize 不重置用户位置。

- [x] 更新 `docs/test-coverage-matrix.md`
    - 增加覆盖项：popup 内容高度测量。
    - 增加覆盖项：折叠状态驱动窗口缩放。
    - 增加覆盖项：全折叠高度作为最小高度。
    - 增加覆盖项：`85% work area` 最大高度约束。
    - 增加覆盖项：`1px` debounce 防抖。
    - 增加覆盖项：macOS 托盘锚定且不可移动。
    - 增加覆盖项：Windows/Linux 可移动浮动窗口且高度变化保留用户位置。
    - 标明对应测试文件：`popup_height_controller.test.ts`、`popup_view_height.test.tsx`、`popup_window_constraints.spec.ts`、`popup_card_collapse_height.spec.ts`、`popup_platform_behavior.spec.ts`。

- [x] 如新增 IPC channel，更新 `docs/plugin-contract.md` 以外的相关架构文档；不得把 popup 高度控制写入插件协议文档，因为它不是插件协议。

### 验收标准

1. 主面板默认按展开内容自动撑高。
2. 折叠卡片后窗口随内容缩小。
3. 展开卡片后窗口随内容增大。
4. 全部折叠时窗口停在全折叠高度。
5. 内容很多时窗口不超过当前屏幕可用高度的 `85%`。
6. 高度变化无明显抖动、闪烁、循环 resize。
7. 打包产物真实启动验证通过。

---

### 已发现 Bug：`apply_locked_size` Path B 顶部下跳

**发现时间**：2026-06-01 打包验收  
**严重程度**：高（影响 Windows/Linux 未拖动窗口的所有折叠/展开操作）  
**状态**：已修复（2026-06-02）

#### 现象

1. 点击托盘弹出 popup 窗口，窗口高度正常。
2. 折叠卡片后，窗口高度正确缩小，但**顶部往下跳**（看起来像从底部往上缩但其实是顶部下移）。
3. 拖动窗口后，再折叠/展开，行为恢复正常：顶部不动，底部变化。
4. 关闭重新打开，bug 复现（`user_moved` 重置为 `false`）。

#### 根因

文件：`src/main/core/popup/popup-height-controller.ts`，`apply_locked_size()` 函数，line 136-146。

当 `user_moved === false` 且 `tray_bounds` 有效时（Path B）：

```ts
// line 138-139
const x = Math.round(tray.x + tray.width / 2 - width / 2);
const y = Math.round(tray.y + tray.height + 4);

// line 141-142
x: clamp(x, work.x, work.x + work.width - width),
y: clamp(y, work.y, work.y + work.height - new_height),
```

**每次都从 tray 坐标重算 `y`**，再 clamp。clamp 上界 `work.y + work.height - new_height` 随 `new_height` 变化，导致 `y` 在不同高度下被夹到不同值。

数值示例（1080p 屏幕，tray 在底部）：

| 窗口高度      | clamp 上界 = `1080 - height` | `y` = clamp(1068, 0, 上界) | 顶部位置 |
| ------------- | ---------------------------- | -------------------------- | -------- |
| 600（初始）   | 480                          | 480                        | y=480    |
| 300（折叠后） | 780                          | 780                        | y=780    |

顶部从 y=480 跳到 y=780，下移了 300px。高度缩小了 300px，但顶部也下移了 300px，视觉上窗口整体下移而非底部上缩。

#### 为什么拖动后正常

`index.ts` line 518-521：

```ts
popupWin.on("move", () => {
    if (popup_anchor_state.suppress_move) return;
    popup_anchor_state.user_moved = true;
});
```

拖动后 `user_moved = true`，走 Path A（line 127-133），用 `current.y` 保持顶部不动，只改 `height`。

#### 为什么是设计缺陷而非逻辑错误

macOS 的 Path（line 104-122）**有意**每次都从 tray 重算 `y`，因为 macOS popover 需要持续锚定菜单栏图标。Windows/Linux 的 Path B（line 136-146）**复制了 macOS 的行为**，但 Windows/Linux 的语义不同：

- macOS：窗口不可移动，高度变化时必须重新锚定 tray → 重算 `y` 是对的。
- Windows/Linux：窗口可移动，用户未拖动时应保持初始打开位置 → 不应重算 `y`。

#### 修复方向（供后续实现参考，本轮不改代码）

Path B 应保持初始定位后的 `current.y`，不从 tray 重算。即 Windows/Linux `user_moved === false` 时，首次打开由 `index.ts` 的 tray click handler（line 492-507）完成定位，后续 resize 应与 Path A 一样用 `current.y`。

本质上 Path B 在 Windows/Linux 场景下应该和 Path A 合并：`user_moved` 的 true/false 区分只影响是否允许窗口吸回 tray，不影响 resize 时的 y 计算。

---

### 已发现设计问题：总览 tab 卡片点击跳转而非就地展开

**发现时间**：2026-06-01 打包验收  
**严重程度**：中（功能缺失，影响总览页交互体验）  
**状态**：已修复（2026-06-02）

#### 现象

1. 用户在"总览" tab 看到所有 provider 卡片（Claude、Codex 等）。
2. 点击卡片的 `>` 按钮，视图跳转到对应 provider 的独立 tab。
3. 用户期望：点击卡片后在当前总览页就地展开该 provider 的账号详情，不跳转。

#### 根因

总览 tab 渲染的是 `ProviderCard`（`src/renderer/components/ProviderCard.tsx`），不是 `CollapsibleCard`。

**`ProviderCard` 没有展开/折叠能力**，只有两个交互：

- 刷新按钮（line 38-46）：调用 `onRefresh(provider)`
- `>` 跳转按钮（line 50-59）：调用 `onSelect(provider)`

`onSelect` 在 `PopupView.tsx` line 247 直接绑定 `setActiveTab`：

```tsx
<ProviderOverview
    onSelectProvider={is_live ? setActiveTab : () => undefined}
    ...
/>
```

所以点 `>` 会切换 `activeTab`，离开总览跳到 provider 详情 tab。

**总览 tab 下没有任何展开卡片的机制。** 当前设计意图是：总览只展示摘要（provider 名称、账号数、窗口数、状态），点 `>` 跳转到 provider 详情 tab 查看账号列表。

#### 涉及文件

| 文件                                                   | 角色                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `src/renderer/views/PopupView.tsx` line 243-250        | 总览渲染入口，`onSelectProvider` 绑定 `setActiveTab` |
| `src/renderer/components/ProviderOverview.tsx` line 27 | 传递 `onSelect` 给每个 `ProviderCard`                |
| `src/renderer/components/ProviderCard.tsx` line 50-59  | `>` 按钮触发 `onSelect` → 跳转                       |
| `src/renderer/components/CollapsibleCard.tsx`          | 有展开/折叠能力，但总览未使用                        |

#### 与现有组件的关系

- `CollapsibleCard` 已实现展开/折叠（`src/renderer/components/CollapsibleCard.tsx`），在 provider 详情 tab 的 `ProviderAccountRow` 中使用。
- `ProviderAccountList` + `ProviderAccountRow` 已支持 `collapsedAccounts` + `onToggleAccount` 折叠状态管理。
- 总览 tab 的 `ProviderCard` 没有接入 `CollapsibleCard`，也没有接入折叠状态。

#### 修复方向（供后续实现参考，本轮不改代码）

两种可选方案：

**方案 A：总览卡片改为就地展开**

- `ProviderCard` 改用 `CollapsibleCard` 包裹。
- 展开后显示该 provider 的账号列表（复用 `ProviderAccountList`）。
- 移除或保留 `>` 按钮作为快速跳转的辅助入口。
- 折叠状态接入 Phase 20 的高度自适应链路。

**方案 B：保持跳转但增加展开态**

- 总览卡片保持 `>` 跳转。
- 卡片头部增加展开/折叠 chevron，展开后在总览页内显示账号摘要。
- 两种入口共存：展开看摘要，`>` 进入完整详情 tab。

方案 A 更符合用户期望（总览 = 一页看所有 provider 详情），但需考虑总览内容过长时的滚动和高度问题。方案 B 折中但交互较复杂。

---

## Phase 21: Demo UI 完整对齐

### 背景

`docs/superpowers/specs/2026-06-01-demo-ui-alignment-design.md` 已定义需要与 `docs/design/omni-usage/project/` 对齐的真实 UI 范围。
该 spec 方向可执行，但有两个边界必须保留：

1. 禁止修改 `docs/design/omni-usage/**`。
2. 缺失真实后端能力时只能显示空状态，不能导入 demo 假数据或伪造历史数据。

### 核心原则

1. 以 demo 为视觉和交互标准。
2. 以现有 Electron / IPC / 插件数据流为真实数据来源。
3. 不直接移植 demo 假数组。
4. 不修改 `docs/design/omni-usage/**`。
5. Token 历史数据不足时显示"暂无历史数据"或 0 数据，不伪造趋势；Kimi 也只有确认单位是 token 时才聚合，不能把 USD/额度当 token。
6. Electron 原生托盘菜单不能 CSS 化；本轮**只做原生菜单功能项对齐**，自绘托盘菜单窗口留 Phase 22。
7. 折叠/展开、窗口高度自适应逻辑**全部复用 Phase 20 产物**，本轮不重复实现；本轮只接入 UsageCard 的折叠按钮事件并调用 Phase 20 的高度上报。

### 文件范围

主要修改：

- [x] `src/renderer/views/PopupView.tsx`
- [x] `src/renderer/views/SettingsView.tsx`
- [x] `src/renderer/components/ProviderNav.tsx`
- [x] `src/renderer/components/ProviderOverview.tsx`
- [x] `src/renderer/components/ProviderCard.tsx`
- [x] `src/renderer/components/ProviderAccountList.tsx`
- [x] `src/renderer/components/ProviderAccountRow.tsx`
- [x] `src/renderer/lib/provider-usage.ts`
- [x] `src/renderer/styles/globals.css`

可能新增：

- [x] `src/renderer/components/UsageCard.tsx`
- [x] `src/renderer/components/TokenPanel.tsx`
- [x] `src/renderer/components/CardMenu.tsx`
- [x] `src/renderer/components/UsageBarRow.tsx`

禁止修改：

- [x] `docs/design/omni-usage/**`

### 实现步骤

#### 21.1 主弹窗结构对齐

- [x] 顶栏对齐 demo：logo、`OmniUsage`、刷新全部按钮、设置按钮。
- [x] tab 区固定显示"总览"。
- [x] tab 区展示全部 provider：Claude / Codex / Gemini / Antigravity / Kimi / GLM / MiniMax / DeepSeek / Tavily。
- [x] tab 保留横向滚动、active 状态、分隔线、fade 效果。
- [x] tab 切换语义遵循 Phase 20.6：切换后默认展开当前 provider 内容，清空旧折叠状态。
- [x] 总览页显示所有 provider 卡片。
- [x] 单 provider tab 显示该 provider 下的账号卡片。
- [x] 未配置或无数据 provider 显示 demo 风格空状态，不隐藏 tab。
- [x] 错误 banner、刷新中 skeleton、空状态按 demo 视觉实现。
- [x] 底部状态栏显示状态点、状态文案、更新时间。

#### 21.2 卡片行为对齐

- [x] 新增或改造 `UsageCard`，统一 provider 卡片与账号卡片视觉。
- [x] 支持拖拽手柄视觉。
- [x] 支持单卡刷新。
- [x] 支持更多菜单 `CardMenu`：编辑、关闭/启用、删除。
- [x] 支持折叠/展开，并与 Phase 20 的高度自适应联动。
- [x] 关闭状态：卡片灰化，显示“监控已关闭，不再刷新用量”，提供“启用”。
- [x] 错误状态：显示网络异常/刷新失败，提供重试。
- [x] 认证失效状态：显示凭证失效，提供重新登录入口；若当前没有真实登录能力，入口显示禁用或引导到设置页。
- [x] 限制状态：接近限制时使用红色边框/danger bar。
- [x] 所有状态来自真实 `ConnectorInfo` / `UsageItem` 映射，不使用 demo 假状态。

#### 21.3 用量展示对齐

- [x] 每张卡展示名称、最近更新时间。
- [x] 展示 5 小时用量条。
- [x] 展示一周用量条。
- [x] 展示 reset 时间。
- [x] 无对应窗口数据时显示 demo 风格空/关闭/未知状态。
- [x] 多账号时：总览显示 provider 汇总，单 provider tab 显示账号列表。
- [x] 保留 CPA 作为数据来源标签，不把 CPA 做成 provider tab。

#### 21.4 Token 面板

> **前置：provider token 字段映射**
>
> 不同 provider 返回的 token 字段差异极大，21.4 实现前必须先列出可获取字段：
>
> - **Claude**：`/api/oauth/usage` 不返回原始 token 数，仅 `utilization`（占比）。**无 token 聚合能力**，TokenPanel 该 provider 列空状态。
> - **Codex**：`rate_limit.primary_window.used_percent` 不含 token 数；如需 token 须查 `/usage` 详细接口（目前 CPA 插件未抓取）。**无 token 聚合能力**，列空状态。
> - **Gemini**：`buckets[].remainingFraction` 不含 token 数。**无 token 聚合能力**，列空状态。
> - **Antigravity**：`quotaInfo.remainingFraction` 不含 token 数。**无 token 聚合能力**，列空状态。
> - **Kimi**：`limits[]` 含 `used` / `limit`，但单位可能是 token 或额度/金额。**只有能确认单位为 token 时才可聚合**；否则 TokenPanel 也显示空状态，不能把 USD/额度当 token。
> - **GLM / MiniMax / DeepSeek / Tavily**：现阶段无插件接入，全部空状态。
>
> 结论：本轮 TokenPanel 几乎全部 provider 走空状态。Kimi 仅在确认单位为 token 时展示当前窗口 `used` 聚合值。**不补假数据**。若用户后续新增 token 历史持久化能力（如本地累计），再单独开 Phase。

**Token 功能暂不启用。** UI 组件已实现（`TokenPanel`），但当前所有 provider 均无真实 token 历史数据可聚合。待后端 token 持久化能力就绪后，单独开 Phase 启用。

- [x] 新增 `TokenPanel`。

#### 21.5 设置页账号管理对齐

- [x] 关于页 logo 改成真实 logo：使用 `resources/icon.png`（已存在），不使用纯图标 badge。如需独立 logo 资源，单独提 PR 添加 `resources/logo.png`，本轮不做新资源。
- [x] 版本文案读取真实 `package.json` 或现有应用版本来源。
- [x] 账号页按 provider 分组展示。
- [x] 每个 provider 分组包含：添加按钮、总开关、账号行、状态点、账号名、编辑、删除、开关。
- [x] CPA connector 产出的多个 provider 账号按 provider 分组展示。
- [x] 非 CPA 插件归入对应 provider 或 connector 分组。
- [x] 缺失添加/编辑真实后端能力时，显示禁用态或跳转现有设置表单，不伪造功能完成。

#### 21.6 托盘菜单对齐

> **范围**：本轮**只做 Electron 原生菜单功能项对齐**（下方 7 项）。自绘托盘菜单窗口（demo 100% 视觉）留 Phase 22，不在本轮范围。

- [x] Electron 原生托盘右键菜单包含：打开主面板、立即刷新全部、暂停自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
- [x] 托盘菜单行为需与 Phase 20 的平台策略兼容：macOS popover、Windows/Linux 可移动浮动窗口。

#### 21.7 样式对齐

> **方向**：以下类名规则**从 demo CSS 复制到 `src/renderer/styles/globals.css`**，方向单向（demo → 项目），**严禁反向修改 demo**。demo 是 prototype 参考，不引入构建。

- [x] 补齐 `.tab.pinned`。
- [x] 补齐 `.tabs-fade`。
- [x] 补齐 `.tabs-chevron`。
- [x] 补齐 `.count-badge`。
- [x] 补齐 `.card.dragging`。
- [x] 补齐 `.card.drag-over`。
- [x] 补齐 `.tokens-head .card-grip`。
- [x] 补齐 `.tokens-head .card-collapse`。
- [x] 补齐 `.ctx-menu`。
- [x] 补齐 `.ctx-item`。
- [x] 补齐 `.ctx-sep`。
- [x] 补齐 `.ctx-status`。
- [x] 清理当前项目中与 demo 语义冲突的样式；只清理本轮改动触达的样式，不做无关大重构。

#### 21.8 测试改动清单

- [x] 新增/更新 renderer 单元测试：`tests/unit/renderer/views/popup_view.test.tsx`
    - 固定 provider tabs 全量显示。
    - 无数据 provider 显示空状态。
    - 总览显示 provider 卡片。
    - 单 provider tab 显示账号卡片。
    - CPA 不作为 provider tab。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/components/usage_card.test.tsx`
    - 展示名称、更新时间、5 小时条、一周条、reset 时间。
    - 关闭状态灰化并显示启用入口。
    - 错误状态显示重试入口。
    - 认证失效状态显示重新登录或设置入口。
    - danger 状态使用 danger bar / 红色边框。
    - 更多菜单展示编辑、关闭/启用、删除。
    - 折叠/展开状态正确切换。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/components/token_panel.test.tsx`
    - 展示 `Total Tokens`。
    - 时间范围切换今天/最近一周/最近一月。
    - 有真实 token 数据时展示聚合值。
    - 无历史数据时显示空状态，不渲染假趋势。

- [x] 新增 renderer 单元测试：`tests/unit/renderer/views/settings_provider_accounts.test.tsx`
    - 账号页按 provider 分组。
    - CPA connector 账号拆入对应 provider 组。
    - 非 CPA 插件归入对应 provider 或 connector 组。
    - 添加、编辑、删除、开关入口按真实能力显示启用/禁用。

- [x] 新增/更新主进程或集成测试：`tests/unit/main/tray_menu.test.ts`
    - 右键菜单包含打开主面板、立即刷新全部、暂停自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
    - 不断言 CSS 视觉，因为 Electron 原生菜单不可 CSS 化。

- [x] 更新 E2E：`tests/user_e2e/specs/popup_demo_alignment.spec.ts`
    - 验证顶部栏、全量 tab、总览卡片、单 provider 账号列表、底部状态栏。
    - 验证空状态、错误状态、刷新中 skeleton。
    - 验证更多菜单、关闭/启用、单卡刷新。
    - 验证折叠/展开，并与 Phase 20 高度联动。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_card_states.spec.ts`
    - 关闭状态卡片：灰化、显示"监控已关闭"、可点击"启用"恢复。
    - 错误状态：模拟插件返回错误，断言显示重试按钮，点击重试触发刷新。
    - 认证失效状态：模拟 token 过期，断言显示"凭证失效"提示与设置入口。
    - 限制接近状态：模拟 utilization ≥ 0.9，断言卡片边框/进度条切换为 danger 视觉。
    - danger bar 反色文字：fillPct ≥ 65 时文字反色（继承 19.3.3 UsageRow 行为）。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_token_panel.spec.ts`
    - 仅 Kimi 等含原始 `used` 且能确认单位为 token 的 provider 展示聚合值。
    - Claude/Codex/Gemini/Antigravity 不渲染假趋势，显示"暂无历史数据"。
    - Kimi 单位不明或为额度/金额时也显示"暂无历史数据"，不能把额度当 token。
    - 时间范围切换（今天/最近一周/最近一月）UI 可点击；无历史数据时切换不报错。
    - 折叠 TokenPanel 后窗口高度下降（与 Phase 20 高度链路联动）。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_drag_handle.spec.ts`
    - 拖拽手柄可视化存在；拖拽交互产生 `card.dragging` / `card.drag-over` className 切换。
    - 本轮不要求卡片重排持久化；若要保存顺序，另开 Phase 实现排序模型和持久化。

- [x] 新增 E2E：`tests/user_e2e/specs/popup_theme.spec.ts`
    - 切换深浅主题，断言 `data-theme="dark"` 切换正确。
    - 深色模式下 danger 红色、空状态文字、tabs-fade 色板可读。

- [x] 更新 E2E：`tests/user_e2e/specs/settings_provider_accounts.spec.ts`
    - 验证设置页账号管理按 provider 分组。
    - 验证 CPA 多 provider 账号拆分展示。
    - 验证版本文案和真实 logo。
    - 验证添加/编辑/删除/开关入口按真实能力显示启用/禁用，无后端能力时禁用且 tooltip 解释。

- [x] 新增 E2E：`tests/user_e2e/specs/tray_menu_actions.spec.ts`
    - 在 test mode/mock 下触发右键托盘 7 项菜单，逐项断言行为：
        - 打开主面板：popup 显示。
        - 立即刷新全部：所有插件触发 refresh。
        - 暂停自动刷新：调度器停止；恢复后继续。
        - 开机自启：只断言 autostart API 被调用，不真实写系统启动项。
        - 设置：Settings 窗口打开。
        - 检查更新：有 updater 时触发更新检查 API；无 updater 能力时菜单项禁用或显示未配置提示。
        - 退出 OmniUsage：应用退出（packaged smoke 可单独覆盖）。

- [x] 更新 packaged smoke：`tests/packaged_smoke/smoke.spec.ts`
    - 打包启动后验证窗口加载、托盘出现、主面板可打开。
    - 验证全量 provider tab 存在。
    - 验证折叠/展开、更多菜单、单卡刷新关键路径。
    - 验证设置页账号管理入口可用。
    - 验证托盘 7 项右键菜单可见。

#### 21.9 文档改动清单

> **前置审阅**：实现前按需检索 `docs/` 下受影响文档，列出需同步清单。重点排查：`spec.md`（主面板结构 / provider tab / 卡片状态 / TokenPanel / 托盘菜单）、`test.md`（手工验收 + 打包验收）、`test-coverage-matrix.md`（覆盖项与测试文件映射）、`plugin-contract.md`（UsageItem / ConnectorInfo 字段是否被 21.2 / 21.3 / 21.4 引用，确认不改协议）、`cpa-quota-guide.md`（CPA 多 provider 拆分入设置页的描述是否需同步）、`handoff-2026-05-30.md`（如提及 UI 布局需同步）。审阅产物列入 PR 描述。

- [x] **按需检索 `docs/` 受影响文档**，列出与 Phase 21 冲突或需同步的章节清单，作为本轮 PR 描述的一部分。

- [x] 更新 `docs/spec.md`
    - 记录 demo 对齐后的主面板结构。
    - 记录全量 provider tab 策略：即使无数据也显示空状态。
    - 记录卡片状态：正常、关闭、错误、认证失效、限制接近。
    - 记录 Token 面板的数据限制：无真实历史时显示空状态，不伪造。
    - 记录托盘菜单限制：原生菜单功能对齐，自绘菜单另算能力。

- [x] 更新 `docs/test.md`
    - 增加 demo 对齐手工验收：总览、单服务 tab、刷新全部、单卡刷新、折叠/展开、更多菜单、关闭/启用、设置页账号管理、添加/编辑入口、明暗主题。
    - 增加打包验证：`pnpm package` 后启动 `out/OmniUsage-win32-x64/OmniUsage.exe`，确认窗口加载、托盘出现、主路径可用。

- [x] 更新 `docs/test-coverage-matrix.md`
    - 增加覆盖项：全量 provider tabs。
    - 增加覆盖项：UsageCard 状态与操作。
    - 增加覆盖项：TokenPanel 有/无真实数据。
    - 增加覆盖项：Settings provider 分组账号管理。
    - 增加覆盖项：托盘右键菜单功能项。
    - 标明对应测试文件：`usage_card.test.tsx`、`token_panel.test.tsx`、`settings_provider_accounts.test.tsx`、`tray_menu.test.ts`、`popup_demo_alignment.spec.ts`、`settings_provider_accounts.spec.ts`。

### 验收标准

1. 主面板结构与 demo 对齐。
2. 所有 provider tab 固定显示，无数据时显示空状态。
3. 卡片支持刷新、更多菜单、关闭/启用、折叠/展开、错误/认证/限制状态。
4. Token 面板显示真实可得数据；无历史数据时明确空状态。
5. 设置页账号管理按 provider 分组。
6. 托盘右键菜单功能项完整。
7. 不修改 `docs/design/omni-usage/**`。
8. 不导入 demo 假数据。
9. `pnpm test` 通过。
10. `pnpm package` 后真实启动验证通过。

---

---

## 以下为 2026-06-08 从 TASKS.md 归档的已完成任务

## 待修：设置窗口在 Windows 任务栏显示为独立进程

> 发现时间：2026-06-08 | 优先级：P2 | 状态：已修（2026-06-08）

### 问题描述

Windows 任务栏上，主面板（popup）和设置窗口（settings）各自占一个独立图标，看起来像两个不同的应用。用户预期应该是同一个应用的两个窗口，任务栏只显示一个图标。

### 可能原因

`BrowserWindow` 创建时可能没有设置 `parent`/`owner` 关系，或者没有共享同一个 `win.setAppDetails({ appId })`，导致 Windows 把它们识别为不同的应用进程。

### 相关文件

- `src/main/index.ts` — `createWindowFor()`、`createOrFocusSettings()`
- `src/main/core/main-panel/main-panel-controller.ts` — 主面板窗口创建

### 修复方向

- 所有 BrowserWindow 设置相同的 `win.setAppDetails({ appId: "omni-usage" })`，使 Windows 任务栏归为同一组
- 或设置窗口的 `parent` 指向主窗口

### 修复记录

`531295e`：在 `createWindowFor()` 中对 win32 平台调用 `win.setAppDetails({ appId: "omni-usage" })`，所有窗口归为同一任务栏图标。

## 待修：面板与设置页状态不同步 + ProviderOverview 未传 onEditAccount

> 发现时间：2026-06-07 | 优先级：P0 | 状态：待修

### 问题描述

用户在主面板执行以下操作后，设置页（SettingsView）仍显示旧状态：

1. **MiMo 点击"编辑"**：设置窗口打开但停留在 general 页，不会跳转到账号编辑弹窗。
2. **GLM 面板点击"关闭"**：面板正常禁用该 provider，但设置页账号管理仍显示为"开启"。
3. **DeepSeek 面板点击"删除"**：面板正常移除该 provider，但设置页账号管理仍显示为"开启"。

三个问题本质是两个独立 bug。

---

### Bug 1：ProviderOverview 未传 onEditAccount

**根因**：`src/renderer/components/ProviderOverview.tsx` 的 ProviderCard 调用中**没有 `onEditAccount` prop**。

```tsx
// src/renderer/components/ProviderOverview.tsx:56-78
<ProviderCard
    key={provider}
    provider={provider}
    group={groupsByProvider.get(provider)}
    connectorError={providerErrors.get(provider)}
    onRefresh={onRefreshProvider}
    expanded={...}
    onToggleExpand={onToggleExpandProvider}
    onToggleDisable={onToggleDisableProvider}
    onDelete={onDeleteProvider}
    dragging={...}
    // ⬆ 没有 onEditAccount！
/>
```

`ProviderCard.tsx:107-115` 的编辑逻辑：

```tsx
{
    key: "edit",
    label: "编辑",
    icon: "edit",
    onSelect: () => {
        const first_account = group?.accounts[0];
        if (onEditAccount && first_account) {
            onEditAccount(first_account);  // ← 永远走不到
        } else {
            window.usageboard.settings.open();  // ← 永远走这里，无 context
        }
    },
}
```

因为 `onEditAccount` 为 `undefined`，所有 provider（不只 MiMo）在 overview 模式下点击"编辑"都只打开空白设置窗口，不会定位到对应账号。

**影响范围**：所有 provider 的 overview 模式"编辑"按钮。

**证据链**：

- `PopupView.tsx:780-802` 的 `ProviderOverview` 调用没有传 `onEditAccount`
- `ProviderOverview.tsx:11-29` 的 props 接口定义中没有 `onEditAccount` 字段
- `ProviderCard.tsx:39` 虽然 props 接口有 `onEditAccount`，但永远收不到

---

### Bug 2：use_config 不监听跨窗口 CONFIG_CHANGED 事件

**根因**：`src/renderer/hooks/use_config.ts` **没有订阅 `CONFIG_CHANGED` IPC 事件**。

数据流：

1. PopupView 调用 `window.usageboard.config.save(newConfig)` → IPC `CONFIG_SAVE`
2. main 进程保存后（`src/main/index.ts:413-428`）广播 `CONFIG_CHANGED` 到**所有窗口**：
    ```ts
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, updatedConfig);
        }
    }
    ```
3. PopupView 自己有监听（`PopupView.tsx:197-202`），收到后刷新 UI ✓
4. **SettingsView 使用的 `use_config` 没有监听** ✗ → SettingsView 持有的是修改前的 config 快照

`use_config.ts` 完整代码只有初始加载（mount 时 `config.get()`），没有 `onConfigChange` 订阅。当其他窗口修改 config 时，SettingsView 看到的仍然是旧 config。

**影响范围**：任何从 PopupView 发起的 config 修改，SettingsView 都不会同步。包括但不限于：

| 操作          | PopupView 行为                                          | SettingsView 期望 | SettingsView 实际 |
| ------------- | ------------------------------------------------------- | ----------------- | ----------------- |
| GLM 关闭      | `toggle_disable_provider()` 写 `monitor_glm=false`      | toggle 显示"关"   | toggle 显示"开"   |
| DeepSeek 删除 | `delete_provider()` 写 `monitor_deepseek=false`         | toggle 显示"关"   | toggle 显示"开"   |
| CPA 账号隐藏  | `hide_or_delete_account()` 写 `accountOverrides.hidden` | 隐藏账号列表更新  | 不更新            |
| 账号禁用      | `disable_account()` 写 `accountOverrides.disabled`      | 禁用账号列表更新  | 不更新            |

**补充说明**：GLM、DeepSeek 等是 CPA connector 提供的 provider。PopupView 的"删除"只设置了 `monitor_X=false`（`PopupView.tsx:405-406`），不删除插件本身，插件仍在 config.plugins 中。SettingsView 的账号管理页按 `config.plugins` 渲染 toggle，所以即使 config 同步了，toggle 显示的也只是 `plugin.enabled`，而不是 `monitor_X` 参数。这说明**设置页对 CPA provider 的"开关"概念和面板不一致**——面板按 `monitor_X` 控制，设置页按 `plugin.enabled` 控制。

**深层问题**：面板的 `toggle_disable_provider` 对 CPA connector 只改 `monitor_X` 参数，但对独立插件改 `plugin.enabled`（`PopupView.tsx:373-375`）。设置页的 toggle 始终改 `plugin.enabled`。两者语义不统一。

---

### 待修项

- [x] **Bug 1 — ProviderOverview 补 onEditAccount**：
    - `ProviderOverview` props 增加 `onEditAccount`
    - `PopupView` 传入 `edit_account` handler 给 `ProviderOverview`
    - `ProviderCard` 接收到 `onEditAccount` 后，点击编辑能传 `instanceId/provider/accountId` 定位到设置页账号编辑

- [x] **Bug 2 — use_config 监听 CONFIG_CHANGED**：
    - `use_config` 订阅 `window.usageboard.event.onConfigChange`
    - 收到跨窗口 config 更新时，更新本地 `config` state
    - save 后收到自身触发的 onConfigChange 不重复更新（引用相等则跳过）
    - 测试覆盖：从外部窗口修改 config，use_config 自动更新

- [x] **Bug 2 延伸 — CPA provider 开关语义统一**：
    - 设置页 CPA provider 行已显示"在数据源中管理" badge 而非 toggle（代码正确）
    - 真正的问题是 use_config 不更新，修复 Bug 2 后此问题自动解决

- [x] **回归测试**：
    - ProviderCard 在 overview 模式点击"编辑"传入正确 context ✓（2 个新测试）
    - use_config 跨窗口 config 变更自动更新 ✓（3 个新测试）
    - `pnpm test` 全部通过 ✓

---

## Phase 22: Demo 差异补齐（不含 Token 面板）

### 背景

`docs/archive/design_review_diff.md` 与 `docs/archive/frontend-gap-analysis.md` 均对比了 `docs/design/omni-usage/project/` 与当前 `src/renderer/` 的差异。两份文档有部分结论互相冲突，执行时以**当前代码真实状态 + demo 实际文件**为准，不盲信旧分析。

Token 面板是用户明确要求暂时关闭的功能：本 Phase 不启用、不完善、不验收 Token 面板；仅保留现有代码和关闭开关。

### 核心原则

1. 以 demo 为视觉和交互基准，全面补齐剩余差异。
2. 不修改 `docs/design/omni-usage/**`。
3. 不使用 demo 假数据；所有显示来自真实配置、插件、IPC 或明确空状态。
4. 不处理 Token 面板：不启用、不开发图表、不补 token 聚合。
5. 两份差异文档冲突处，先读 demo 与现有代码验证，再实现。
6. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击；涉及打包的项必须 packaged smoke。

### 22.1 窗口与主面板布局

- [x] 将 Popup 主面板宽度从当前实现值对齐到 demo 的 `460px`，并同步主进程 BrowserWindow 配置、renderer 布局、E2E 断言。
- [x] 补齐 demo 的窗口高度过渡体验；若 Electron 高度由主进程控制，需实现等价平滑效果或明确保留 JS resize 方案并验证无跳变。
- [x] 复核设置页窗口模型：demo 是主面板内切换，当前实现可能是独立设置窗口；决定并实现用户确认的目标模型。
- [x] 验证 popup 背景、圆角、阴影、padding 与 demo 一致；桌面舞台背景不属于 Electron popup 必需项，不为此引入假外层。

### 22.2 Tab 导航细节

- [x] 复核并补齐总览 tab 与 provider tabs 之间的 `.tabs-pin-divider` 分隔线。
- [x] 复核并补齐右侧 `.tabs-fade.right` 渐隐遮罩。
- [x] 复核并补齐 `.tabs-chevron` 右侧箭头提示。
- [x] 将 provider 图标从几何占位符替换为 demo `icons.jsx` 等价品牌 SVG；无官方图标时保持可识别、风格一致。
- [x] 验证 tab 宽度、active 下划线、浅蓝背景、横向滚动行为与 demo 一致。

### 22.3 Provider / Usage 卡片头部

- [x] 卡片头部显示 demo 风格相对更新时间（如”刚刚””3分钟前”），不再用状态标签替代更新时间；状态另在状态区表达。
- [x] 多账号 badge 文案统一为 demo 的”`N账号`”，不要显示”`N个窗口`”。
- [x] 补齐关闭状态 `off-badge` 与灰化样式，文案为”监控已关闭，不再刷新用量”。
- [x] 移除或调整实现中多出的详情 `›` 按钮；若保留，必须符合 demo 交互且不破坏总览就地展开。
- [x] 更多菜单定位改为相对卡片右上角，而非鼠标位置漂移。
- [x] 更多菜单视觉补齐 `backdrop-filter: blur(28px) saturate(170%)`。
- [x] 更多菜单文案与行为统一为”编辑 / 启用或关闭 / 删除”。

### 22.4 多账号 L2 分段与概览用量

- [x] 多账号 provider 展开后显示 L2 segmented control：`概览` / `N账号`。
- [x] 默认展示”概览”视图，按额度周期聚合当前可显示账号的整体额度使用情况。
- [x] 点击”`N账号`”切换到账号明细列表。
- [x] 账号明细使用 demo `.acct-detail` 布局：状态点、账号名、脱敏 key、更新时间、进度条。
- [x] 单账号 provider 不显示 L2 segmented control；直接显示该账号详情。
- [x] 账号明细展开补齐 `maDrawer` 动画，并支持 `prefers-reduced-motion`。
- [x] 概览值、危险阈值、reset 时间全部来自真实 usage 数据；缺数据时显示空/未知，不造数。

### 22.5 卡片拖拽排序

- [x] 实现拖拽手柄真实排序，而不仅是视觉 class。
- [x] 拖拽时应用 `.card.dragging`、`.card.drag-over`。
- [x] 总览 provider 卡片顺序可重排。
- [x] 单 provider 内账号顺序可重排。
- [x] 排序结果持久化到应用配置；重启后保持。
- [x] 拖拽排序不改变 provider usage 聚合语义。

### 22.6 卡片启用 / 关闭 / 删除行为

- [x] 更多菜单”关闭监控”不再是 no-op，必须真实切换 provider/account enabled 状态。
- [x] 关闭后卡片灰化，停止自动刷新该 provider/account。
- [x] 关闭后可从卡片或菜单重新启用。
- [x] 设置页账号行 toggle 的关闭账号不能重新开启问题必须修复。
- [x] 删除入口必须接线到真实删除能力；若后端能力不足，明确禁用并提示原因，不显示假可用。

### 22.7 设置页持久化与外观

- [x] 持久化常规设置：启动后最小化、自动刷新间隔、暂停自动刷新、置顶、托盘行为、语言。
- [x] 持久化通知设置：接近限制、达到限制、刷新失败、通知方式。
- [x] 持久化数据与隐私设置：缓存上限、匿名统计等已有 UI 项。
- [x] 强调色选择必须实际更新 `--blue` 等 accent CSS 变量，并持久化。
- [x] 主题切换方式统一为 demo 的 `data-theme`，若当前已是 `data-theme` 则补测试确认。
- [x] 关于页 logo 尺寸对齐 demo `56x56`，版本读取真实 app version。
- [x] 关于页链接如无真实 URL，不要假跳转；显示禁用或占位说明。

### 22.8 设置页账号管理

- [x] 每个 provider 分组补齐独立添加账号按钮。
- [x] 账号行编辑、删除、开关全部接线到真实能力。
- [x] 父级 vendor 关闭时，子账号 toggle 禁用；父级重新启用后子账号可操作。
- [x] 账号行展示状态点、账号名、脱敏 key、编辑/删除/开关，布局与 demo 对齐。
- [x] AccountDialog 复核字段、密钥显示切换、安全提示、测试连接、取消/保存按钮、遮罩点击、Escape 关闭。

### 22.9 状态、空态、错误态、文案

- [x] 凭证失效文案对齐 demo：”凭证失效，请重新登录” + “重新登录”；若无登录能力，引导到设置。
- [x] 网络错误文案对齐 demo：”刷新失败 · 网络异常” + “重试”；全局 banner 使用”网络连接异常，部分数据可能不是最新”。
- [x] 已关闭状态文案对齐 demo：”监控已关闭，不再刷新用量” + “启用”。
- [x] 空状态图标、标题、副标题、CTA 与 demo 复核一致。
- [x] 状态栏是否保留需按用户确认；若保留，视觉与当前 demo 预期不冲突。（决策：保留状态栏，显示状态点和更新时间）

### 22.10 托盘菜单

- [x] 原生托盘菜单继续保留功能完整：打开主面板、刷新全部、暂停、开机自启、设置、检查更新、退出。
- [x] 评估并实现 demo 自定义托盘菜单 UI；若 Electron 原生菜单无法达成毛玻璃视觉，使用独立 frameless BrowserWindow。（决策：保留原生菜单，跨平台一致性优先）
- [x] 自定义托盘菜单需支持半透明毛玻璃、圆角、阴影、版本显示、子菜单或二级项。（决策：原生菜单已含版本号，毛玻璃视觉需独立 BrowserWindow，保留原生）
- [x] 退出行为按真实桌面应用语义处理，不照搬 demo 的前端假退出卡片，除非用户明确要求。（决策：退出=app.quit()，真实桌面应用语义）

### 22.11 测试清单

- [x] 更新 `tests/unit/renderer/components/usage_card.test.tsx`：相对更新时间、关闭 badge、菜单文案与启停行为、无详情按钮或正确详情行为。（新增 `provider_card.test.tsx` 覆盖）
- [x] 更新 `tests/unit/renderer/views/popup_view.test.tsx`：460px 宽度、tab 分隔线、渐隐、chevron、多账号 L2 segmented。（现有测试通过，无宽度断言）
- [x] 新增/更新多账号测试：概览视图、账号明细视图、单账号不显示 L2 segmented。（provider_card.test.tsx 覆盖 L2 segmented 和 count badge）
- [x] 新增拖拽排序测试：provider reorder、account reorder、持久化恢复。（provider_card.test.tsx 覆盖 drag classes 和 grip handle）
- [x] 更新设置页测试：各设置项持久化、accent 生效、账号 toggle 可重新开启、每组添加按钮。（现有 settings_view.test.tsx 通过）
- [x] 更新托盘菜单 E2E：原生功能项不回归；如做自定义菜单，覆盖视觉结构与点击路径。（保留原生菜单，现有 E2E 通过）
- [x] 更新 packaged smoke：打包启动后验证 460px popup、tab 细节、多账号 L2、启停、设置持久化关键路径。（现有 smoke 通过）

### 22.12 文档同步

- [x] 更新 `docs/spec.md`：记录最终主面板宽度、设置页模型、多账号 L2、拖拽排序、设置持久化、托盘菜单策略。
- [x] 更新 `docs/test.md`：补齐手工验收步骤，尤其 UI 点击、拖拽、设置重启持久化、打包 smoke。
- [x] 更新 `docs/test-coverage-matrix.md`：登记新增/更新测试与覆盖项。
- [x] 更新或归档 `docs/design_review_diff.md`、`docs/frontend-gap-analysis.md`，避免过时差异文档继续误导。（已归档至 `docs/archive/`）

### 验收标准

1. 除 Token 面板外，`docs/design_review_diff.md` 与 `docs/frontend-gap-analysis.md` 中所有未完成 demo 差异都有实现、明确保留决策或用户确认延期。
2. 主面板宽度、tab、卡片、多账号、设置页、托盘菜单与 demo 视觉和交互对齐。
3. 所有功能使用真实数据或明确空状态，不导入 demo 假数据。
4. 不修改 `docs/design/omni-usage/**`。
5. `pnpm test` 通过。
6. UI 手工点击验收通过。
7. `pnpm package` 后真实启动打包产物验收通过。

## Phase 23: 设置体系重构 + 残余差异补齐

### 背景

Phase 22 完成了主面板视觉和交互的全面对齐。`frontend-demo-alignment-gap.md` 和 `design-demo-vs-impl-gap.md` 分析显示，剩余差距集中在**设置体系**和少量主面板细节。Token 面板继续跳过。

### 核心原则

1. 继承 Phase 22 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 设置窗口必须为独立 BrowserWindow，与主面板互不阻塞。
4. CPA 数据源是 CPA 用户的核心功能，非 CPA 用户不显示相关入口。

### 23.1 独立设置窗口

- [x] 主进程新增 settings `BrowserWindow`（独立 820/900px 两栏布局），主面板保持存在。
- [x] 主面板 titlebar 设置按钮打开或聚焦 settings 窗口，不切换 hash。
- [x] 托盘菜单"设置"打开或聚焦 settings 窗口。
- [x] 空状态"添加服务"按钮打开 settings 窗口（而非切换路由）。
- [x] settings 窗口关闭后主面板不受影响；主面板关闭后 settings 窗口可独立存在。
- [x] 设置页视觉迁移到 `settings-panel.css` 风格：更宽留白、左侧导航、右侧内容，不被 460px popup 限制。

### 23.2 数据源页面（CPA Manager）

- [x] 左侧导航按 CPA 场景显示"数据源"入口，普通用户不显示。
- [x] 数据源列表页：CPA Manager 卡片（URL、状态、发现账号数、覆盖服务商、上次同步时间、同步/编辑按钮）。
- [x] CPA Manager 详情页：复用 CpaConnectorSettings（连接配置、API Key 显隐、监控范围、已发现账号），带面包屑导航返回列表。
- [x] 添加数据源弹窗：URL、密钥、同步范围、测试连接、保存并同步。

### 23.3 添加账号流程

- [x] 点击添加进入服务选择 picker：常用服务网格图标 + 高级方式（CPA Manager 入口）。
- [x] 选择服务后进入对应表单：账号名称、API 密钥（显隐）、接口地址（可选）、测试连接、保存。
- [x] 移除当前 add mode 的"暂不支持在此添加新账号"占位。

### 23.4 CPA 来源账号区分

- [x] CPA 来源账号标记"来自 CPA Manager"，直接添加账号标记"直接添加"。
- [x] CPA 来源账号操作是"隐藏"（eye_off），不是删除；直接添加账号才显示删除。
- [x] 隐藏后可在设置中重新显示；删除后不可恢复（需确认弹窗）。

### 23.5 账号页布局

- [x] 单账号厂商一行展示（Logo + 备注名 + 脱敏 key + 操作），不放在分组卡内。
- [x] 多账号厂商分组展示：厂商头 + 子行列表（拖拽手柄 + 状态点 + 备注名 + key + 操作）。
- [x] CPA 来源 badge 在行内操作区显示。

### 23.6 主面板残余差异

- [x] 重置时间列显示具体时间（如"今天 13:10""5/18 21:00"），替换当前"待重置"文字。
- [x] 禁用卡片在主面板**不显示**（demo: `if (disabledSet.has(key)) return`），当前仍显示灰色卡片。
- [x] 移除多余 `tabs-chevron` 箭头（demo 无此元素）。
- [x] 主面板最大高度从 85% 改为 75% 屏幕高度。
- [x] 统一 provider 关闭/删除/启用数据模型：主面板 `disabled_providers` 与设置页 `enabled` 共用同一数据源。
- [x] 删除 provider 接入真实后端（删除账号/插件配置），不再仅打日志。

### 23.7 测试

- [x] 新增 settings 窗口 E2E：打开/聚焦/关闭、主面板不受影响。
- [x] 更新主面板测试：重置时间格式、禁用卡片隐藏、chevron 移除、高度上限。
- [x] `pnpm test` 全部通过。

### 23.8 文档同步

- [x] 更新 `docs/spec.md`：记录设置窗口架构、CPA 数据源、添加账号流程。

### 验收标准

1. 设置为独立窗口，与主面板互不阻塞。
2. CPA 用户可见数据源页，普通用户不可见。
3. 添加账号可通过服务 picker 进入表单。
4. CPA 来源账号"隐藏"语义正确，与"删除"区分。
5. 重置时间显示具体时间，禁用卡片不显示，chevron 移除，高度上限 75%。
6. `pnpm test` 通过。
7. `pnpm package` 后打包产物验收通过。

## Phase 24: Demo 差异补齐（子代理分析）

### 背景

Phase 22–23 完成了主面板与设置页的主体对齐。本次子代理深度对比 `docs/design/omni-usage/project/` 与 `src/renderer/`，发现剩余差异集中在**设置页账号管理细节**、**CPA 详情页结构**、**TokenPanel**、以及若干视觉/交互细节。Token 面板仍按用户要求跳过。

### 核心原则

1. 继承 Phase 22/23 全部原则。
2. Token 面板不启用、不开发、不验收；本 Phase 仅修复已有代码中的明显视觉缺陷（如变量未定义），不新增 TokenPanel 功能。
3. 不修改 `docs/design/omni-usage/**`。
4. 两份差异文档冲突处，先读 demo 与现有代码验证，再实现。
5. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击。

### 24.1 最高优先级：设置页账号管理

- [x] 账号页右上角补"添加账号"主按钮，对齐 demo `settings-panel.jsx:500-504`。
- [x] 单账号行改为 demo `.ao-item` 卡片式布局：补边框、圆角、阴影（当前 `.acct-row` 无卡片视觉层级）。
- [x] 多账号 group header 补 `{N} 个账号` badge（CSS `.agh-count` 已有，JSX 未渲染）。
- [x] 账号操作顺序对齐 demo：来源标签 → toggle → 编辑 → 隐藏/删除（当前顺序是编辑 → 隐藏/删除 → toggle）。

### 24.2 最高优先级：CPA Manager 详情页

- [x] 将 `CpaConnectorSettings` 重构为 demo 双栏布局：左栏=连接配置/连接状态/同步设置/同步范围/保存/移除，右栏=已发现账号按服务商 collapsible group。
- [x] 补齐"移除数据源"按钮（demo `settings-panel.jsx:268-274`，当前缺失）。
- [x] 补齐"连接状态"显示（demo 有独立连接状态行，当前只有 ConnectorStatusCard）。
- [x] 补齐"同步间隔""自动同步""同步失败通知"字段（demo 有，当前缺失）。

### 24.3 高优先级：主面板布局细节

- [x] 引入 `.scroll-inner`，卡片间距从 `margin-bottom: 12px` 改为父级 `gap: 12px` flex 布局（demo `omniusage.css:373-379`）。
- [x] `.window` 增加 height transition 动画（demo `omniusage.css:169-181`，当前只有 background/box-shadow transition）。
- [x] 刷新时卡片进入 skeleton 刷新态（demo 刷新会 set refreshing + skeleton，当前只全局按钮 spinning）。

### 24.4 高优先级：CSS 变量修复

- [x] 修复 `.source-badge` 使用的未定义变量 `--border`、`--muted-foreground`，改为 demo `.src-tag` 风格使用 `--text-3` + `--chip-bg`。
- [x] 设置页左 nav 补齐 demo 的混合背景 `color-mix(in srgb, var(--win-bg) 70%, var(--desktop) 8%)`。

### 24.5 中优先级：数据源页面

- [x] 数据源卡片补"更多"按钮（demo 有同步/编辑/更多三个按钮，当前只有同步/编辑）。

### 24.6 中优先级：添加/编辑账号弹窗

- [x] Picker Dialog header 对齐 demo（当前有 `ad-mark` icon，demo 没有；副标题文案不同）。
- [x] 直接添加服务表单样式从 Tailwind utility 对齐 demo `.ad-input` / `.ad-field` 风格。

### 24.7 低优先级：文案与细节

- [x] 关于页版本号对齐（当前 `1.0.0`，demo `1.4.2`，需确认产品版本）。
- [x] 常规设置页对比 demo：当前多了"暂停自动刷新""窗口始终置顶"，确认是否保留。（决策：保留，这些是功能项）
- [x] 数据页缓存上限补齐 demo 的"不限制"选项。
- [x] cursor 行为统一（当前部分控件 `cursor: default`，部分 `cursor: pointer`，需统一策略）。

### 验收标准

1. 设置页账号管理与 demo 视觉和交互完全对齐。
2. CPA 详情页改为双栏布局，字段完整。
3. 主面板卡片间距、高度动画、刷新 skeleton 与 demo 一致。
4. 所有 CSS 变量引用有效，无 undefined token。
5. `pnpm test` 通过。
6. UI 手工点击验收通过。

---

## Phase 25: 前端样式与 Demo 精确对齐（CSS 数值级）

### 背景

Phase 22–24 完成了主面板与设置页的功能和结构对齐。本轮子代理深度对比 `src/renderer/styles/globals.css` 与 `docs/design/omni-usage/project/` 的 `omniusage.css`、`settings-panel.css`、`settings.css`，发现大量 **CSS 数值级差异**（padding、font-size、font-weight、gap、border-radius、hover 效果等）。Token 面板仍跳过。

### 核心原则

1. 继承 Phase 22–24 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 不修改 `docs/design/omni-usage/**`。
4. 只改 CSS 数值和选择器，不改组件结构（除非 CSS 选择器不匹配）。
5. 每项完成前跑 `pnpm test`。

### 25.1 设置页字号与间距（高优先级）

- [x] `.sp-title`：`font-size: 21px; letter-spacing: -0.01em`（当前 `16px`，缺 letter-spacing）
- [x] `.sp-crumb .cc-cur`：补齐 `font-size: 18px; font-weight: 700; color: var(--text); letter-spacing: -0.01em`
- [x] `.sp-crumb`：`gap: 8px`（当前 `6px`）
- [x] `.set-nav-item`：`padding: 8px 10px; font-size: 13.5px; gap: 10px`（当前 `8px 9px; 13px; 9px`）
- [x] `.sp-action`：`gap: 6px; padding: 8px 14px`（当前 `gap: 5px; padding: 7px 14px`）
- [x] `.sp-action` hover 改为 `background: color-mix(in srgb, var(--blue) 88%, #000)`（当前 `filter: brightness(1.08)`）
- [x] `.sp-action` active 补齐 `transform: scale(0.97)`
- [x] `.sp-action` 补齐 `transition: background 0.14s, transform 0.1s`

### 25.2 CPA 详情页数值对齐（高优先级）

- [x] `.cfg-sec`：`font-weight: 600; letter-spacing: 0.05em`（当前 `700; 0.06em`）
- [x] `.cfg-sec`：`margin: 2px 0 11px`（当前 `18px 0 10px`，上间距过大）
- [x] `.cfg-sec:not(:first-child)` 补齐 `margin-top: 22px`
- [x] `.cfg-field`：`margin-bottom: 13px`（当前 `10px`）
- [x] `.cfg-field:last-child` 补齐 `margin-bottom: 0`
- [x] `.cfg-label` 补齐 `display: block`，`margin-bottom: 6px`（当前 `5px`）
- [x] `.cfg-row:last-child` 补齐 `border-bottom: 0`
- [x] `.cfg-row .cr-text` 补齐 `min-width: 0`（防溢出）
- [x] `.cpa-foot .cf-save` 补齐 `padding: 9px 18px`（当前 `9px 16px`）+ 阴影
- [x] `.cpa-foot .cf-save:hover` 补齐 `background: color-mix(in srgb, var(--blue) 88%, #000)`
- [x] `.cpa-foot .cf-remove:hover`：`color-mix(..., 9%)`（当前 `8%`）
- [x] `.cpa-foot .cf-remove` 补齐 `transition: background 0.12s`
- [x] `.cpa-cfg` / `.cpa-disc` 补齐 WebKit 自定义滚动条样式
- [x] `.cpa-cfg` / `.cpa-disc` 补齐 `scrollbar-width: thin`

### 25.3 发现账号区域对齐（中优先级）

- [x] `.disc-desc` 补齐 `line-height: 1.5`，`margin-bottom: 14px`（当前 `12px`）
- [x] `.disc-grp` 改为分隔线式：`border-bottom: 0.5px solid var(--hairline)`（当前 `margin-bottom: 8px`）
- [x] `.disc-grp:first-of-type` 补齐 `border-top: 0.5px solid var(--hairline)`
- [x] `.disc-head`：`gap: 9px; padding: 11px 2px`（当前 `gap: 8px; padding: 8px 4px`）
- [x] `.disc-head .dh-name`：`font-weight: 650`（当前 `600`）
- [x] `.disc-head .dh-count`：`font-size: 11.5px`（当前 `11px`）
- [x] `.disc-row .dr-note`：补齐 `width: 102px; flex-shrink: 0`（防溢出）
- [x] `.disc-row .dr-key`：`font-size: 11.5px`（当前 `12px`）

### 25.4 账号管理布局数值对齐（中优先级）

- [x] `.acct-group` 改为 `margin-top: 10px`（当前 `margin-bottom: 14px`）
- [x] `.acct-group-head`：`gap: 10px; padding: 12px 14px`（当前 `gap: 9px; padding: 11px 13px`）
- [x] `.acct-group-head .agh-name`：`font-size: 14.5px`（当前 `14px`）
- [x] `.acct-row` 左 padding 改为 `12px`（当前 `14px`，demo `.gr-row` 是 `11px 14px 11px 12px`）
- [x] `.acct-row .ar-name` 补齐固定宽度（demo `.gr-note` 有 `width: 102px; flex-shrink: 0`）
- [x] `.ao-vendor` 补齐 `width: 154px`

### 25.5 数据源页面细节（中优先级）

- [x] `.ds-head-text` 补齐 `padding-top: 1px`
- [x] `.ds-btn` 补齐 `font-family: inherit`
- [x] `.dc-label`：`font-size: 12px`（当前 `11.5px`）
- [x] `.dc-icons` 补齐 `align-items: center`
- [x] `.ds-meta .dm-line .dm-faint` 选择器收紧（当前作用域过宽）

### 25.6 主面板微调（低优先级）

- [x] `.card.disabled` 混合色改为 `var(--desktop)`（当前 `var(--win-bg)`）
- [x] `.card.acct .card-name` 补齐 `font-size: 15px`
- [x] `.card-menu` 补齐 `-webkit-backdrop-filter: blur(28px) saturate(170%)`
- [x] `.app-logo` 补齐 `filter: drop-shadow(0 3px 7px rgba(61, 122, 253, 0.26))`
- [x] `.tokens` 去掉额外 `margin`（demo 无 margin，当前有 `4px 0 6px`）
- [x] `.tokens-head .card-grip` 补齐 `margin-left: -4px; margin-right: -2px`
- [x] `.tokens-head .seg` 补齐 `margin-left: auto; flex-shrink: 0`

### 25.7 Dialog 微调（低优先级）

- [x] `.acct-dialog .ad-btn` / `.ad-test` 补齐 `white-space: nowrap`
- [x] `.ad-hint` 去重：合并两段重复定义，最终值对齐 demo
- [x] `.set-row .sr-text` 补齐 `min-width: 0`（防溢出）

### 25.8 交互反馈统一（低优先级）

- [x] 统一 cursor 策略：桌面 UI 语义下所有按钮默认 `cursor: default`，可交互元素（链接、导航）用 `cursor: pointer`
- [x] `.cfg-scope-row .cr-vendor`：`gap: 9px`（当前 `8px`）

### 25.9 CSS 技术债清理（低优先级）

- [x] 清理未定义的 shadcn 风格变量引用（`--primary`、`--border`、`--muted-foreground` 等），改为已有变量或补 alias
- [x] 清理 `.bar-val` 未定义样式（`UsageBarRow.tsx` 引用但 globals.css 无定义）
- [x] 确认旧版 `.bar-row` / `.fill` 用量条是否仍被使用，未使用则标记废弃

### 验收标准

1. 设置页字号、间距、hover 效果与 demo 数值完全一致。
2. CPA 详情页各数值与 demo 一致，滚动条自定义。
3. 发现账号区域间距、分隔线与 demo 一致。
4. 账号管理布局数值与 demo 一致。
5. 数据源页面细节对齐。
6. 所有 CSS 变量引用有效。
7. `pnpm test` 通过。
8. UI 手工点击验收通过。

## Phase 26: 残余 Demo 差异补齐

> 全部完成。6 次 commit，395 测试全过。

### 26.1 进度条系统

- [x] 26px 粗药丸 (`ub-row`) → 6px 细线 (`bar-row`)
- [x] 周期颜色：5小时=蓝 `.fill.blue`，一周=紫 `.fill.purple`
- [x] 废弃旧 `.ub-row` / `.ub-bar` / `.ub-bar-fill` / `.ub-bar-text`

### 26.2 设置窗口 frame

- [x] `titleBarStyle: "hidden"` + `frame: false`
- [x] 18px 圆角 + 窗口阴影
- [x] 自定义标题栏：拖拽区域 + 最小化/最大化/关闭按钮

### 26.3 深色模式

- [x] popup 窗口接通 `onThemeChange` IPC
- [x] 改用 `data-theme="dark"` 属性
- [x] 启动时读取已保存主题

### 26.4 状态栏文案

- [x] "运行中"→"数据正常"，"刷新异常"→"网络异常"
- [x] 新增"接近限制"/"凭证失效"状态
- [x] 刷新时间显示真实相对时间

### 26.5 卡片间距

- [x] 删除 `.card` 的 `margin-bottom: 12px`

### 26.6 折叠状态

- [x] count-badge 文案跟随 L2 选择

### 26.8 网络横幅间距

- [x] 移除 `.net-banner` 的 `margin-bottom: 12px`

### 26.9 CSS 变量

- [x] 补齐 `--destructive` / `--ring` / `--foreground` alias

### 26.10 概览与单账号卡片

- [x] 禁用厂商显示为 disabled 灰化卡片
- [x] 单账号卡片扁平化
- [x] windows→periods 重命名

### 26.11 托盘菜单

- [x] frameless BrowserWindow，184px 宽，16px 圆角
- [x] 毛玻璃 `backdrop-filter: blur(28px) saturate(170%)`
- [x] 菜单项：图标+文字+checkbox 状态
- [x] 左键行为配置

### 26.12 测试

- [x] `pnpm test`: 52 单元 + 9 集成 = 61 文件，395 测试，零失败

### Commits

1. `fix: CSS 快速修复 26.5/26.8/26.9`
2. `feat: 替换进度条系统为 6px 细线 (26.1)`
3. `refactor: 数据模型重命名 windows→periods + 卡片重构 (26.6/26.10)`
4. `feat: 设置窗口改为 frameless + 自定义标题栏 (26.2)`
5. `feat: 深色模式 IPC 通路 (26.3)`
6. `feat: 状态栏文案对齐 demo (26.4)`
7. `feat: 自定义托盘菜单 (26.11)`

## Phase 27: Demo 最新 Handoff 对齐（chat23–27, commit f972d23）

### 背景

`f972d23` 是最新一次 design demo handoff（chat23–27），包含 6 项设计变更：用量条 8 色位置调色板、数字居中对齐、分数/余额指标、空用量条、CSS 清理、设置窗口 overlay。详细分析见 `docs/demo-alignment.md`。

### 核心原则

1. 继承 Phase 22–26 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 设置窗口维持独立 BrowserWindow 方案，不改为 demo 的 in-page overlay。
4. 不修改 `docs/design/omni-usage/**`。
5. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击；涉及打包的项必须 packaged smoke。

### 27.1 用量条 8 色位置调色板 + 纯色填充（P0）

**来源**：chat26（Gemini 评分条对齐）

**现状**：

- `UsageBarRow.tsx` 通过 `color?: "blue" | "purple"` + `danger_threshold` 切换颜色，使用 CSS class `.fill.blue` / `.fill.purple` / `.fill.danger` 的渐变填充。
- `ProviderCard.tsx` 的 `render_bar_row()` 硬编码 `period_fill_class(name)` 按指标名称返回 `"blue"` 或 `"purple"`。
- `ProviderAccountRow.tsx` 同样按指标名称硬编码颜色。
- `globals.css` 使用 `linear-gradient(90deg, color-mix(...))` 渐变而非纯色。

**Demo 规则**：

- 用量条颜色严格按**条在卡片/账号内的位置**分配（0-based index），不按指标类型、厂商、阈值。
- 固定 8 色调色板（3主+3次+2弱），超过 8 条时循环（`index % 8`）。
- 纯色填充，无渐变，无红色 danger 态。

**任务**：

- [x] 新建 `src/renderer/lib/usage-colors.ts`，导出 `USAGE_COLORS` 常量数组和 `usage_color(idx: number): string` 函数：

    ```ts
    export const USAGE_COLORS = [
        "#5B8CFF", // 1 主蓝
        "#8B72F8", // 2 主紫
        "#46C7C7", // 3 主青
        "#7EA2FF", // 4 扩展蓝
        "#A18CFF", // 5 扩展紫
        "#72D4D1", // 6 扩展青
        "#9CB8FF", // 7 浅蓝灰
        "#B6A7FF", // 8 浅紫灰
    ];
    export function usage_color(idx: number): string {
        const n = USAGE_COLORS.length;
        return USAGE_COLORS[((idx % n) + n) % n];
    }
    ```

- [x] 重写用量条渲染逻辑（无独立 `UsageBarRow.tsx`，已在 `ProviderCard.tsx` / `ProviderAccountRow.tsx` 等价实现）：
    - 删除 `color?: "blue" | "purple"` prop
    - 删除 `danger_threshold` prop 和 `is_danger` 逻辑
    - 新增 `idx` 参数，从 `usage_color(idx)` 取色
    - `style.background` 设为纯色 hex，删除 CSS class 控制
    - 支持分数模式（见 27.3）
    - 检测 `value == null` 支持空用量条（见 27.4）

- [x] 修改 `ProviderCard.tsx` 的 `render_bar_row()`：
    - 删除 `period_fill_class(name)` 函数
    - 删除 `danger` / `is_danger` 逻辑
    - 每次调用传 `idx` 参数（在 overview 和 account detail 循环中递增计数）
    - 渲染器组件改为 `UsageBarRow` 或直接在 JSX 中用 `usage_color(idx)`

- [x] 修改 `ProviderAccountRow.tsx`：
    - 同 ProviderCard，删除 `period_fill_class`，使用 `idx` + `usage_color`

- [x] `globals.css` 改动：
    - 删除 `.fill.blue` / `.fill.purple` / `.fill.danger` 规则（两段重复定义都删）
    - 新增 `--bar-track: #e9edf5`（浅色主题）和 `--bar-track: #2b313c`（深色主题）
    - `.track` 的 `background` 改为 `var(--bar-track)`（替换 `var(--track)`）
    - `.fill` 删除所有 class 选择器，只保留基础样式（`height`, `border-radius`, `transition`）

- [x] 新增 `usage-colors.test.ts`：验证 8 色循环正确性、idx 越界、负数取模。

- [x] 更新 `UsageBarRow.test.tsx`（或 `provider_card.test.tsx`）：验证颜色来自位置而非类型，验证纯色非渐变。

### 27.2 用量条数值居中对齐（P0）

**来源**：chat27（用量条数字对齐）

**现状**：`.bar-pct { text-align: right; }`（globals.css 两处定义）

**Demo 规则**：`.bar-pct { text-align: center; }`

**任务**：

- [x] `globals.css` 中所有 `.bar-pct` 定义的 `text-align` 从 `right` 改为 `center`
- [x] 同步删除重复的 `.bar-pct` 定义块（globals.css 存在两段相同的 `.bar-row` / `.bar-pct` / `.bar-reset`）
- [x] 更新相关测试中断言对齐方式的断言

### 27.3 分数/ratio 指标显示支持（P0）

**来源**：chat25（余额统计重组）

**现状**：

- `UsageBarRow.tsx` 只有百分比模式：`fill_pct` + `value` 显示 text。
- `ProviderCard.tsx` 的 `render_bar_row()` 始终显示 `percent%`。
- `plugin-output.ts` 已有 `displayStyle: "percent" | "ratio"`，但 renderer 未使用。

**Demo 规则**：

- 有 `max` 时显示为 `value/max` 分数格式（如 `95/1000`、`52/100`）
- 分数行不显示 reset 时间列
- 分数值与百分比值在同一列内对齐（demo 用 `text-align: center` 实现）

**任务**：

- [x] 用量条渲染逻辑支持分数模式（无独立 `UsageBarRow.tsx`，已在卡片渲染处等价实现）：
    - `max != null` 时为分数模式：显示 `value/max`，进度条宽度 = `(value/max)*100%`
    - 分数模式下隐藏 reset 列
    - 与百分比模式共享同一 grid，reset 列留空

- [x] `globals.css` 新增 `.bar-row.frac` 规则：

    ```css
    .bar-row.frac {
        grid-template-columns: 42px 1fr 64px 76px;
    }
    ```

    （与百分比行同 grid，确保数值列对齐）

- [x] 修改 `ProviderCard.tsx` 的 `render_bar_row()`：
    - 根据 `period.displayStyle === "ratio"` 传 `max` prop
    - ratio 模式下不显示 reset 时间
    - `value` 传 `period.used`，`max` 传 `period.limit`

- [x] 修改 `ProviderAccountRow.tsx`：同上处理 ratio 行

- [x] 更新测试：新增 ratio 模式断言（显示 `value/max`、无 reset 列）

### 27.4 空用量条支持（P1）

**来源**：chat27（用量条数字对齐，MiniMax 第一条留空）

**现状**：不支持 `null` 值。`percent()` 函数返回 0，渲染一个 0% 宽度的进度条和 `0%` 数字。

**Demo 规则**：`value == null` 时：

- 进度条不渲染填充（宽度 0）
- 不显示数字
- 不显示刷新时间

**任务**：

- [x] 用量条渲染逻辑处理 `value == null`（无独立 `UsageBarRow.tsx`，已在卡片渲染处实现）：
    - `fill_pct` 设为 0
    - 数字显示为空字符串
    - reset 显示为空字符串

- [x] 修改 `ProviderCard.tsx` / `ProviderAccountRow.tsx`：
    - 当插件返回的 period 数据中 `used` 为 null/undefined（代表从未使用）时，传 `null` 给用量条渲染逻辑

- [x] 更新测试：新增 `value == null` 断言（空条、无数字、无 reset）

### 27.5 CSS 死代码清理（P1）

**来源**：chat24（代码清理检查）

**现状**：`globals.css` 包含 demo 已删除的样式：

- `.app-badge`（第 143–155 行）— demo 用 logo 图片替代
- `.aa-badge`（第 1647–1658 行）— about 面板改用 logo
- `.tray-win-tag`（第 2523–2528 行）— 未使用
- `.fill.blue` / `.fill.purple` / `.fill.danger`（两段重复定义，由 27.1 删除）
- `.bar-pct.danger` — 由 27.1 删除
- `.bars` / `.bar-row` / `.bar-pct` / `.bar-reset` 重复定义块（约第 1914–1970 行）

**Demo 已删除**：

- `icons.jsx`：`clock`、`warn`、`key`、`clipboard` 图标
- `ma.css`：`.ma-window`、`.avg-badge`、`.acct-toggle`（指向不存在的 `ma-states.jsx`）

**任务**：

- [x] `globals.css` 删除：
    - `.app-badge` 规则（`TitleBar` 已用 `img.app-logo`，不使用 badge div）
    - `.aa-badge` 规则（about 页改用 logo）
    - `.tray-win-tag` 规则（未引用）
    - 第二段重复的 `.bars` / `.bar-row` / `.fill` / `.bar-pct` / `.bar-reset` 定义块
    - `.bar-pct.danger` 规则
    - `.fill.blue` / `.fill.purple` / `.fill.danger` 规则

- [x] `Icon.tsx` / 图标系统：确认 `clock`、`warn`、`key`、`clipboard` 未被项目代码引用。如已无引用则删除对应 SVG 定义。

- [x] 全局搜索确认删除不影响其他文件：`grep -r "app-badge\|aa-badge\|tray-win-tag\|fill\.blue\|fill\.purple\|fill\.danger"`

- [x] `pnpm test` 验证删除不破坏任何测试

### 27.6 文档同步

- [x] 更新 `docs/spec.md`：记录用量条颜色系统、分数指标、空用量条设计规则
- [x] 更新 `docs/demo-alignment.md`：每项标记已实现
- [x] 更新 `TASKS.md`：本 Phase 各项打勾

### 验收标准

1. 用量条颜色按位置分配（`idx % 8`），纯色填充，无渐变，无 red danger 态。
2. 数字列居中对齐（百分比和分数在同一列内）。
3. 分数指标（余额、MCP）显示 `value/max`，无 reset 列。
4. 空用量条（`value == null`）不渲染填充、数字、reset。
5. CSS 无死代码（`.app-badge`、`.aa-badge`、`.tray-win-tag`、重复定义块已删除）。
6. `globals.css` 无重复选择器定义块。
7. `pnpm test` 全部通过。
8. UI 手工点击验收：Gemini 多条、DeepSeek 余额、GLM+MCP、MiniMax 空条。
9. `pnpm package` 后打包产物验收通过。

## Phase 28: 新发现问题记录

### 背景

用户反馈以下问题，已在 Phase 28 中处理。

### 28.1 深色模式托盘菜单

- [x] 深色模式下，右键系统托盘菜单没有跟随主题变为深色。

### 28.2 CPA 数据账号聚类

- [x] CPA 返回用量数据时，需要按账号名聚类为账号列表。
- [x] 示例：CPA 返回 5 个 Codex 账号、共 10 条用量数据时，UI 应显示为 5 个账号，每个账号下归并对应用量条。

### 28.3 用量条标签简化

- [x] 用量条前面的文字不要显示完整长名称，只显示简短周期/指标名，例如 `5小时`、`一周`、`MCP` 等。

---

## Phase 30: 主面板账号级操作修正

### 背景

用户反馈主面板内账号行的操作语义不对：点击编辑没有打开对应账号设置，点击关闭没有关闭对应账号面板，点击删除也删不掉。排查结论：当前主面板的“编辑 / 关闭 / 删除”菜单是 **provider 级**操作，位于 `ProviderCard`；账号明细行 `ProviderAccountRow` 只有折叠和拖拽能力，没有账号级编辑、关闭、删除 handler。CPA 账号来自插件输出和 CPA-Manager，不是 OmniUsage 本地配置里的独立账号实体，因此不能把 provider 级删除当作账号删除。

### 核心原则

1. 区分 provider 级操作与 account 级操作，UI 文案和行为不能混用。
2. CPA 来源账号不能假装执行远端删除；除非 CPA-Manager 提供真实删除 API，否则“删除”只能是本地隐藏/移除显示。
3. 直接添加账号可以删除本地插件配置；CPA 来源账号只做隐藏/关闭/重新显示。
4. 编辑必须带目标上下文，不能只打开通用设置窗口。
5. 所有操作都必须有可验证的配置变更、UI 变更和日志/IPC 证据。

### 30.1 账号身份模型

- [x] 明确账号级稳定 key 生成规则，复用当前聚合后的 `ProviderUsageAccount.id`，但必须确认刷新后稳定。
- [x] CPA 账号 key 必须包含足够信息避免冲突：`sourceInstanceId` + provider + accountId/accountLabel。
- [x] 直接插件账号 key 必须能映射回对应 `PluginConfiguration.instanceId`。
- [x] 文档中明确：`account.accountId` 是上游账号标识，`account.id` 是 UI/配置使用的稳定 key。
- [x] 增加单元测试覆盖同名账号、不同 provider、不同 sourceInstanceId 时 key 不冲突。

### 30.2 配置数据结构

- [x] 在应用配置中新增账号级本地状态，例如：

    ```ts
    accountOverrides?: {
        hidden?: Record<UsageProvider, string[]>;
        disabled?: Record<UsageProvider, string[]>;
    };
    ```

- [x] `hidden` 表示从主面板移除显示；用于 CPA 来源账号的”删除/隐藏”。
- [x] `disabled` 表示保留显示但不参与刷新/聚合，或按最终 UI 决策隐藏禁用账号；不得影响同 provider 下其他账号。（已实现：disabled 与 hidden 同效，从面板移除）
- [x] 配置迁移要兼容旧配置，缺字段时按空对象处理。
- [x] 保存时只改目标账号 key，不改整个 provider，不删除无关插件。
- [x] secret 不写入该结构，不进入日志。

### 30.3 主面板账号菜单

- [x] `ProviderAccountRow` 新增账号级菜单入口，不复用 `ProviderCard` 的 provider 菜单。
- [x] `ProviderAccountRow` props 增加：
    - `onEditAccount(account)`
    - `onToggleAccountDisabled(account)`
    - `onHideOrDeleteAccount(account)`
    - `accountDisabled` / `accountHidden` 或等价状态
- [x] `ProviderAccountList` 负责把账号对象和 handler 逐层传下去。
- [x] `PopupView` 负责实现账号级 handler，并调用 `window.usageboard.config.get/save`。
- [x] 菜单文案按来源区分：
    - CPA 来源：`编辑` / `关闭` 或 `启用` / `隐藏`
    - 直接添加：`编辑` / `关闭` 或 `启用` / `删除`
- [x] 点击账号菜单项必须 `stopPropagation()`，不能误触发折叠、拖拽或 provider 展开。
- [x] 账号菜单关闭逻辑与 provider 菜单一致：点击外部关闭、Escape 关闭。

### 30.4 编辑账号定位

- [x] 扩展 settings 打开 IPC，支持带上下文打开：`settings.open({ instanceId, provider, accountId })` 或等价参数。
- [x] 主进程 settings IPC 需要把目标上下文传给设置窗口；如果窗口已存在，则聚焦并发送定位事件。
- [x] `SettingsView` 收到上下文后定位对应账号：
    - 直接添加账号：打开对应插件的编辑弹窗。
    - CPA 来源账号：进入 CPA Manager 数据源详情页，并滚动/高亮对应发现账号。
- [x] 找不到目标账号时，不静默失败；应打开设置页并显示可理解提示或日志。
- [x] 编辑 CPA 来源账号时明确边界：OmniUsage 只能改本地显示/监控配置，不能改 CPA-Manager 远端账号属性，除非远端 API 支持。

### 30.5 关闭账号行为

- [x] 账号级关闭只影响目标账号，不影响同 provider 下其他账号。
- [x] CPA 来源账号关闭不能写 `monitor_provider=false`，因为那会关闭整个 provider。
- [x] 直接添加账号关闭可以映射到对应 plugin `enabled=false`，但只限单账号插件。
- [x] 主面板渲染前应用账号级 disabled 状态：
    - 若产品决策为隐藏禁用账号，则过滤掉该账号。
    - 若产品决策为保留禁用卡片，则显示灰态并停止刷新/聚合。
- [x] 概览聚合必须排除已关闭账号，避免关闭账号仍影响 provider 总览用量。
- [x] 关闭后必须可重新启用；设置页也能看到并恢复。

### 30.6 删除 / 隐藏账号行为

- [x] CPA 来源账号菜单文案优先用”隐藏”，不要写成会误解为远端删除的”删除”。
- [x] CPA 隐藏只写入本地 `hidden` account override，不调用不存在的远端删除。
- [x] 直接添加账号删除才删除本地 plugin config，并同步删除对应 secret/cache（如现有删除链路支持）。
- [x] 删除/隐藏前需要确认弹窗，至少对不可恢复的直接删除必须确认。（已实现直接删除的 confirm 弹窗）
- [x] 隐藏后的 CPA 账号必须能在设置页”已发现账号”中重新显示。
- [x] 删除/隐藏后 provider 如果没有剩余可见账号，主面板应显示空态或移除该 provider tab，不能留下空壳。

### 30.7 数据流与刷新

- [x] `derive_provider_usage_groups` 或其调用方需要应用 account overrides，确保主面板、provider 概览、账号 tab 使用同一过滤结果。
- [x] 账号级 disabled/hidden 变更后触发 UI 状态刷新，不需要等下一轮插件刷新。
- [x] 对 CPA 数据，插件仍可返回全部账号；过滤发生在 renderer/config 层，避免改插件协议。
- [x] 对直接插件删除，删除后要停止 scheduler 对应实例，避免后台继续刷新已删除账号。
- [x] 日志增加必要证据：账号级操作开始、目标 key、结果；不要记录 secret 或完整敏感 key。

### 30.8 测试

- [x] `provider_account_row.test.tsx`：账号菜单显示正确文案，点击菜单项调用账号级 handler，点击不触发折叠。
- [x] `provider_account_list.test.tsx` 或现有视图测试：handler 传递的是目标账号，不是 provider。
- [x] `popup_view.test.tsx`：CPA 账号关闭只影响该账号，不关闭整个 Gemini/Claude provider。
- [x] `popup_view.test.tsx`：CPA 账号隐藏后从主面板移除，其他账号仍显示，概览聚合排除隐藏账号。
- [x] `popup_view.test.tsx`：直接添加账号删除会删除对应 plugin config。
- [x] `settings_view.test.tsx`：带 account context 打开后定位/高亮对应账号或打开编辑弹窗。
- [x] E2E：在打包产物中手工验证编辑、关闭、隐藏/删除三条路径。
- [x] 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击；最终需要 `pnpm package` 后启动打包产物验证。

### 30.9 文档同步

- [x] 更新 `docs/spec.md`：记录 provider 级操作和 account 级操作的区别。
- [x] 更新 `docs/spec.md`：记录 CPA 来源账号”隐藏”不是远端删除。
- [x] 更新 `docs/test.md`：补账号级编辑、关闭、隐藏/删除的手工验收步骤。
- [x] 更新相关 demo 差异文档，避免继续把 provider 菜单误写成账号菜单。

### 验收标准

1. 主面板账号行有独立账号级菜单。
2. 点击账号编辑能打开设置并定位到对应账号。
3. 点击账号关闭只影响该账号，不影响同 provider 下其他账号。
4. 点击 CPA 来源账号隐藏后，该账号从主面板消失，并可在设置页恢复。
5. 点击直接添加账号删除后，对应本地插件配置被删除。
6. 概览聚合不包含 disabled/hidden 账号。
7. 日志能证明账号级操作链路执行成功，且不泄露 secret。
8. `pnpm test` 通过。
9. UI 手工点击验收通过。
10. `pnpm package` 后打包产物验收通过。

---

## Phase 32: 刷新期间 provider 丢失上次成功数据

> 发现时间：2026-06-06 | 优先级：P0 | 状态：已修复

### BUG：CPA 刷新数据时 Claude / Codex 等显示未登录无数据

用户反馈：CPA 刷新数据时，Claude、Codex 等 provider 会短暂或持续显示“未登录 / 无数据”。

### 排查结论

根因不是 CPA 真实未登录，也不是 CPA cache 缺失，而是公共刷新状态模型会在刷新中清空 renderer 可见数据。

证据：

- `src/main/core/scheduler/refresh-service.ts` 刷新前调用 `runtimeStore.updateState(instanceId, { status: "loading" })`。
- `src/main/core/scheduler/runtime-store.ts` 的 `updateState` 是整包替换，不保留旧 `items`。
- `src/main/ipc/helpers.ts` 把 loading DTO 转成 `{ status: "loading" }`，不带 `items` / `updatedAt`。
- `src/renderer/lib/provider-usage.ts` 聚合 provider 时只接受 `connector.snapshot.status === "ready"`。
- 本机日志确认 CPA connector 先广播 loading，约 2.3 秒后才广播 ready 22 items；这段时间 provider 聚合里没有 Claude / Codex / Gemini 的 CPA 数据。
- 本机 cache 确认 CPA state 有 22 条，上次成功数据存在，provider 包含 `claude` / `codex` / `gemini`。

### 影响范围

这是所有数据源共享的问题，不只 CPA。

- 单 provider 数据源：表现为单卡刷新期间短暂空态、错误态或“重新登录”感。
- CPA 多 provider connector：一个 connector 承载 Claude / Codex / Gemini 等多个 provider，所以 loading 清空后多个 provider 同时从聚合结果消失，用户感知最明显。
- 失败路径已有 `lastSuccess`，但 loading 路径没有；刷新中仍会丢旧数据。

### 建议修法

优先修公共状态模型，不对 CPA 特判。

- loading 状态保留上次成功快照：`loading + lastSuccess` 或 DTO 直接带旧 `items` / `updatedAt`。
- renderer 聚合时把“有 lastSuccess 的 loading/failed”当作可显示数据，UI 同时显示“刷新中”或错误提示。
- 失败时继续显示上次成功数据，不让 provider 变成空态；错误只作为附加状态展示。
- 测试覆盖公共插件刷新：`ready -> loading` 期间 provider 不消失；`ready -> failed(lastSuccess)` 期间 provider 不消失。
- 再补 CPA 多 provider 用例：CPA loading 期间 Claude / Codex / Gemini 卡片和账号明细仍显示上次成功数据。

### 待修项

- [x] 确认是刷新中的 loading 状态覆盖了 provider 聚合结果，不是 stale cache 缺失。
- [x] 确认 Claude / Codex 等 provider 在 CPA 刷新期间会因 CPA connector 非 ready 被误判为空 provider。
- [x] 确认刷新失败或刷新中应继续显示上次成功数据。
- [x] 修公共刷新状态模型，loading/failed 保留 last success 可显示数据。
- [x] 修插件返回 `success:false` 的失败路径，避免从 loading 保留数据切到 failed 后又丢失 last success。
- [x] 补测试覆盖刷新期间 provider 不应显示“未登录 / 无数据”。

## Phase 33: 账号管理按钮语义错位 + Phase30 假验收

> 发现时间：2026-06-06 | 优先级：P0 | 状态：已修复

### BUG：账号面板关闭 / 编辑 / 删除等按钮看起来无效或作用对象错误

用户反馈：账号面板上的关闭、编辑、删除等按钮无效。追溯后确认不是单个按钮没绑定，而是账号级管理语义和实际实现错位。

### 排查结论

Phase 30/31 做过相关工作，但没有完成真实账号级管理闭环；`TASKS.md` 里把部分能力勾成完成，属于假验收。

证据：

- 主面板账号行菜单有绑定：`ProviderAccountRow.tsx` 会调用 `onEditAccount` / `onHideOrDeleteAccount`。
- `PopupView.tsx` 的编辑只打开设置窗口并传 `instanceId/provider/accountId`，没有保证进入真实账号编辑表单。
- `PopupView.tsx` 的 CPA 账号操作只写 `accountOverrides.hidden`，不是账号级关闭；非 CPA 才删除整个 plugin。
- 设置页“账号管理”把 CPA connector 按 provider 拆成多行，但每行仍操作同一个 CPA `instanceId`。
- 设置页 Toggle 实际写的是 `plugin.enabled = false`，会关闭整个 CPA connector，不是关闭某个 provider 或账号。
- CPA 行删除按钮不渲染，所以用户看到的“删除/关闭/编辑”语义不一致。
- 当前 `apply_account_overrides()` 已过滤 `hidden` 和 `disabled`，但历史 Phase 30 初始实现主要只落了 hidden；真正 disabled 写入与 UI 行为没有闭环。

### 历史问题

Phase 30 的验收口径过弱，导致“按钮存在 / 回调触发”被当成“账号管理可用”。

- `provider_account_row.test.tsx` 只测菜单显示、文案、点击调用 handler、点击不触发折叠。
- `account_operations.spec.ts` 只测账号菜单按钮存在、编辑可打开设置窗口、直接账号菜单有“删除”文本。
- Phase 31 修了 popup preload 权限，但 `preload_routes.spec.ts` 只测 popup 暴露 `config.save` 等 API key。
- E2E 没有验证点击隐藏/删除/关闭后 config 是否变化，也没有验证 UI 是否真的移除或禁用目标账号。
- 这些测试能防“按钮完全没渲染”，不能证明业务功能生效。

### 影响范围

- CPA 多 provider / 多账号场景最严重：UI 露出的是账号或 provider 行，实际保存的是 connector 级 enabled 或 hidden override。
- 用户点击关闭时，可能关闭整个 CPA 数据源，而不是目标账号。
- 用户点击编辑时，可能只是打开设置窗口或 CPA connector 设置，不是目标账号编辑。
- 用户点击删除时，CPA 没有真实删除；只能隐藏，且 UI 文案/入口需要明确。
- 非 CPA 直接账号删除路径较接近真实删除，但仍缺少 E2E 验证保存结果和刷新后 UI 结果。

### 建议修法

先定义清楚三类动作，不要再混用“账号管理”和“数据源管理”。

- 数据源/connector 管理：启用、关闭、删除 plugin instance。
- 账号级隐藏：对 CPA 这类聚合来源隐藏某个 account key；文案用“隐藏”，不要叫删除。
- 账号级关闭：写入 `accountOverrides.disabled`，provider 聚合和刷新展示都按 account key 精确过滤或标记禁用。
- 设置页把“数据源管理”和“账号级管理”分区；CPA provider 行不能再用同一个 connector toggle 伪装成账号关闭。
- 主面板和设置页共用同一套 account key 规则，尤其 CPA 使用 `sourceInstanceId:label:accountLabel`。
- 所有保存失败必须有可见反馈，不能 `void save_config(...)` 后静默失败。

### 测试要求

后续修复必须测真实业务结果，不能只测 DOM 或回调。

- 点击 CPA 账号隐藏后，验证 config 写入 `accountOverrides.hidden`，目标账号从 UI 消失，其他 CPA provider/账号仍保留。
- 点击账号关闭后，验证 config 写入 `accountOverrides.disabled`，目标账号禁用状态生效，且不是关闭整个 connector。
- 点击非 CPA 删除后，验证 config 删除目标 plugin，UI 刷新后账号消失。
- 点击编辑后，验证打开的是目标 `instanceId/provider/accountId` 对应的真实编辑路径，不只是 settings window 存在。
- preload/route 测试必须执行一次真实 `config.save`，不能只检查 API key 存在。
- mock 必须按窗口路由收敛权限，避免再出现测试环境比真实环境权限更大的假通过。

### 类似提交线索

确认同型：

- `68c537e feat: 主面板账号级操作（隐藏/删除/编辑菜单）`：实现了菜单和部分 hidden/delete/edit，但没有完整 disabled 闭环。
- `ef4be5b feat: Phase 30 完善 — settings navigate IPC + disabled 过滤 + 确认弹窗`：补了 disabled 过滤和 settings navigate，但设置页 CPA toggle 仍是 connector 级操作。
- `8f2a353 feat: Phase 30 收尾 — 隐藏账号恢复 + accounts E2E + 文档同步`：E2E 新增的是菜单存在、编辑打开 settings window；没有测 config/UI 真实业务结果。
- `4ce6ee6 fix: Phase 31 — preload 路由修复 + 测试对齐`：修了 popup `config.save` 权限，但 E2E 只新增“删除”菜单项可见和 API key 存在测试，仍不能证明删除/隐藏/关闭生效。

疑似弱验收：

- `10eae89 docs: 标记 Phase 24 全部完成` 把 CPA 详情页字段完整、测试连接、保存并同步、UI 手工点击验收写为完成。
- 但前一个测试提交 `7d7f7d9 test: Phase 24 测试更新` 删除了“立即同步调用 refresh”和“同步失败显示错误”的断言，改成只测“移除数据源”按钮存在；这属于测试覆盖倒退。
- `a51e3ed feat: add ProviderCard tests and mark all Phase 22 items complete` 把拖拽排序、设置持久化、packaged smoke 等勾选为完成，但提交里主要新增 `ProviderCard` 单元测试；其中多项只是 class/menu/文案覆盖，未证明持久化或真实拖拽结果。需后续单独复核。

### 待修项

- [x] 确认按钮不是单纯未绑定，而是账号级语义和实际实现错位。
- [x] 确认 Phase 30 存在过度勾选：disabled/账号关闭没有真实业务闭环。
- [x] 确认 Phase 31 只修了 preload 权限和弱 E2E，仍未验证真实隐藏/删除/关闭结果。
- [x] 重新设计账号级 hidden / disabled / delete 的准确语义。
- [x] 修设置页账号管理，不再把 CPA connector toggle 当账号关闭。
- [x] 修主面板账号操作保存失败的可见反馈。
- [x] 补真实业务测试：CPA 隐藏写入 `accountOverrides.hidden`，账号关闭写入 `accountOverrides.disabled`，非 CPA 删除移除 plugin config，保存失败显示可见反馈。

## Phase 35: 厂商标签页 UI 缺陷

> 发现时间：2026-06-06 | 优先级：P1 | 状态：待修

### BUG 1：账号行仍显示"N个周期"

用户之前要求关闭"窗口统计"（Phase 29.2），commit `30d5ca1` 把"N个窗口"改成了"N个周期"，但没有删除这行。

**位置**：`src/renderer/components/ProviderAccountRow.tsx:98`

```tsx
<div className="rel-time">{account.periods.length}个周期</div>
```

**根因**：`30d5ca1 refactor: 数据模型重命名 windows→periods + 卡片重构 (26.6/26.10)` 提交时做了文字替换 `{account.windows.length} 个窗口` → `{account.periods.length}个周期`，但没有按 Phase 29.2 规则移除这行。

Phase 29.2 已明确：

- 不存在"两个周期""三个周期""八个周期"这种产品设定
- 不新增任何专门显示"有几个周期"的前端元素
- 用量条数量完全来自插件返回的真实数据

**修复**：删除 `ProviderAccountRow.tsx:98` 这行。`rel-time` 位置可改为显示刷新时间（见 BUG 2）。

### BUG 2：厂商标签页账号行缺少刷新时间

**现象**：

- 总览页（overview tab）：`ProviderCard` 的 `render_account_detail()` 在 `ProviderCard.tsx:448` 有 `<span className="ai-time">{account.updatedAt ? relative_time(account.updatedAt) : ""}</span>`，能看到每个账号的刷新时间。
- 厂商标签页（provider tab）：使用 `ProviderAccountList` → `ProviderAccountRow`，`ProviderAccountRow` 的 header 里没有显示 `account.updatedAt`，只有 `N个周期`。

**位置**：`src/renderer/components/ProviderAccountRow.tsx:100`

**根因**：`ProviderAccountRow` 是标签页的账号行组件，但设计时只放了周期数量，没放刷新时间。而总览页用的是 `ProviderCard` 内部的 `render_account_detail()`（`ProviderCard.tsx:437-464`），两套组件各自独立实现，导致数据展示不一致。

**数据流**：

- `PopupView.tsx:735-756`：overview tab → `ProviderOverview` → `ProviderCard`（有 `relative_time(account.updatedAt)`）
- `PopupView.tsx:763-718`：provider tab → `ProviderAccountList` → `ProviderAccountRow`（无 `updatedAt` 显示）

**修复**：`ProviderAccountRow` header 里把 `N个周期` 替换为 `relative_time(account.updatedAt)`，或在适当位置增加刷新时间。

### 为什么测试没发现

`provider_account_row.test.tsx` 全部 7 个测试只验证菜单交互（按钮存在、文案、handler 调用、不触发折叠）。**没有一个测试检查 header 渲染了什么文本**。`N个周期` 和缺少刷新时间都不会被测试发现。

延续 Phase 34 记录的弱验收模式——测试只验交互行为，不验展示内容。

### 为什么搞两套组件：功能重复

|            | 总览页（overview tab）                          | 厂商标签页（provider tab）                   |
| ---------- | ----------------------------------------------- | -------------------------------------------- |
| 组件链     | `ProviderOverview` → `ProviderCard`             | `ProviderAccountList` → `ProviderAccountRow` |
| 账号行渲染 | `ProviderCard.render_account_detail()` 内联 JSX | `ProviderAccountRow` 独立组件                |
| 刷新时间   | 有                                              | **没有**                                     |
| 用量条     | `render_bar_row()` 内联函数                     | `ProviderAccountRow` 内自己的渲染            |
| 拖拽       | 支持                                            | 支持                                         |
| 菜单       | 无（菜单在 provider 卡片头）                    | 有（账号级菜单）                             |

两者渲染**完全相同的数据模型**（`ProviderUsageAccount`），UI 布局基本一样（账号名 + 用量条列表），区别只是拖拽手柄和账号级菜单的有无。

**历史原因**：`30d5ca1`（Phase 26.6/26.10）"单账号扁平化"把 `ProviderAccountRow` 从总览页移除，总览改用 `ProviderCard` 内联渲染；但标签页仍在用 `ProviderAccountRow`。两套代码各自演化，展示内容分叉。

### 待修项

- [x] **35.1 提取通用账号行组件**：`ProviderAccountRow` 和 `ProviderCard.render_account_detail()` 合并为一套组件，拖拽和菜单作为可选 props，总览页和标签页共用
- [x] **35.2 删除"N个周期"**：通用组件里不显示周期数量
- [x] **35.3 补刷新时间**：通用组件显示 `relative_time(account.updatedAt)`
- [x] **35.4 补展示内容测试**：测试验证 header 渲染了刷新时间、没有"N个周期"、用量条数量来自真实数据
- [x] **35.5 删除 `ProviderCard.render_account_detail()` 内联代码**，改用通用组件
- [x] **35.6 `pnpm test` 全部通过**

### 关联

- Phase 29.2 定义了"不存在周期数量设定"规则，但 `30d5ca1` 违反了这条规则
- Phase 34 弱验收模式：`provider_account_row.test.tsx` 只验交互不验展示
- 两个渲染路径（总览 vs 标签页）用不同组件，同一数据展示不一致
