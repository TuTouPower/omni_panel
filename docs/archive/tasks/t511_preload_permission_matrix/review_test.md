# Task review t511（reviewer_focus: 测试）

- task：`t511_preload_permission_matrix`
- spec：`docs/tasks/t511_preload_permission_matrix/spec.md`
- diff_anchor：`17f960cdeeb30c9b6ab447ce31b2033f58b3e4e2`
- target：`git -C '/Users/karson/kar/code/omni_panel_t511' diff 17f960cdeeb30c9b6ab447ce31b2033f58b3e4e2`
- round：1
- reviewed_at：2026-09-25 11:53 UTC+8

reviewed_scope: 897e8c597b988078

## Findings

### t511_test_f001 - 测试自建平行 mock 冒充覆盖，create_grok_bot_oauth_apis 生产实现零测试

- 严重度：important
- 锚点：AC-002（在 Popup 与 Tray 窗口上下文中，Grok Bot 登录管理与系统管理等高阶方法未挂载或调用受限）与危险模式扫描「mock 误用：测 mock 存在而非真实行为 / mock 被测逻辑本身」
- 位置：`tests/unit/preload/route_api.test.ts:119-160`（测试用例 `select_grok_bot_api (A144 / AC-002) > exposes disabled Grok Bot API to %s`）及 `tests/unit/preload/oauth_api.test.ts`
- 问题：
  1. `tests/unit/preload/route_api.test.ts` 第 119-140 行在测试内自建了辅助函数 `create_grok_bot_apis`，并在其中手写了 `const disabled_err = () => Promise.reject(new Error("Grok Bot OAuth login is only available from settings"))`。
  2. 第 158 行断言 `await expect(api.login_start()).rejects.toThrow("only available from settings")`，实际上执行并验证的是测试自身创建的局部函数，而非任何生产代码。这属于典型的 mock 误用与假行为断言。
  3. `src/preload/oauth_api.ts` 中本次实际新增/修改的生产工厂 `create_grok_bot_oauth_apis`（包含只读报错存根与设置档位的 IPC 代理）在整个测试套件中（包括 `tests/unit/preload/oauth_api.test.ts`）完全没有被导入或测试，生产代码覆盖为 0。若生产实现存在任何缺陷（例如返回 resolved、报错文案不符或方法漏挂载），现有测试依然全部 PASS。
- 建议：在 `tests/unit/preload/oauth_api.test.ts` 中为生产函数 `create_grok_bot_oauth_apis` 补充单元测试，验证其 `readonly_api`（全部操作方法均按契约 reject）与 `settings_api`（正确触发对应 IPC 通道）；在 `route_api.test.ts` 中仅验证 selector 返回引用的正确性，移除对 test-local mock 方法调用的虚假断言。

### t511_test_f002 - 缺失 Preload 权限矩阵与全窗口能力暴露面单元测试

- 严重度：important
- 锚点：AC-004（权限矩阵测试用例覆盖全部窗口类型，验证只读与设置档位边界完全符合预期）及 spec 契约区范围（编写 Preload 权限矩阵单元测试，显式断言各窗口的能力暴露面）、上下文区测试策略（针对生成的 Preload 上下文对象做键与函数可用性快照断言）
- 位置：`tests/unit/preload/route_api.test.ts` 与 `src/preload/index.ts:375-398,633-671`
- 问题：
  AC-004 明确要求「权限矩阵测试用例覆盖全部窗口类型，验证只读与设置档位边界完全符合预期」，spec 测试策略亦规定「针对生成的 Preload 上下文对象做键与函数可用性快照断言」。
  然而当前实现仅在 `route_api.test.ts` 对几个单独的 `select_*` 路由分流函数传入孤立的占位 stub 对象进行了测试，没有任何测试针对最终组装出的 Preload 权限矩阵（即 `UsageboardApi` 或各窗口生成的实际上下文）断言能力暴露面。
  `src/preload/index.ts` 中为低权窗口定义的 `config_readonly_stubs`（如 tray/session 下 save/export/import/saveSecrets 等置为空操作存根）及其与各路由能力矩阵的组装结果完全脱离自动化测试守护。若某低权窗口意外泄露高权方法，现有测试无法感知。
- 建议：补充 Preload 权限矩阵单元测试（可参考 `tests/unit/preload/session_history_contract.test.ts` 或 `config_export_options.test.ts` 模式，通过 mock electron 并切换 `window.location.hash` 加载 preload），对全部窗口类型（setting、usage/popup、tray、session 等）所暴露的上下文方法进行能力集/键值快照或显式断言，切实覆盖 AC-004。

### t511_test_f003 - Popup config.save 白名单过滤未在 Preload 契约层端到端串联验证

- 严重度：minor
- 锚点：AC-003（Popup 窗口调用 `config.save` 保存数据时，白名单以外的系统配置项不会被持久化覆盖）与上下文区测试策略（模拟 Popup 环境调用 `config.save` 传入越权字段，断言白名单过滤生效）
- 位置：`tests/unit/preload/config_filter.test.ts:8` 与 `src/preload/index.ts:387-398`
- 问题：
  `tests/unit/preload/config_filter.test.ts` 仅对纯函数 `filter_popup_config_save` 进行了单测。
  但在 `src/preload/index.ts` 中，Popup 暴露的 `config_popup.save` 包含 `await config_readonly.get()` 读取当前配置、调用 `filter_popup_config_save` 过滤、再将安全配置转交 `config_full.save` 的异步链路。这一 Preload 方法本身未被任何测试调用，未完整落实 spec 测试策略中「模拟 Popup 环境调用 config.save 传入越权字段，断言白名单过滤生效」的端到端调用验证。鉴于纯函数已有完整覆盖，该项定为 minor 提示。
- 建议：在 Preload 契约测试中增加针对 Popup 窗口下 `usageboard.config.save(payload)` 的调用测试，验证其正确拉取当前配置、执行白名单过滤并最终通过 IPC 保存安全配置。

## 结论

- 改测方向复核：无「迁就实现」的改测；原有测试均原样保留，改动均为纯增量。
- 本轮新发现：3 条（2 条 important，1 条 minor）
- 未进表的提示：无
- 总体判断：AC-002 关键生产实现 `create_grok_bot_oauth_apis` 缺乏真实测试且存在 mock 误用假断言，AC-004 要求的 Preload 权限暴露矩阵测试完全缺失，判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/index.ts` 消除 144 行 switch-case 重复，统一经 route 选择器装配 `api: UsageboardApi`；`pnpm typecheck` 与相关单元测试通过。
- AC-002：`re_verified`，查证 `tests/unit/preload/route_api.test.ts:158` 断言的是测试内局部 mock，生产工厂 `create_grok_bot_oauth_apis` 零测试（发现 t511_test_f001）。
- AC-003：`re_verified`，查证并独立运行 `tests/unit/preload/config_filter.test.ts`，验证 `filter_popup_config_save` 纯函数白名单过滤生效；记录 Preload 层串联未测提示（发现 t511_test_f003）。
- AC-004：`re_verified`，查证测试目录，发现缺乏各窗口类型 Preload 暴露能力矩阵与边界断言（发现 t511_test_f002）。

coverage = 4 / 4 (100%)

verdict: FAIL

## Round 2 (2026-09-25 12:15 UTC+8)

reviewed_scope: d6a776c54fd67a3f

### Findings

#### t511_test_f004 - preload_permission_matrix.test.ts 复制生产逻辑自建平行 mock，冒充 AC-003 端到端验证与假行为断言

- 严重度：important
- 锚点：AC-003（Popup 窗口调用 `config.save` 保存数据时，白名单以外的系统配置项不会被持久化覆盖）、AC-004（权限矩阵测试用例覆盖全部窗口类型，验证只读与设置档位边界完全符合预期），以及危险模式扫描「mock 误用：mock 被测逻辑本身 / 在测试中复制生产逻辑冒充覆盖」与「生产逻辑可达：测试能直接触达被测生产实现；只能在测试中复制生产逻辑时，属于测试基础设施缺口，不用平行实现冒充覆盖」
- 位置：`tests/unit/preload/preload_permission_matrix.test.ts:41-52, 60-66, 77-103, 218-239` 与 `src/preload/index.ts:378-390`
- 问题：
  1. `tests/unit/preload/preload_permission_matrix.test.ts` 第 41-52 行在测试用例的 `setup_deps` 内部手动复制了 `config_popup.save` 的业务实现（动态 import 过滤器 + 纯函数过滤 + 转交 `config_full.save`）。并在第 224-239 行标榜 `// AC-003 端到端调用验证：Popup 窗口通过 config.save 尝试保存越权字段`，断言测试自身手写的过滤流程正常运行。
  2. 生产代码 `src/preload/index.ts:378-390` 中的真实 `config_popup.save` 依然未被导出或加载执行，覆盖为 0。若生产实现存在任何缺陷（如 `safe_config` 传参错误、未 await、字段解构失效），现有测试依然 100% 全部通过。这是典型的测试内部复制生产逻辑冒充覆盖（假行为测试）。
  3. 同样，该测试在第 60-66 行与 77-103 行为 `session_disabled` 与 `grok_bot_readonly` 自建了 `Promise.reject(new Error(...))`，并在后续测试用例中（第 218、221、246、249、258 行）断言这些测试自建 mock 抛出异常，未能触达生产环境中真实暴露给渲染进程的只读/受限存根。
- 建议：将端到端契约验证改为直接加载生产入口 `src/preload/index.ts`（参考已有模式 `tests/unit/preload/session_history_contract.test.ts`，mock `electron` 并切换 `window.location.hash` 加载 preload），直接断言 `contextBridge.exposeInMainWorld` 挂载的真实上下文对象，调用其 `config.save` 验证白名单过滤并最终打到 IPC 通道的真实端到端行为；移除测试内部手写的平行闭包与虚假行为断言。

### 结论

- 前轮 finding 复核：
  - `t511_test_f001`：已消除。在 `tests/unit/preload/oauth_api.test.ts` 中直接测试了生产工厂 `create_grok_bot_oauth_apis`，断言了只读存根拒绝与设置档位 IPC 调用；`route_api.test.ts` 移除了测试局部 mock 的虚假行为调用。
  - `t511_test_f002`：修不彻底。新增了 `preload_permission_matrix.test.ts` 覆盖 4 种路由的 `create_preload_api` 工厂引用测试，但暴露给 Electron contextBridge 的真实生产上下文矩阵依然缺乏直接契约覆盖，且测试内包含了自建 mock 行为断言。
  - `t511_test_f003`：换形式弱化并引入假断言。在测试内复制生产逻辑冒充端到端验证，已升级为 blocking finding `t511_test_f004`。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：1 条（important，`t511_test_f004`）
- 未进表的提示：无
- 总体判断：`create_grok_bot_oauth_apis` 生产测试已补齐；但 `preload_permission_matrix.test.ts` 在测试内复制生产逻辑冒充 AC-003 端到端验证，且存在测试自建 mock 假行为断言，生产 Preload 暴露面真实契约仍不可信，判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/api_factory.ts` 与 `src/preload/index.ts`，数据驱动能力矩阵消除 switch-case 重复；`pnpm test tests/unit/preload/` 全数通过。
- AC-002：`re_verified`，查证并运行 `tests/unit/preload/oauth_api.test.ts`，验证 `create_grok_bot_oauth_apis` 的 `readonly_api`（拒绝）与 `settings_api`（IPC 代理）真实生产逻辑。
- AC-003：`re_verified`，查证并运行 `tests/unit/preload/config_filter.test.ts`，纯函数过滤逻辑正确；但 Preload 契约层存在测试复制生产逻辑自建平行 mock 的虚假验证（发现 t511_test_f004）。
- AC-004：`re_verified`，查证 `tests/unit/preload/preload_permission_matrix.test.ts`，已覆盖 4 种路由的工厂引用测试，但真实暴露给 Electron 的能力矩阵缺少真实契约测试且含有假行为断言（发现 t511_test_f002 修不彻底与 t511_test_f004）。

coverage = 4 / 4 (100%)

verdict: FAIL

## Round 3 (2026-09-25 12:35 UTC+8)

reviewed_scope: 76ed9600b5dbdb43

### Findings

无

### 结论

- 前轮 finding 复核：
  - `t511_test_f001`：已消除。`tests/unit/preload/oauth_api.test.ts` 持续覆盖 `create_grok_bot_oauth_apis` 的真实生产逻辑；`route_api.test.ts` 保持为纯 selector 引用同一性断言。
  - `t511_test_f002`：已消除。生产代码将权限矩阵抽象为 `src/preload/api_factory.ts` 中的 `create_preload_api` 与 `create_preload_config`，并在 `tests/unit/preload/preload_permission_matrix.test.ts` 中直接导入并对 setting、usage、tray、session 全部 4 种窗口类型的权限档位与暴露边界进行了显式断言。
  - `t511_test_f003`：已消除。随 `t511_test_f004` 的重构一并彻底解决。
  - `t511_test_f004`：已消除。生产代码提取了 `create_preload_config` 生产工厂，`tests/unit/preload/preload_permission_matrix.test.ts` 移除了测试内部手写的平行 mock 闭包，直接执行生产的 `create_preload_config`，真实断言了 usage 窗口调用 `api.config.save` 时的白名单过滤与敏感字段恢复行为，以及 tray 窗口下的 no-op 安全存根。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：生产配置分权与装配工厂提取合理，全部前轮 finding 已彻底消除，矩阵测试真实直接覆盖了全部窗口类型与边界，判定 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/api_factory.ts` 与 `src/preload/index.ts`，Preload 经 `create_preload_api` 与 `create_preload_config` 数据驱动装配，彻底消除三栈重复；单元测试与类型检查全部通过。
- AC-002：`re_verified`，查证并运行 `tests/unit/preload/oauth_api.test.ts` 与 `route_api.test.ts`，验证 `create_grok_bot_oauth_apis` 生产实现与低权路由挂载受限存根行为。
- AC-003：`re_verified`，查证并运行 `tests/unit/preload/config_filter.test.ts` 及 `tests/unit/preload/preload_permission_matrix.test.ts`，验证生产工厂 `create_preload_config` 中 `config_popup.save` 的白名单过滤与敏感字段防护逻辑。
- AC-004：`re_verified`，查证并运行 `tests/unit/preload/preload_permission_matrix.test.ts`，覆盖 setting、usage、tray、session 全部窗口类型，验证只读与设置档位边界完全符合预期。

coverage = 4 / 4 (100%)

verdict: PASS
