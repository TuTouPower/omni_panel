# Task review t296（reviewer_focus: 通用）

- task：`t296_vault_bak_file_permissions`
- spec：`docs/tasks/t296_vault_bak_file_permissions/spec.md`
- diff_anchor：`af1710e3cb2fd4d22ea66aba3920885b5a2af467`
- target：`git diff af1710e3cb2fd4d22ea66aba3920885b5a2af467`
- round：1
- reviewed_at：2026-08-11 03:27 UTC+8

## Findings

### t296_gen_f001 - 范围声明「原子路径」未落地：`.bak` 仍为裸 `writeFile` 非原子写

- 严重度：minor
- 锚点：范围「vault `.bak` 写入走与主文件一致的原子路径 + `chmod 0o600` / `set_file_permissions`」；AC-001 满足，原子性无 AC 锚定
- 位置：`src/main/core/vault/file-vault-backend.ts:161-162`
- 问题：范围声明写「与主文件一致的原子路径 + chmod 0600 / set_file_permissions」，实现只补了权限硬化，`.bak` 写入仍是 `writeFile`（非原子），未走主文件的 `writeJsonAtomic` tmp+rename。这与范围措辞不一致。但 AC-001 仅约束权限（已满足并被测试验证），原子性不随 umask 放宽、不产生可观测缺陷（主文件先原子写、`.bak` 后写，崩溃时 `.bak` 截断只会 JSON.parse 失败落入既有 throw 路径，无数据丢失），且 AC-002「备份/恢复路径行为不变」反而支持维持现状。故按「实现合理但与 spec 描述不符」处置：非 blocking，不计 FAIL。
- 建议：若原子非必需，收紧 spec 范围措辞（去掉「原子路径」或注明 `.bak` 维持 best-effort 非原子）；若确实要求原子，改用 `writeFileAtomic`（config-store 已复用同源 helper，改动约一行）。

### t296_gen_f002 - task.md 新增实施小节后遗留孤立「无」占位行

- 严重度：minor
- 锚点：文档/配置一致性
- 位置：`docs/tasks/t296_vault_bak_file_permissions/task.md:39`
- 问题：diff 在「实施笔记」下新增了「## 根因 / ## 方案 / ## 验证记录」三个小节，但原来表示「无实施笔记」的占位行「无」未被删除，现悬于验证记录之后（`task.md:39`），与「已写实施笔记」矛盾，易误读为仍无记录。
- 建议：删除该孤立「无」行。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 本轮新发现：2 条（均 minor）
- 未进表的提示（特别核对项分析，均已排除）：
    - **win32 icacls 分支**：`.bak` 现走 `set_file_permissions`，win32 下为 `icacls /inheritance:r /grant:r ${username}:F`，与主文件、`vault.key` 既有路径完全一致，无行为分叉；测试 `if (process.platform === "win32") { return; }` 为 spec 可测试性声明明确授权的平台跳过（非条件弱化断言），合理。
    - **`set_file_permissions` try/catch 吞错与 AC-001**：不影响。`.bak` 与主文件权限硬化强度一致——主文件 `file-vault-backend.ts:156` 的 `set_file_permissions` 同样在函数内部吞错（仅 log），两者同为 best-effort；spec「方案」明确「原有 try/catch 保留（best-effort）」。AC-001 的可观测行为（真实文件 mode 0600）已由真实文件系统集成测试验证（GREEN，33 测试全过）。
    - **其它备份文件路径**：config `.bak`（`src/main/core/config/config-store.ts:325,393`、`src/main/cli/import-config.ts:109`）属 spec 非范围「其它备份文件（config .bak 等）权限」，不判；vault 域 `.bak` 唯一写路径即 `write_vault`（`file-vault-backend.ts:161`），已硬化，无范围内涵盖缺口。
- 总体判断：实现正确、最小、覆盖 spec 范围；AC-001/AC-002 均满足；GREEN（33 测试）与 typecheck（0 错误）已实测复现。仅有 2 条 minor，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: ac78414912729763

## Round 2 (2026-08-11 03:30 UTC+8)

### 前轮 finding 复核（以 git diff 与文件现状为准，不采信处置表自称）

- **t296_gen_f001（minor，spec 范围措辞「原子路径」与实现冲突）— 已消除**。`docs/tasks/t296_vault_bak_file_permissions/spec.md:11` 现为「vault `.bak` 写入后执行与主文件一致的 `chmod 0o600` / `set_file_permissions` 权限硬化」，删去「原子路径」表述，与实现（裸 `writeFile` + `set_file_permissions`，非原子）完全一致。按「实现合理但与 spec 描述不符」的处置路径，改 spec 即闭合。
- **t296_gen_f002（minor，task.md 孤立「无」占位行）— 已消除**。`docs/tasks/t296_vault_bak_file_permissions/task.md` 现「## 验证记录」（33-37 行）后直接接「## Review 处置」（39 行），原遗留的孤立「无」行已删除。

### 本轮核实

- 实现代码与测试相对 Round 1 **未变**：`git diff af1710e3cb2fd4d22ea66aba3920885b5a2af467` 中 `src/main/core/vault/file-vault-backend.ts`（1 行新增）与 `tests/integration/vault/file-vault-backend.test.ts`（12 行新增）与 Round 1 逐字节一致。
- 新增文件：`spec.md` 单行措辞修改（f001 修复），task.md 占位行删除（f002 修复）；均不涉生产逻辑。
- vault 集成测试实测：**33 全过**（`vitest run tests/integration/vault/file-vault-backend.test.ts`）。
- scope 指纹实测 `14a9174886c2ec34`，与用户提供的新权威指纹一致，覆盖 Round 1 的 `ac78414912729763`。

### 本轮新发现

- 0 条。

### 结论

- 前轮 finding 复核：t296_gen_f001 已消除（spec 措辞修正）、t296_gen_f002 已消除（占位行删除）；均以 diff 证据核实。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：两处 minor 均已按既定处置路径闭合，无未解决 critical / important；实现与测试相对 Round 1 未动、测试仍全绿。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 14a9174886c2ec34

## Round 3 收尾文档同步 (2026-08-11 03:30 UTC+8)

### 本轮变更核实

- `docs/specs/secret-vault.md` 新增「备份文件权限（t296）」纯文档段：声明 `secrets.vault.bak` 写入后与主文件一致执行 `chmod 0600` / Windows `icacls` 硬化（`set_file_permissions`），不随 umask 放宽。内容与实现（`file-vault-backend.ts:162`）及 AC-001 语义一致，无逻辑/测试变更。
- `docs/specs_index.md` secret-vault 行标注加 `t296`、日期更新为 2026-08-11。与 `docs/specs_index.md` 收尾同步约定一致。
- 源码/测试相对前轮未变：`git diff af1710e3cb2fd4d22ea66aba3920885b5a2af467` 中 `src/main/core/vault/file-vault-backend.ts`（1 行）+ `tests/integration/vault/file-vault-backend.test.ts`（12 行）与 Round 1 一致，无新增逻辑。
- scope 指纹实测 `f8e2a5c12f1031e0`，与用户提供的新权威指纹一致，覆盖 Round 2 的 `14a9174886c2ec34`。

### 结论

- 前轮 finding 复核：t296_gen_f001 / f002 均已消除（见 Round 2），本轮无新增。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：收尾文档同步为纯文档变更，与实现一致；无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: f8e2a5c12f1031e0
