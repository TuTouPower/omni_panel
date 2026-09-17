# Task review t500

- task：`t500_disable_cookie_encryption_fuse`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 改动（working tree）
- reviewer_focus：代码
- reviewed_at：2026-09-18 02:42 UTC+8

reviewed_scope: cb08912774922f0f

## Findings

Round 1 零 finding。

## 结论

### 7 视角体检
1. 安全：关掉 Chromium Cookie 磁盘钥匙串加密 fuse 符合项目「不做系统钥匙串/safeStorage，自管 Vault」的安全基线与领域模型约定；自管 Vault（`secrets.vault` / `vault.key`）零改动，未引入任何密钥泄露或降级风险。
2. 正确性：`electron-builder.yml` 与 `electron-builder.test.yml` 中的 `electronFuses.enableCookieEncryption` 均已严格改为 `false`，生产与测试构建配置保持对称。
3. 契约·Breaking：未触碰 `persist:session-login:*` 分区逻辑、未触碰 `mac_sign_identity()` 签名逻辑、未改动 Vault 数据流，完全符合 spec 非范围界限。
4. 性能·资源：打包版启动时消除主线程阻塞在 `SecItemCopyMatching` 钥匙串系统调用的性能瓶颈。
5. 架构·可维护性：消除 Chromium 对系统钥匙串隐式依赖与历史遗留冲突，配置整洁。
6. 健壮性·可观测：构建配置由自动化测试机械断言锁定，防止后续配置合并回滚。
7. 测试·规格：AC-001、AC-002 完整兑现，代码质量符合 ESLint 与 TypeScript 门禁要求。

### AC 复验方式
- AC-001：`re_verified`。查验 `electron-builder.yml` 与 `electron-builder.test.yml`，两处 `electronFuses.enableCookieEncryption` 均为 `false`。
- AC-002：`re_verified`。查验 `tests/unit/electron_builder_fuses.test.ts`，验证断言逻辑已对两份 yml 机械锁定，并在 `true` 时明确报错。
- AC-003：`re_verified`。查验 `src/main/core/session/session-manager.ts` 与 `tests/unit/session/session-manager.test.ts`，持久化 session partition `persist:session-login:*` 读写路径完全保留且测试通过。
- AC-004：`trust_prior`。`[deploy]` 项，根据用户干扰分级不执行真实打包与窗口启动，交付手手册由用户本机验证。

coverage = 3 / 4 (75.0%)

**通过（PASS）。** 代码改动精准聚焦，无未处置 blocker。

verdict: PASS
