# Task review t510（reviewer_focus: 测试）

- task：`t510_main_bootstrap_security_proxy`
- spec：`docs/tasks/t510_main_bootstrap_security_proxy/spec.md`
- diff_anchor：`a3e79022df8b9f6d172e9cd04d908de976b23b74`
- target：`git -C '/Users/karson/kar/code/omni_panel_t510' diff a3e79022df8b9f6d172e9cd04d908de976b23b74`
- round：1
- reviewed_at：2026-09-25 10:55 UTC+8

reviewed_scope: 0c7f4d077e16c31b

## Findings

### t510_test_f001 - AC-001 缺失自动化测试覆盖

- 严重度：important
- 锚点：AC-001（第二个应用实例启动且单实例锁获取失败时，立即退出进程，不执行数据库建表或服务监听）
- 位置：`src/main/index.ts:179-186,222-224`
- 问题：契约区 AC-001 明确要求“第二个应用实例启动且单实例锁获取失败时，立即退出进程，不执行数据库建表或服务监听”，且可测试性声明明确标注“全部 AC 可自动测试”，测试策略中亦规划了“编写单实例锁竞争与提前返回单元测试”。但在当前提交及测试套件中，未新增任何单元测试或集成测试断言 `has_single_instance_lock` 失败时的提前 `return` 或退出阻断行为，导致核心启动安全防线完全无自动化回归保护。
- 建议：补充测试用例，模拟 `app.requestSingleInstanceLock()` 返回 false 时的启动链路，断言进程提前退出并不触发后续初始化。

### t510_test_f002 - AC-006 缺失自动化测试覆盖

- 严重度：important
- 锚点：AC-006（Windows 下生成权限命令时采用当前真实登录用户名，不受环境变量覆盖影响）
- 位置：`src/main/core/vault/file-vault-backend.ts:45-54`
- 问题：契约区 AC-006 明确要求“Windows 下生成权限命令时采用当前真实登录用户名，不受环境变量覆盖影响”，且声明“全部 AC 可自动测试”。虽然生产代码补充了 `userInfo().username` 优先获取，但测试套件（如 `tests/integration/vault/file-vault-backend.test.ts:81`）在 Windows 环境直接跳过权限校验，且没有任何用例验证当 `process.env["USERNAME"]` 或 `USER` 被污染/覆盖时生成或调用的 icacls 命令参数仍然采用真实用户名。该 AC 行为无自动化测试验证。
- 建议：为 Windows 权限命令生成逻辑编写单元测试（或抽象命令构造函数），断言在环境变量被篡改时构造的命令行参数依然锁定 `os.userInfo().username`。

### t510_test_f003 - tests/unit/main/window_manager.test.ts 就地反转旧测试断言迁就新实现

- 严重度：important
- 锚点：改测审查规范（“实现变更导致旧测试语义失效时的合法做法：新增覆盖新语义的测试；旧测试或原样保留（语义仍成立）或整体删除并说明理由。就地把旧测试的预期改成新实现的输出不合法。”）
- 位置：`tests/unit/main/window_manager.test.ts:166-182`
- 问题：原测试 `will-navigate guard allows http(s) and file:// (reload) navigation (t297)` 旨在断言 http(s) 链接在窗口内放行（`expect(prevented).not.toHaveBeenCalled()`）。本 task 采纳 A15/A16 变更需求后，实施者直接将该既有测试就地重命名为 `will-navigate intercepts external http(s) to open externally and allows file:// (A15, A16)`，并将 `not.toHaveBeenCalled()` 就地反转为 `toHaveBeenCalledTimes(1)` 与 `expect(openExternal)...`。这属于实现驱动修改测试预期，违反改测规范。
- 建议：整体删除原已失效测试并注明推翻理由，另行新增独立的 A15/A16 外部导航拦截测试用例。

### t510_test_f004 - AC-008 未测试系统升级后配置版本号递增行为

- 严重度：minor
- 锚点：AC-008（系统升级后自动清除存量空实例，配置版本号递增）
- 位置：`tests/unit/main/core/config/auto-seed.test.ts:170-189` 与 `src/main/index.ts:292`
- 问题：`auto-seed.test.ts` 仅验证了 `auto_seed_connectors` 能够识别并返回空实例 ID 列表，但未断言配置在清理提交后 `schemaVersion` 递增至预期版本（如从 1 递增至 2）。
- 建议：在配置升级事务测试中补充断言，验证清理发生时 `schemaVersion` 确已递增。

## 结论

- 前轮 finding 复核：Round 1 首轮审查，无前轮 finding
- 改测方向复核：存在 1 处违规改测（`tests/unit/main/window_manager.test.ts:166-182` 就地反转既有断言，见 `t510_test_f003`）
- 本轮新发现：4 条（3 important，1 minor）
- 未进表的提示：
  - `src/main/index.ts:755` 与 `src/main/core/session/session-manager.ts:326` 对 `is_safe_cookie_string` 的接入虽有纯函数单测覆盖，但未在 session 管理器层面编写输入异常 Cookie 触发拒绝的集成用例，建议后续可选择性补齐。
- 总体判断：核心 AC-001（单实例竞争退出）与 AC-006（Windows 权限用户名防覆盖）完全缺失测试覆盖，且存在 1 处就地反转旧测试断言的改测违规，测试结论为 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`trust_prior`。缺失针对单实例锁竞争失败提前返回与退出的自动化测试；依赖实施侧代码审查。
- AC-002：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:166-182`，验证 `will-navigate` 拦截外部导航并触发系统浏览器。
- AC-003：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:112-164`，验证协议白名单过滤与非法协议拦截。
- AC-004：`re_verified`。查证并运行 `tests/unit/main/security/csp.test.ts`，验证补充的 CSP 头字段完整性。
- AC-005：`re_verified`。查证并运行 `tests/unit/shared/cookie.test.ts`，验证 Cookie 长度上限（8KB）与换行符防御。
- AC-006：`trust_prior`。缺失针对 Windows 权限命令用户名防环境变量覆盖的自动化测试；依赖实施侧代码审查。
- AC-007：`re_verified`。查证并运行 `tests/unit/main/core/config/auto-seed.test.ts:191-207`，验证路径大小写无关比较。
- AC-008：`re_verified`。查证并运行 `tests/unit/main/core/config/auto-seed.test.ts:169-189`，验证存量空实例识别与清理输出。
- AC-009：`re_verified`。查证并运行 `tests/unit/config/secret_param_keys.test.ts:91-107`，验证 `oauth_pkce` 密钥集包含 `REFRESH_TOKEN`。
- AC-010：`re_verified`。查证并运行 `tests/unit/main/effective_proxy.test.ts`，验证系统代理开关及 SOCKS5 PAC 解析。

coverage = 8 / 10 (80%)

verdict: FAIL

## Round 2 (2026-09-25 11:15 UTC+8)

reviewed_scope: a3b60da1d33fbe34

### Findings

#### t510_test_f005 - auto-seed.test.ts 引入恒真断言冒充 AC-008 版本递增覆盖

- 严重度：important
- 锚点：AC-008（系统升级后自动清除存量空实例，配置版本号递增）及危险模式「恒真断言」
- 位置：`tests/unit/main/core/config/auto-seed.test.ts:190-195`
- 问题：测试用例 `bumps schemaVersion to at least 2 when cleanup and upgrade occurs (A79 / AC-008)` 未调用任何生产配置升级或迁移逻辑，直接在测试局部声明 `old_schema_version = 1` 并断言本地计算 `Math.max(old_schema_version, 2)` 的结果（`toBe(2)` 与 `toBeGreaterThan(old_schema_version)`）。这属于纯恒真断言（Tautological Assertion），命中危险模式扫描，且以虚假断言冒充 AC-008 的自动化覆盖。
- 建议：删除该恒真用例；引入真实的配置升级或迁移函数测试，或者对执行迁移的配置对象断言其升级后的 `schemaVersion` 从 1 递增至 2。

#### t510_test_f006 - single_instance.test.ts 使用测试内平行实现冒充 AC-001 启动短路覆盖

- 严重度：important
- 锚点：AC-001（单实例锁获取失败时，立即退出进程，不执行数据库建表或服务监听）及测试可信「生产逻辑可达」
- 位置：`tests/unit/main/single_instance.test.ts:22-33`
- 问题：用例 `short-circuits startup initialization when lock is not held` 在测试体内自行声明闭包函数 `const run_startup = (has_lock: boolean) => { if (!has_lock) return; init_fn(); };`，并通过向该局部闭包传入 `false` 断言 `init_fn` 未被调用。测试完全未触达 `src/main/index.ts:225-227` 的真实启动短路逻辑，属于在测试中用平行实现冒充生产覆盖。
- 建议：删除该测试内闭包用例；若受主进程生命周期限制无法在单元测试层直接驱动 `index.ts`，应在上下文区清晰说明主进程启动短路链路依赖集成/冒烟验证，而非使用虚假单元测试冒充全量覆盖。

### 结论

- 前轮 finding 复核：
  - `t510_test_f001`：修不彻底。`check_single_instance_lock` 抽离函数及其退出回调有了真实单测，但启动阻断测试使用了平行实现冒充（见 `t510_test_f006`）。
  - `t510_test_f002`：换形式弱化。新增的 `tests/unit/main/vault_permissions.test.ts` 显式传入 `() => "real_user"` 替代了默认的系统用户解析器，导致生产核心防篡改逻辑（`userInfo().username` 优先于 `process.env["USERNAME"]`）完全被 bypass，未真实验证 AC-006。
  - `t510_test_f003`：已消除。已整体删除原违规修改用例并注明推翻注释，拆分为两个语义清晰的独立用例。
  - `t510_test_f004`：换形式弱化并命中危险模式。未测试配置版本号递增逻辑，反而新增了本地 `Math.max(1, 2)` 恒真断言（升级为 `t510_test_f005`）。
- 改测方向复核：无新增迁就实现的违规改测（`t510_test_f003` 已按规范重构）。
- 本轮新发现：2 条（均为 important）。
- 未进表的提示：
  - `tests/unit/main/vault_permissions.test.ts` 建议测试默认解析器行为（不传第二个参数，或通过 `vi.spyOn(os, "userInfo")` 进行环境隔离），确保即使 `process.env["USERNAME"]` 被污染，默认解析依然返回真实系统用户名。
- 总体判断：存在恒真断言（`t510_test_f005`）和平行实现冒充覆盖（`t510_test_f006`），且 AC-006 核心防篡改行为被 mock 替代（`t510_test_f002` 仍实质未解），测试评审结论为 FAIL。
- 系统性 follow-up：无

#### AC 复验方式

- AC-001：`trust_prior`。`check_single_instance_lock` 单元测试验证了锁竞争失败时触发 `on_conflict` 回调；但 `index.ts` 启动短路逻辑采用了平行实现冒充（见 `t510_test_f006`）。
- AC-002：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:166-184`，验证 `will-navigate` 拦截外部 http(s) 导航并调用 `shell.openExternal`。
- AC-003：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:112-164`，验证协议白名单过滤与非法协议拦截。
- AC-004：`re_verified`。查证并运行 `tests/unit/main/security/csp.test.ts`，验证 `build_csp_header` 返回包含补充指令的 CSP 头部。
- AC-005：`re_verified`。查证并运行 `tests/unit/shared/cookie.test.ts`，验证 Cookie 长度上限（8KB）与换行符防御。
- AC-006：`trust_prior`。新增单测传入 mock 替换了默认解析器，未真实验证 `os.userInfo().username` 的防环境变量覆盖行为（见 `t510_test_f002`）。
- AC-007：`re_verified`。查证并运行 `tests/unit/main/core/config/auto-seed.test.ts:197-214`，验证 win32 平台下路径大小写无关匹配。
- AC-008：`trust_prior`。空实例清理已有测试；但版本号递增测试为恒真断言，未测试真实配置升级（见 `t510_test_f005`）。
- AC-009：`re_verified`。查证并运行 `tests/unit/config/secret_param_keys.test.ts:91-107`，验证 `oauth_pkce` 包含 `OAUTH_REFRESH_TOKEN`。
- AC-010：`re_verified`。查证并运行 `tests/unit/main/effective_proxy.test.ts`，验证系统代理开关及 SOCKS5 PAC 解析。

coverage = 7 / 10 (70%)

verdict: FAIL

## Round 3 (2026-09-25 11:30 UTC+8)

reviewed_scope: 93a5f20fd9e3388b

### Findings

无

### 结论

- 前轮 finding 复核：
  - `t510_test_f001`：已消除。`src/main/bootstrap/single-instance.ts` 将单实例锁与短路流程抽离为 `run_with_single_instance_lock`，在 `tests/unit/main/single_instance.test.ts` 中通过生产导出函数验证了锁获取失败时触发退出回调并不执行后续初始化。
  - `t510_test_f002`：已消除。`tests/unit/main/vault_permissions.test.ts` 直接调用默认解析器 `build_icacls_args`（不传自定义 mock 解析器），在 `process.env["USERNAME"]` 被伪造时通过 `vi.spyOn(os, "userInfo")` 验证生产逻辑优先绑定真实系统用户名，并断言输出参数不含被篡改的环境变量。
  - `t510_test_f003`：已消除。原失效测试维持整块删除并附带推翻理由，拆分为两个语义独立的用例。
  - `t510_test_f004`：已消除。见 `t510_test_f005` 复核结论。
  - `t510_test_f005`：已消除。删除了局部 `Math.max(1, 2)` 恒真断言用例；在 `tests/unit/main/core/config/auto-seed.test.ts` 中调用真实生产迁移函数 `apply_auto_seed_and_migrate`，验证存量空实例清理时 `schemaVersion` 从 1 递增至 2 且配置变更生效。
  - `t510_test_f006`：已消除。删除了测试体内的本地闭包平行实现，改为直接覆盖生产函数 `run_with_single_instance_lock`。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：前轮所有 blocking finding（恒真断言、平行实现冒充、用户解析器 mock bypass）均已彻底修复，所有 10 条 AC 均具备真实生产可达的自动化单元测试覆盖，测试评审结论为 PASS。
- 系统性 follow-up：无

#### AC 复验方式

- AC-001：`re_verified`。查证并运行 `tests/unit/main/single_instance.test.ts`，验证单实例锁失败时触发退出并不执行启动初始化。
- AC-002：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:166-184`，验证 `will-navigate` 拦截外部 http(s) 导航并交由外部系统浏览器打开，内部 file:// 正常放行。
- AC-003：`re_verified`。查证并运行 `tests/unit/main/window_manager.test.ts:112-164`，验证协议白名单校验与非法协议拦截。
- AC-004：`re_verified`。查证并运行 `tests/unit/main/security/csp.test.ts`，验证补齐后的完整 CSP 头指令（object-src、frame-ancestors、base-uri）。
- AC-005：`re_verified`。查证并运行 `tests/unit/shared/cookie.test.ts`，验证 Cookie 8KB 长度上限与 CRLF 换行符拒绝。
- AC-006：`re_verified`。查证并运行 `tests/unit/main/vault_permissions.test.ts`，验证默认解析器在 USERNAME 环境变量被污染时依然采用真实登录用户名生成 icacls 参数。
- AC-007：`re_verified`。查证并运行 `tests/unit/main/core/config/auto-seed.test.ts:226-242`，验证 win32 平台下路径大小写无关比较。
- AC-008：`re_verified`。查证并运行 `tests/unit/main/core/config/auto-seed.test.ts:174-224`，验证存量空实例清理且 `schemaVersion` 递增至 2。
- AC-009：`re_verified`。查证并运行 `tests/unit/config/secret_param_keys.test.ts:91-107`，验证 `oauth_pkce` 密钥集包含 `OAUTH_REFRESH_TOKEN`。
- AC-010：`re_verified`。查证并运行 `tests/unit/main/effective_proxy.test.ts`，验证系统代理关闭后出站直连，以及 SOCKS5 PAC 解析与 URL 校验。

coverage = 10 / 10 (100%)

verdict: PASS

