# Task spec

## 背景

打包版 OmniPanel 每次启动都会弹 macOS 钥匙串密码（常见两次），主线程在打日志之前堵在 `SecItemCopyMatching`。业务代码没有 `safeStorage`，密钥走自管 Vault。弹窗来自 `electronFuses.enableCookieEncryption: true`：Chromium OSCrypt 启动时强制访问钥匙串条目 `OmniPanel Safe Storage`。产品约定本来就是不做系统钥匙串。p245 换成自签证书只固定了 codesign DR，OSCrypt 照样每次访问；p248 被误归档且零行 fuse 代码。用户要求删掉这层 Cookie 钥匙串加密。

## 契约区

### 范围

- 关闭生产与测试打包配置里的 Chromium Cookie 磁盘加密 fuse：`electron-builder.yml`、`electron-builder.test.yml` 的 `electronFuses.enableCookieEncryption` 均为 `false`。
- 补构建配置断言，防止再被改回 `true`。
- 说明关加密后：连接器 Vault 凭据不受影响；Chromium 持久化 partition（`persist:session-login:*`）仍可读写 Cookie，只是磁盘不再用钥匙串加密。

### 非范围

- 不删除 cookie 登录、静默刷新、`persist:session-login:*` partition。
- 不改 Vault / `secrets.vault` / `vault.key`。
- 不改 codesign 身份、`scripts/package-and-run.ts` 的 `mac_sign_identity()`、本机 `OmniPanel Local Dev` 证书。
- 不要求 CI 弹出或点击 macOS 钥匙串对话框。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`electron-builder.yml` 与 `electron-builder.test.yml` 中 `electronFuses.enableCookieEncryption` 均为 `false`。
- [ ] AC-002：自动化测试读取上述两份打包配置，断言 `enableCookieEncryption` 为 `false`；将其改回 `true` 时该测试失败。
- [ ] AC-003：cookie 登录所用持久化 session partition 的读写路径仍存在且可被现有 cookie 登录 / 静默刷新测试覆盖，不因关闭 fuse 被删除。
- [ ] AC-004：`[deploy]` 关闭 fuse 并重新打包后，冷启动 `OmniPanel.app` 不再弹出访问 `OmniPanel Safe Storage` 的钥匙串密码框。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：可自动测试（读 yml）。
- AC-002：可自动测试。
- AC-003：可自动测试（现有 auth/cookie 单测或集成测；若缺口则补断言「partition 与 cookie get/set 仍被调用」）。
- AC-004：不可自动测试。须本机打包冷启动；agent 默认不跑 `pnpm package`/`reload`。

## 上下文区

- 来源：p249（2026-09-18 核实：`enableCookieEncryption: true`；业务无 `safeStorage`；钥匙串条目 `OmniPanel Safe Storage`；p248 于 8d7c5d1e 误归档）

### 有意不测

- 关 fuse 后旧加密 Cookie 文件能否被 Chromium 读出：一次性迁移细节，本机 `[deploy]` 时若静默续期失败则重新 cookie 登录；不写自动化。
- 钥匙串 ACL / 自签证书信任：本 task 不再走证书路线。

### 测试策略

- 解析 `electron-builder.yml` 与 `electron-builder.test.yml`（或 electron-builder 实际消费的配置），断言 fuse 为 false。
- 不启动打包 App、不 mock 钥匙串。
- cookie 登录相关测试保持绿灯，证明未误删 partition。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：已有 userData 里加密过的 Chromium Cookie 库可能读失败，个别网站登录 session 要再 cookie 登录一次。Vault 内已抽出的 `SESSION_COOKIE` / API key 不受影响。
- 回退：把两处 fuse 改回 `true` 并重打包。

### 依赖与约束

- 无代码依赖。`[deploy]` 须用户许可后才能 `pnpm package`。
- 与 domain / secret-vault「不做系统钥匙串」一致，不新增 ADR。

### Finalization 时更新的 blueprint

- 无（约定已写在 `docs/blueprint/domain.md` 与 `docs/specs/secret-vault.md`）
