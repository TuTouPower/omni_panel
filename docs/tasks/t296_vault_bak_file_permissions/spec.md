# Task spec

## 背景

来源：Grok 全仓评审（2026-08-11）Issue 5。`src/main/core/vault/file-vault-backend.ts` 主 vault 文件写入带 `chmod: 0o600` 与 `set_file_permissions`；`.bak` 副本用裸 `writeFile`（无 mode/ACL 硬化），多用户 Unix 下备份密文（及恢复路径）依 umask 可能 world-readable，弱于主文件。

## 契约区

### 范围

- vault `.bak` 写入走与主文件一致的原子路径 + `chmod 0o600` / `set_file_permissions`

### 非范围

- 主 vault 文件现有硬化逻辑调整
- 其它备份文件（config .bak 等）权限

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：vault `.bak` 文件权限为 0600（或等价 user-only），不随 umask 放宽
- [ ] AC-002：备份/恢复路径行为不变（既有 vault 测试全绿）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测断言 .bak 生成后 stat mode 0600；非 Windows 平台执行（Windows 无 POSIX mode，跳过或按平台分支）。

## 上下文区

- 来源：Grok 全仓评审 Issue 5（file-vault-backend.ts:161）

### 测试策略

- 单测：vault 备份路径触发后 stat `.bak` mode 断言 0600
