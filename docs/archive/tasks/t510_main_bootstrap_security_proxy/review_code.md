# Task review t510（reviewer_focus: 代码）

- task：`t510_main_bootstrap_security_proxy`
- spec：`docs/tasks/t510_main_bootstrap_security_proxy/spec.md`
- diff_anchor：`a3e79022df8b9f6d172e9cd04d908de976b23b74`
- target：`git -C '/Users/karson/kar/code/omni_panel_t510' diff a3e79022df8b9f6d172e9cd04d908de976b23b74`
- round：1
- reviewed_at：2026-09-25 10:46 UTC+8

reviewed_scope: 0c7f4d077e16c31b

## Findings

### t510_code_f001 - is_internal_navigation 中 file 协议存在死分支表达式冗余

- 严重度：minor
- 锚点：代码质量与可维护性（死分支 / 冗余条件表达式）
- 位置：`src/main/window/window-manager.ts:141`
- 问题：`is_internal_navigation` 函数在第 137 行已执行 `if (target.protocol === "file:") return true;`。第 141 行在 `current.protocol === "file:"` 分支下执行 `return target.protocol === "file:";` 时，右侧表达式 `target.protocol === "file:"` 恒为 `false`（等价于 `return false;`）。该写法虽未破坏外部导航拦截行为，但存在逻辑冗余与可读性误导。
- 建议：将第 141 行简化为 `if (current.protocol === "file:") return false;`，或整合内部与外部协议比对分支。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/index.ts`（1693 行）、`src/main/core/session/session-manager.ts`（549 行）物理行数超标，均属于存量基础模块，本次 diff 仅微增单实例拦截与 Cookie 校验逻辑，未引发新缺陷或结构恶化。
    - 复杂度：新增/修改函数圈复杂度均在 15 门禁以下（`auto_seed_connectors` 约 12-14，其余均 ≤ 5）。
- 总体判断：本 task 实现严格对齐 spec 契约区全部 10 项 AC 及审阅采纳项，安全校验、网络代理与单实例锁控制流完备，仅存在 1 处无副作用的表达式冗余（minor），整体质量合格。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。查证 `src/main/index.ts:179-186,222-224` 单实例竞争失败时的退出与阻断逻辑。
- AC-002：`re_verified`。重跑测试 `tests/unit/main/window_manager.test.ts` 通过，查证 `src/main/window/window-manager.ts:254-275` 外部导航拦截与调用系统浏览器。
- AC-003：`re_verified`。重跑测试 `tests/unit/main/window_manager.test.ts` 通过，查证 `is_safe_external_url` 白名单限制与非法协议拦截。
- AC-004：`re_verified`。重跑测试 `tests/unit/main/security/csp.test.ts` 通过，查证 `src/main/security/csp.ts:23` 补充的三项 CSP 指令与全局 webRequest 注入。
- AC-005：`re_verified`。重跑测试 `tests/unit/shared/cookie.test.ts` 通过，查证 `src/shared/lib/cookie.ts` 及 `src/main/index.ts:755`、`src/main/core/session/session-manager.ts:326` 安全防护。
- AC-006：`re_verified`。查证 `src/main/core/vault/file-vault-backend.ts:45-54` 的 `userInfo().username` 优先获取与参数化调用。
- AC-007：`re_verified`。重跑测试 `tests/unit/main/core/config/auto-seed.test.ts` 通过，查证 `src/main/core/config/auto-seed.ts:75-80` 大小写规范化比较。
- AC-008：`re_verified`。重跑测试 `tests/unit/main/core/config/auto-seed.test.ts` 通过，查证 `src/main/index.ts:272-300` 存量空实例清理与 `schemaVersion` 推进。
- AC-009：`re_verified`。重跑测试 `tests/unit/config/secret_param_keys.test.ts` 通过，查证 `src/main/core/config/secret_param_keys.ts:21` 对 `oauth_pkce` 密钥集合支持。
- AC-010：`re_verified`。重跑测试 `tests/unit/main/effective_proxy.test.ts` 通过，查证 `src/main/core/network/effective_proxy.ts` 代理协议解析与系统代理开关控制。

coverage = 10 / 10 (100%)

verdict: PASS

## Round 2 (2026-09-25 11:00 UTC+8)

reviewed_scope: a3b60da1d33fbe34

## Findings

无新 finding。

## 结论

- 前轮 finding 复核：
    - `t510_code_f001`（minor）：仍存在。`src/main/window/window-manager.ts:141` 处 `target.protocol === "file:"` 仍为恒 false 表达式冗余，实施侧未做修改，因属非阻断性 minor，不影响功能逻辑与行为安全性。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大：`src/main/index.ts`（1693 行）、`src/main/core/session/session-manager.ts`（549 行）仍为存量大文件，本 task 仅作必要防御性增量，未新增结构性膨胀。
    - 复杂度：新增与变更函数圈复杂度均受控（最高为 `auto_seed_connectors` 约 13，< 15 门禁）。
- 总体判断：实现严格对齐契约区 AC-001 ~ AC-010 全部 10 项验收标准及审阅采纳项，安全校验、网络代理与单实例控制流完整，无阻断性缺陷。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。独立查证 `src/main/index.ts:179-186,222-224` 与 `tests/unit/main/single_instance.test.ts`，单实例锁失败时立即退出且退出后短路启动流程。
- AC-002：`re_verified`。独立运行 `tests/unit/main/window_manager.test.ts` 并查证 `src/main/window/window-manager.ts:254-275`，拦截外部导航并转入系统浏览器。
- AC-003：`re_verified`。独立查证 `src/main/window/window-manager.ts:132-134` 与 `tests/unit/main/window_manager.test.ts`，仅放行 `http:` 与 `https:`。
- AC-004：`re_verified`。独立查证 `src/main/security/csp.ts:23` 与 `tests/unit/main/security/csp.test.ts`，补齐 object-src/frame-ancestors/base-uri。
- AC-005：`re_verified`。独立查证 `src/shared/lib/cookie.ts` 与 `tests/unit/shared/cookie.test.ts`，长度 >8KB 或含 CRLF 时拒绝。
- AC-006：`re_verified`。独立查证 `src/main/core/vault/file-vault-backend.ts:42-55` 与 `tests/unit/main/vault_permissions.test.ts`，优先从 userInfo 获取 username 防御环境变量覆盖。
- AC-007：`re_verified`。独立查证 `src/main/core/config/auto-seed.ts:75-80` 与 `tests/unit/main/core/config/auto-seed.test.ts`，Win/macOS 平台大小写无关比对。
- AC-008：`re_verified`。独立查证 `src/main/core/config/auto-seed.ts:34-54` 与 `src/main/index.ts:272-300`，清理空实例并跃迁 schemaVersion。
- AC-009：`re_verified`。独立查证 `src/main/core/config/secret_param_keys.ts:21` 与 `tests/unit/config/secret_param_keys.test.ts`，支持 oauth_pkce 的 REFRESH_TOKEN/EXPIRES_AT。
- AC-010：`re_verified`。独立查证 `src/main/core/network/effective_proxy.ts` 与 `tests/unit/main/effective_proxy.test.ts`，支持 SOCKS5 PAC 解析及系统代理禁用直连。

coverage = 10 / 10 (100%)

verdict: PASS

## Round 3 (2026-09-25 11:30 UTC+8)

reviewed_scope: 93a5f20fd9e3388b

## Findings

无新 finding。

## 结论

- 前轮 finding 复核：
    - `t510_code_f001`（minor）：仍存在。`src/main/window/window-manager.ts:141` 处 `target.protocol === "file:"` 仍为恒 false 冗余判断表达式，未做修改。因属非阻断性 minor，不影响功能逻辑与行为安全性。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大：`src/main/index.ts`（1677 行）、`src/main/core/session/session-manager.ts`（549 行）为存量文件，本次 task 仅作必要局部防御性修改，无结构性膨胀。
    - 复杂度：新增与变更函数圈复杂度均受控（最高为 `auto_seed_connectors` 约 13，< 15 门禁）。
    - 代码组织观察：`src/main/bootstrap/single-instance.ts` 导出的 `run_with_single_instance_lock` 在单元测试中有覆盖，但生产代码 `src/main/index.ts` 目前直接使用同步 `check_single_instance_lock` 与 `whenReady` 守卫分支，未直接调用该高阶包装；此现象不影响正确性与行为一致性，后续主进程启动流重构时可考虑整合。
- 总体判断：代码实现完全符合 AC-001 ~ AC-010 全部 10 项验收标准及审阅采纳项，单实例互斥、URL 协议拦截、CSP 加固、Cookie 安全校验、Windows 权限用户名防劫持与代理逻辑均正确落地，无阻断性缺陷。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。查证 `src/main/index.ts:184-189,224-227`、`src/main/bootstrap/single-instance.ts` 与 `tests/unit/main/single_instance.test.ts`，单实例锁失败时立即退出且后续初始化短路阻断。
- AC-002：`re_verified`。重跑测试 `tests/unit/main/window_manager.test.ts` 通过，查证 `src/main/window/window-manager.ts:254-275` 拦截外部 http(s) 导航并交由系统浏览器打开。
- AC-003：`re_verified`。重跑测试 `tests/unit/main/window_manager.test.ts` 通过，查证 `src/main/window/window-manager.ts:132-134` 仅放行 safe external 协议（`http:` / `https:`），拒绝危险协议。
- AC-004：`re_verified`。重跑测试 `tests/unit/main/security/csp.test.ts` 通过，查证 `src/main/security/csp.ts:23` 补充 `object-src 'none'; frame-ancestors 'none'; base-uri 'self'`。
- AC-005：`re_verified`。重跑测试 `tests/unit/shared/cookie.test.ts` 通过，查证 `src/shared/lib/cookie.ts` 对 8KB 长度上限与 CRLF 字符的校验，以及在 `src/main/index.ts:739` 与 `src/main/core/session/session-manager.ts:326` 的集成拦截。
- AC-006：`re_verified`。重跑测试 `tests/unit/main/vault_permissions.test.ts` 通过，查证 `src/main/core/vault/file-vault-backend.ts:42-55` 默认解析器锁定 `os.userInfo().username` 防御环境变量伪造，且通过安全参数数组调用 `execFile`。
- AC-007：`re_verified`。重跑测试 `tests/unit/main/core/config/auto-seed.test.ts:226-243` 通过，查证 `src/main/core/config/auto-seed.ts:75-80` 在 win32/darwin 下大小写不敏感匹配可执行文件路径。
- AC-008：`re_verified`。重跑测试 `tests/unit/main/core/config/auto-seed.test.ts:195-224` 通过，查证 `apply_auto_seed_and_migrate` 清除交互式认证空实例并递增 `schemaVersion` 至 2，且由 `src/main/index.ts:275-285` 事务提交。
- AC-009：`re_verified`。重跑测试 `tests/unit/config/secret_param_keys.test.ts:91-107` 通过，查证 `src/main/core/config/secret_param_keys.ts:21` 对 `oauth_pkce` 支持包含 `OAUTH_REFRESH_TOKEN`。
- AC-010：`re_verified`。重跑测试 `tests/unit/main/effective_proxy.test.ts` 通过，查证 `src/main/core/network/effective_proxy.ts` 对 SOCKS5 PAC 解析、合法代理 URL 校验以及设置禁用系统代理时的直连行为。

coverage = 10 / 10 (100%)

verdict: PASS
