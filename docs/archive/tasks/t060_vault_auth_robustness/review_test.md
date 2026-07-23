# Task review t060（reviewer_focus: 测试）

- task：`t060_vault_auth_robustness`
- spec：`docs\tasks\t060_vault_auth_robustness\spec.md`
- diff_anchor：`deedfbd2a60efb5c2f35e3c70aa4be6651525680`
- target：`git diff deedfbd2a60efb5c2f35e3c70aa4be6651525680`
- round：1
- reviewed_at：2026-07-23 00:00 UTC+8

## Findings

无 finding。

## AC 覆盖核对

- **AC1**「vault key 文件损坏（长度不对）时 throw，不覆盖、不丢密钥」：`tests/integration/vault/file-vault-backend.test.ts:203-209` 在 `beforeEach` 已生成 32 字节 `vault.key` 的前提下，覆写为 10 字节，断言 `create_file_vault_backend(temp_dir)` reject 并 throw `"Invalid vault key length"`。实现层（`src/main/core/vault/file-vault-backend.ts:67-80`）catch 仅吞 ENOENT，长度异常路径在任何 `writeFile` 之前 throw，故 throw 本身白盒等价于「不覆盖、不丢密钥」。覆盖成立。
- **AC2**「is_auth_error 对 'unexpected token' / 'token pool exhausted' 返回 false」：`tests/integration/scheduler/refresh-service.test.ts:24-27` 两条断言精确覆盖。覆盖成立。
- **AC3**「is_auth_error 对 401 / unauthorized / invalid_token 返回 true」：`tests/integration/scheduler/refresh-service.test.ts:17-22` 四条断言（含 `credential`）。覆盖成立。
- **AC4**「单测覆盖两路径」：vault 损坏 key + is_auth_error 单元测试，两条路径均有测试。覆盖成立。

## 危险模式扫描

逐项扫描，均未命中：

- 恒真断言 / 纯存在性断言：无（全部 `toBe(true/false)` 或 `.rejects.toThrow(msg)`）。
- 删除/反转 expect、注释掉断言、弱化断言（`toContain`/正则/`>=`/`toBeTruthy`/`toMatchObject`）：无。
- 删测试块：无（纯新增）。
- `.skip` / `.only` / `pytest.mark.skip` / `@Ignore`：无。
- 静默错误（`eslint-disable` / `@ts-ignore` / `# type: ignore` / `@SuppressWarnings`）：无。
- mock 误用：无 mock；vault 测试用真实 `mkdtemp` + `fs/promises`，is_auth_error 是纯函数无依赖。
- 阈值掩盖：无。
- 条件跳过弱化断言：无。
- 程序赋值替代真实交互：不适用（非 UI 测试）。
- 存在即通过：无。

## 测试可信

- **测的是 AC 还是 mock**：vault 测试走真实文件系统；is_auth_error 直接 import 纯函数。均测真实行为。
- **断言用户可观察**：throw 消息 / 布尔返回值，均为可观察接口。
- **异步时序**：`rejects.toThrow` 正确等待 Promise；无漏 await；无 race。
- **mock 边界**：仅在外部依赖（fs）上操作，未 mock 自家模块。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：测试精确覆盖 spec 四条 AC，无危险模式，断言强度适当。

### 次要增强建议（非 finding，不进处置表）

1. `file-vault-backend.test.ts:203` 可在 `rejects.toThrow` 后追加 `await readFile(join(temp_dir, "vault.key"))` 断言仍为 `Buffer.alloc(10)`，显式验证「不覆盖」副词，防未来回归（如在 throw 前误加 writeFile）。
2. `refresh-service.ts:60` 实现新增 `invalid_grant` 分支，测试未覆盖（AC3 未列；属代码层范畴，code reviewer 可决定是否要求补测）。

verdict: PASS
