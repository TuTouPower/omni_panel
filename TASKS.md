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

- [ ] **TypeScript 超严格 tsconfig.json**
    - `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
    - `noImplicitReturns` + `noFallthroughCasesInSwitch` + `noImplicitOverride`
    - `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax`
    - `isolatedModules` + `forceConsistentCasingInFileNames`
- [ ] **ESLint type-aware 规则**
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
- [ ] **格式化检查**：Prettier / Biome，CI 中 `format:check` 必过
- [ ] **死代码 / 依赖架构检查**
    - `Knip`：未使用文件、导出、依赖检测
    - `dependency-cruiser`：循环依赖禁止、层级约束（renderer 禁止 import Node API）
- [ ] **Electron 专项安全扫描**
    - `@electron-forge/plugin-fuses`：控制 Electron Fuses 减少攻击面
    - Semgrep 自定义规则：nodeIntegration / contextIsolation / remote / eval / shell.openExternal
    - 禁止 `remote` module、`eval` / `new Function`
    - renderer 不暴露 `fs` / `path` / `child_process`
    - IPC 校验 sender / origin / payload schema
    - `shell.openExternal` URL allowlist
    - 严格 CSP 配置
- [ ] **Git 密钥泄漏防护**
    - `Gitleaks`：pre-commit hook + CI 门禁
    - 禁止任何 secret 进入 git 历史
- [ ] **依赖漏洞扫描**
    - `OSV-Scanner`：lockfile + SBOM 扫描
    - `npm audit --audit-level=high` / `pnpm audit`
    - CI 中 high / critical 漏洞阻止合并
- [ ] **SAST 静态安全分析**
    - `Semgrep`：`semgrep scan --config=auto`
    - 覆盖 OWASP Top 10 + Electron 特有风险
- [ ] **Husky + lint-staged pre-commit hook**
    - 保存时：ESLint fix + Prettier write
    - pre-commit：lint-staged（ESLint + Prettier + typecheck）
    - pre-push：typecheck + unit tests + Gitleaks
- [ ] **CI 合并门禁（全部必须通过）**
    - type error → 失败
    - lint warning → 失败
    - format diff → 失败
    - high / critical security → 失败
    - secret 泄漏 → 失败
    - 循环依赖 → 失败
    - 未使用依赖 → 失败
    - 构建失败 → 失败
    - 测试失败 → 失败
- [ ] **package.json check 脚本**
    - `"typecheck": "tsc --noEmit"`
    - `"lint": "eslint . --max-warnings=0"`
    - `"format:check": "prettier --check ."`
    - `"deadcode": "knip"`
    - `"arch": "depcruise src --validate .dependency-cruiser.cjs"`
    - `"security:js": "pnpm audit --audit-level=high && gitleaks detect --source ."`
    - `"security:sast": "semgrep scan --config=auto"`
    - `"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch && pnpm security:js"`

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

- [ ] **逻辑层**：在 `main/index.ts` 的 `app.whenReady()` 中，加载 config 后，检查 `config.plugins` 是否为空
- [ ] 若为空，遍历 `allDefinitions`（bundled + user），为每个 discovered plugin 创建默认 `PluginConfiguration`：
    - `instanceId`: 基于 `scriptName` + 时间戳或 UUID
    - `stateId`: UUID
    - `name`: 取 `metadata.name` 或 `metadata.name@zh-Hans`，fallback 到脚本文件名
    - `enabled`: `true`
    - `executablePath`: 插件脚本完整路径
    - `refreshIntervalSeconds`: 默认 `300`（5 分钟，与旧项目一致）
    - `parameterValues`: `{}`（空，等用户填写）
- [ ] 保存更新后的 config
- [ ] **去重保护**：后续启动不重复创建。判断依据：已有实例的 `executablePath` 是否匹配
- [ ] **测试**：
    - 空 config → 自动创建 N 个实例（N = bundled plugin 数量）
    - 非空 config → 不重复创建
    - 同一脚本不创建重复实例
    - instanceId 唯一

### Round 14.2: 密钥回注 — 执行插件前合并 secrets

**现状**：`config-ipc.ts` 的 `handleConfigSaveSecrets()` 正确地将 API key 写入 `secrets.json`（通过 `secretsStore.set()`）。但 `refresh-service.ts:67` 构建命令时只用 `plugin.parameterValues`，从未从 `secretsStore` 读取密钥。DeepSeek / Tavily / GLM / MiniMax 四个 API key 插件全部无法获得真实 key。

**对标**：旧项目在 `PluginExecutor.swift` 构建参数时，直接从 `parameterValues` 字典取值（旧项目 secret 存 Keychain，读取后注入同一字典）。

- [ ] **`refresh-service.ts` 改造**：在 `refresh()` 函数中，构建命令前，从 `secretsStore` 读取当前实例的所有密钥
- [ ] 将密钥合并到 `parameterValues` 副本中（不修改原始 config）
- [ ] 将合并后的 `parameterValues` 传给 `commandBuilder`
- [ ] **`secretsStore` 接口补充**：`refresh-service.ts` 需要依赖 `SecretsStore`，在 `RefreshServiceDeps` 中添加 `secretsStore` 字段
- [ ] **密钥格式**：`secretsStore.get()` 的 key 格式为 `${instanceId}:${paramName}`，与 `config-ipc.ts:102` 写入格式一致
- [ ] **`secretParamKeys` 映射**：需要知道哪些参数是 secret 类型，才能只读取对应的 key。从 plugin metadata 的 `parameters` 中 `type === "secret"` 获取
- [ ] **测试**：
    - 有 secret 的插件 → 命令行参数包含真实密钥值
    - 无 secret 的插件 → 行为不变
    - secret 不存在 → parameterValues 中该字段不传（符合旧项目"仅传递非空参数"规则）
    - secret 值不进入日志

### Round 14.3: 启动时启用定时刷新调度器

**现状**：`plugin-scheduler.ts` 实现完整（`start / stop / stopAll / refreshNow / isRunning`），但 `main/index.ts` 从未实例化 `createPluginScheduler()`。

**对标**：旧项目 `UsageBoardStore.swift` 在启动时为每个 enabled plugin 创建独立 `Task` + `Task.sleep` 调度。首次刷新：有缓存则等 `interval - 已过时间`，无缓存则立即。

- [ ] **`main/index.ts` 改造**：在 `app.whenReady()` 中，创建 `PluginScheduler` 实例
- [ ] 依赖注入：`refresh` 函数使用 `refreshService.refresh(instanceId)`
- [ ] 启动调度：遍历 `config.plugins`，对每个 `enabled === true` 的插件调用 `scheduler.start(instanceId, refreshIntervalSeconds)`
- [ ] **config 变更时重建调度**：当用户通过 Settings 修改 `refreshIntervalSeconds` 或 `enabled` 状态后，需 stop + restart 对应实例的调度
- [ ] **IPC 扩展**（可选）：`config:save` handler 中检测插件配置变更，触发调度重建
- [ ] **测试**：
    - app ready 后 scheduler 对每个 enabled plugin 调用 `start()`
    - disabled plugin 不被调度
    - config 变更后调度间隔更新

### Round 14.4: 系统休眠 / 唤醒处理

**现状**：没有任何 sleep/wake 处理。电脑休眠后定时刷新会积压，唤醒后可能瞬间触发大量插件执行。

**对标**：旧项目监听 `NSWorkspace.willSleepNotification` / `NSWorkspace.didWakeNotification`。睡眠时取消所有调度 task，唤醒后重建调度。安全网：如果 wake 通知丢失，4 小时后自动恢复。

- [ ] **Electron 适配**：使用 `powerMonitor` 模块（Electron 内置）
    - `powerMonitor.on('suspend', ...)` → 调用 `scheduler.stopAll()`
    - `powerMonitor.on('resume', ...)` → 遍历 enabled plugins 重新 `scheduler.start()`
- [ ] **安全网**：resume 事件可能丢失（与旧项目一致），设置 4 小时定时器，超时自动恢复所有调度
- [ ] **测试**：
    - suspend 事件触发 `stopAll()`
    - resume 事件触发重新 `start()`
    - 安全网定时器触发恢复

### Round 14.5: 插件显示名去重

**现状**：多个插件实例同名时 UI 显示相同名称，无法区分。

**对标**：旧项目 `PluginDisplayNames.swift`：同名插件自动加序号（"Claude" → "Claude", "Claude 2"）。优先用 metadata 的 `localizedName`，其次配置的 `name`，最后 "未命名"。

- [ ] **逻辑层**：实现 `getDisplayName(config: PluginConfiguration, metadata?: PluginMetadata, allNames: string[]): string`
- [ ] 优先级：`metadata.name@{language}` → `metadata.name` → `config.name` → "未命名"
- [ ] 同名去重：遍历所有实例名，重复的加序号 " 2", " 3"...
- [ ] **调用点**：`plugin-ipc.ts` 的 `handlePluginList()` 中，为每个 plugin 计算 `displayName`
- [ ] **PluginInfo DTO 扩展**：添加 `displayName` 字段
- [ ] **UI 更新**：Dashboard / Popup 的 `PluginCard` 使用 `displayName` 替代 `name`
- [ ] **测试**：
    - 不同名插件 → 原样显示
    - 两个同名 → 第二个加 " 2"
    - 三个同名 → " 2", " 3"
    - metadata name 优先级高于 config name

### Round 14.6: 配置写入防抖

**现状**：每次 `config:save` 直接调用 `configStore.save()` 原子写入。用户在 Settings 中快速修改多个字段会产生多次磁盘写入。

**对标**：旧项目 `UsageBoardStore.scheduleConfigurationWrite()` 用 generation counter 合并短时间多次写入。写入后重建 snapshots、重启 schedulers、刷新插件。

- [ ] **ConfigStore 扩展**：添加 `scheduleSave(config: AppConfiguration, delayMs?: number): void` 方法
- [ ] 使用 generation counter 或 `setTimeout` + `clearTimeout` 实现防抖
- [ ] 默认延迟：建议 500ms（旧项目未确认具体值，UNCONFIRMED #6）
- [ ] **调用点改造**：`config-ipc.ts` 的 `handleConfigSave()` 改用 `scheduleSave()` 替代 `save()`
- [ ] **测试**：
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

- [ ] `tests/integration/plugin/runner.test.ts` — 7 个测试全部失败，exitCode 9009（Windows 找不到 Python）
    - 排查 fake plugin Python 脚本路径或 Python 检测逻辑
    - 确认 Windows 上 `python3` 命令可用性
    - 必要时使用 `py` launcher 或跳过特定平台测试
- [ ] `tests/integration/config/secrets-store.test.ts` — 1 个失败（Windows chmod 不支持 0600）
    - Windows 平台跳过 chmod 测试或使用等价安全检查
- [ ] 跑通 `pnpm test`，全绿（或已记录已知失败并标记 skip）

### Round 13.2: Playwright + Electron E2E 基础设施

- [ ] 确认 `@playwright/test` 已安装
- [ ] 确认 `playwright.config.ts` 配置正确
- [ ] 确认 `tests/user_e2e/fixtures/electron_app.ts` 能启动 / 停止真实 Electron 实例
- [ ] 确认 `tests/user_e2e/fixtures/app_fixture.ts` 封装窗口操作
- [ ] 确认 `tests/user_e2e/fixtures/test.ts` fixture 定义完整
- [ ] 确认 `tests/user_e2e/global_setup.ts` 每次 E2E 前执行 `electron-forge package`
- [ ] Page Objects 完整：
    - `pages/popup_page.ts`
    - `pages/dashboard_page.ts`
    - `pages/settings_page.ts`

### Round 13.3: UI 埋 data-testid

- [ ] Popup 窗口：
    - `[data-testid="popup-refresh-btn"]` — 刷新按钮
    - `[data-testid="popup-plugin-card"]` — 插件卡片（带 instanceId）
    - `[data-testid="popup-error"]` — 错误信息
    - `[data-testid="popup-empty"]` — 空状态
- [ ] Dashboard 窗口：
    - `[data-testid="dashboard-title"]` — 面板标题
    - `[data-testid="dashboard-plugin-list"]` — 插件卡片列表
    - `[data-testid="dashboard-plugin-card-{instanceId}"]` — 单个插件卡片
    - `[data-testid="dashboard-status-{instanceId}"]` — 状态标签
    - `[data-testid="dashboard-refresh-btn"]` — 刷新按钮
    - `[data-testid="dashboard-empty"]` — 空状态
- [ ] Settings 窗口：
    - `[data-testid="settings-sidebar"]` — 侧栏导航
    - `[data-testid="settings-plugin-nav-{instanceId}"]` — 插件导航项
    - `[data-testid="settings-add-plugin-btn"]` — 添加插件按钮（Round 14.1 完成后）
    - `[data-testid="settings-form-{instanceId}"]` — 参数表单
    - `[data-testid="settings-save-btn-{instanceId}"]` — 保存按钮
    - `[data-testid="settings-duplicate-btn-{instanceId}"]` — 复制按钮

### Round 13.4: E2E spec 编写

- [ ] `app_lifecycle.spec.ts` — 启动、托盘出现、Popup 窗口显隐、退出
- [ ] `popup_view.spec.ts` — 插件卡片渲染、使用量数据展示、刷新按钮功能、错误状态
- [ ] `dashboard_view.spec.ts` — 仪表盘标题、插件卡片列表、状态展示
- [ ] `settings_view.spec.ts` — 设置侧栏、插件选择、参数表单填写和保存
- [ ] `plugin_config.spec.ts` — 首次启动自动创建实例、API Key 填写、密钥保存、手动刷新
- [ ] `scheduler.spec.ts` — 定时刷新触发、休眠恢复（如可模拟）

### Round 13.5: 打包 smoke 流程标准化

- [ ] 每次打包后执行 checklist：
    1. 启动 exe
    2. 确认渲染进程无白屏
    3. 确认托盘图标出现
    4. 确认点击托盘弹出 Popup 窗口
    5. 确认插件自动加载（Round 14.1 完成后）
    6. 确认 Dashboard 显示插件卡片
    7. 确认 Settings 显示插件列表
- [ ] 将 smoke 步骤写入 `scripts/smoke-check.md` 或自动化脚本
- [ ] 每次 `pnpm package` 后必须执行

### Round 13.6: CI 门禁（可选，后续实施）

- [ ] PR 门禁：`pnpm check`（typecheck + lint + format + deadcode + arch）
- [ ] PR 门禁：`pnpm test`（单元 + 集成）
- [ ] PR 门禁：`pnpm test:e2e:core`（核心 E2E，离线通过）
- [ ] Nightly：全量 E2E + 外部服务连通性

### Round 13.7: 详细日志系统

- [ ] **选型**：评估 `electron-log` vs 自建 logger，确定方案
- [ ] **Main 进程日志**：
    - 应用生命周期（启动、就绪、窗口创建、托盘创建、退出）
    - IPC 调用（channel、参数脱敏、耗时、返回值摘要）
    - 插件执行（脚本名、instanceId、参数脱敏、exitCode、stdout/stderr 摘要、耗时）
    - 调度事件（定时触发、手动刷新、缓存命中/未命中、并发跳过）
    - 配置变更（读/写 config、字段变更记录）
    - Python 检测（搜索路径、检测结果）
- [ ] **Renderer 进程日志**：
    - 页面导航（路由切换）
    - 用户交互（按钮点击、表单输入/提交、下拉选择）
    - IPC 调用发起（channel 名、参数脱敏）
    - 错误展示（UI 错误状态、错误消息）
- [ ] **日志格式**：统一格式 `[timestamp] [level] [process] [module] message`
- [ ] **日志输出**：
    - 文件输出：`{userData}/logs/` 目录，按日期滚动，保留最近 7 天
    - 控制台输出：开发模式启用，生产模式关闭（仅写文件）
- [ ] **日志级别**：开发阶段默认 `debug`，可通过配置文件调整
- [ ] **安全红线**：
    - secret / API key 值绝不进入日志（参数名可记录，值替换为 `***`）
    - 日志文件权限限制为用户只读
- [ ] **与现有 console.log 的关系**：逐步替换现有 console.log 为结构化日志

---

## Phase 8: 补齐代码质量门禁 (Round 3.5)

> Round 3.5 在 TASKS.md 中全部标记为 `[ ]`，以下逐项展开为可执行任务。

### Round 3.5.1: TypeScript 严格模式

- [ ] 更新 `tsconfig.json`：
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
- [ ] 修复所有新增的 type error
- [ ] `pnpm typecheck` 通过

### Round 3.5.2: ESLint type-aware 规则

- [ ] 安装依赖：
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
- [ ] 配置 `.eslintrc.cjs` 或 `eslint.config.*`：
    - `no-explicit-any: error`
    - `no-unsafe-assignment: error`
    - `no-floating-promises: error`
    - `await-thenable: error`
    - `switch-exhaustiveness-check: error`
    - `consistent-type-imports: error`
- [ ] `pnpm lint` 通过，`--max-warnings=0`（warning = error）

### Round 3.5.3: 格式化检查

- [ ] 配置 Prettier 或 Biome
- [ ] `pnpm format:check` 通过
- [ ] 全项目格式化一次

### Round 3.5.4: 死代码 / 依赖架构检查

- [ ] 配置 `Knip`：检测未使用文件、导出、依赖
- [ ] 配置 `dependency-cruiser`：
    - 禁止循环依赖
    - renderer 不得 import Node API（`node:fs`, `node:child_process` 等）
- [ ] `pnpm deadcode` 通过
- [ ] `pnpm arch` 通过

### Round 3.5.5: Electron 安全扫描

- [ ] 配置 `@electron-forge/plugin-fuses`（减少攻击面）
- [ ] Semgrep 自定义规则：
    - `nodeIntegration: true` → error
    - `contextIsolation: false` → error
    - 使用 `remote` module → error
    - `eval` / `new Function` → error
    - `shell.openExternal` 无 URL 校验 → error
- [ ] `pnpm security:sast` 通过

### Round 3.5.6: Git 密钥泄漏防护

- [ ] 安装 `Gitleaks`
- [ ] 配置 pre-commit hook
- [ ] 确认无 secret 在 git 历史中

### Round 3.5.7: 依赖漏洞扫描

- [ ] `pnpm audit --audit-level=high`
- [ ] 修复 high / critical 漏洞
- [ ] 配置 `OSV-Scanner`（可选）

### Round 3.5.8: Husky + lint-staged

- [ ] 安装 `husky` + `lint-staged`
- [ ] pre-commit：ESLint fix + Prettier write + typecheck
- [ ] pre-push：typecheck + unit tests + Gitleaks

### Round 3.5.9: package.json check 脚本汇总

- [ ] `"typecheck": "tsc --noEmit"`
- [ ] `"lint": "eslint . --max-warnings=0"`
- [ ] `"format:check": "prettier --check ."`
- [ ] `"deadcode": "knip"`
- [ ] `"arch": "depcruise src --validate .dependency-cruiser.cjs"`
- [ ] `"security:js": "pnpm audit --audit-level=high && gitleaks detect --source ."`
- [ ] `"security:sast": "semgrep scan --config=auto"`
- [ ] `"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch && pnpm security:js"`

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
