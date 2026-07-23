# Task review t060（reviewer_focus: 代码）

- task：`t060_vault_auth_robustness`
- spec：`docs\tasks\t060_vault_auth_robustness\spec.md`
- diff_anchor：`deedfbd2a60efb5c2f35e3c70aa4be6651525680`
- target：`git diff deedfbd2a60efb5c2f35e3c70aa4be6651525680`
- round：1
- reviewed_at：2026-07-24 03:21 UTC+8

## Findings

### t060_code_f001 - vault key 损坏报错指向不存在的 `.bak`，AC「强制从 `.bak` 恢复」无法落地

- 严重度：important
- 位置：`src/main/core/vault/file-vault-backend.ts:79`
- 问题：损坏分支抛出的错误信息为 `... restore from ${key_path}.bak`，但代码中**从未为 `key_path` 创建 `.bak`**。全仓 grep 确认：
    - `write_vault`（`:144-157`）只对 `vault_path`（vault 数据文件 JSON）写 `.bak`；
    - `config-store.ts:226/251` 只对 `configPath` 写 `.bak`；
    - `ensure_master_key` 在 `:84-87` 生成新 key 时仅 `writeFile(key_path, key)` + `set_file_permissions`，没有任何 `key_path.bak` 写入逻辑。
      结果：master key 文件被截断/部分写入时，新代码确实「throw 不覆盖」（满足 AC 前半），但信息里指给用户/运维的恢复源 `key_path.bak` 在任何运行路径下都不存在。spec 范围明确写「强制从 `.bak` 恢复」，AC 隐含该 `.bak` 必须可得；当前实现把「强制恢复」降级成「抛一个无法执行的恢复指引」，用户按提示去找 `.bak` 会扑空，实质等同于无指引。
- 建议：二选一，避免误导：
    1. 落地真正的 key `.bak`：在 `:86` `writeFile(key_path, key)` 之后追加 `await writeFile(`${key_path}.bak`, key)`（与 vault 数据文件 `.bak` 写入时机对称：key 写主文件成功后再刷 `.bak`），损坏分支里先尝试 `readFile(`${key_path}.bak`)`，长度为 32 则用 `.bak` 恢复主文件后返回，否则才抛错；
    2. 或修正错误信息，不引用不存在的 `.bak`：例如 `Key file may be corrupted; restore from OS-level backup or contact support to reset vault (all encrypted entries will be lost).`

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条（important）。
- 范围外提示（不进 finding 表）：
    - `refresh-service.ts:54-63` `is_auth_error` 新增 `invalid_grant` 不在 spec 范围枚举「仅 401 / unauthorized / invalid_token / www-authenticate」中。该词是 RFC 6749 §5.2 标准 OAuth auth 错误码，与 spec「移除宽泛 `token`、聚焦真实 auth 错误」的意图一致，且 AC 测试用例全部通过，倾向接受；如需严格对齐 spec 字面，可删 `invalid_grant` 或在 spec 范围补一行说明。
    - `file-vault-backend.ts` 211 行、`refresh-service.ts` 450 行（task 净增 +1 行），后者刚过 400 行 minor 阈值但本 task 贡献极小，不单列文件膨胀 finding。
- 总体判断：vault 损坏路径 throw 已实现、覆盖旧 bug 已修；`is_auth_error` 收窄正确。但损坏分支的恢复指引指向不存在的 `.bak`，违反 spec「强制从 `.bak` 恢复」的承诺，需补 `.bak` 写入逻辑或改写错误信息。

verdict: FAIL

## Round 2 (2026-07-24 04:18 UTC+8)

### 前轮 finding 复核

- `t060_code_f001`（important）：**已修**。`src/main/core/vault/file-vault-backend.ts:79` 错误信息改为 `... delete it to regenerate (will lose encrypted secrets) or restore from your external backup.`，不再引用不存在的 `key_path.bak`。全仓 grep 确认 master key 无 `.bak` 写入路径，新表述对应 R1 reviewer 提供的 option 2，不误导用户/运维。AC「throw，不覆盖、不丢密钥」满足。

### 本轮新发现

无。

### 本轮扫描范围说明

- `ensure_master_key`（`file-vault-backend.ts:66-90`）：`exists` 标志区分 ENOENT 与 length 异常，catch 仅吞 ENOENT，无 swallowed error；损坏分支显式 throw，控制流清晰。
- TOCTOU 窗口（`access` 与 `readFile` 之间文件被删）理论存在，但范围限定在应用私有 user_data 目录，失败模式为显式 throw（可由用户手动删除 key 文件恢复），与 AC「不覆盖」一致，不单列 finding。
- `refresh-service.ts:56-63` 本轮未改动，R1 已收窄（`invalid_token` / `invalid_grant` / `credential`），无回归。

### 结论

- 前轮 finding：1 条，已修 1 条。
- 本轮新发现：0 条。
- 总体判断：R1 唯一 finding 已按 option 2 修复到位，错误信息不再指向不存在的 `.bak`；本轮无新问题。

verdict: PASS
