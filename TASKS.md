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
- [ ] Playwright smoke test

---

## Phase 4: 插件与多实例 (Round 10-11)

### Round 10: 集成真实 bundled plugins

- [ ] 复制旧项目 `Resources/BundledPlugins` → `resources/plugins`
- [ ] `_common.py` 可被插件 import
- [ ] 实现 bundled plugin discovery
- [ ] 实现 user plugin discovery
- [ ] 按顺序集成：DeepSeek → Tavily → GLM → MiniMax → Codex → Claude
- [ ] 每个插件输出 metadata 解析 / 参数 / 依赖 / 跨平台风险

### Round 11: 多实例 / 多账号

- [ ] 区分 `PluginDefinition`（脚本）和 `PluginInstance`（配置实例）
- [ ] 同一脚本可创建多个实例，各自独立参数/缓存/刷新间隔
- [ ] cache key 基于 instanceId
- [ ] Settings UI 支持 Duplicate Plugin
- [ ] Dashboard 按实例显示
- [ ] 测试：同脚本多实例 / 独立缓存 / 删除实例

---

## Phase 5: 打包发布 (Round 12)

### Round 12: 打包和平台兼容

- [ ] 配置 electron-builder 或 Electron Forge
- [ ] macOS dmg/zip
- [ ] Windows nsis
- [ ] Linux AppImage 或 deb
- [ ] `resources/plugins` 打进安装包，生产环境路径正确
- [ ] Python 可用性检测（python3 / python / py launcher）
- [ ] 找不到 Python 时 UI 给出明确错误
- [ ] 输出 `docs/platform-notes.md`

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
