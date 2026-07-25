# Task review t111（reviewer_focus: 代码）

- task：`t111_config_fallback_p0_protection`
- spec：`docs\tasks\t111_config_fallback_p0_protection/spec.md`
- diff_anchor：`a85a965e34fd05c772d16ffc2bcca2b546be854e`
- target：`git diff a85a965e34fd05c772d16ffc2bcca2b546be854e`
- round：1
- reviewed_at：2026-07-25 23:07 UTC+8

## Findings

### t111_code_f001 - 空/仅空白 config 文件未先尝试 .bak 恢复，可能覆盖有效备份

- 严重度：important
- 位置：`src/main/core/config/config-store.ts:148-152`、`src/main/core/config/config-store.ts:280-282`
- 问题：当主 `config.json` 为空或仅含空白字符时，line 148-152 直接抛出 `SyntaxError`，跳过了 schema 不匹配 corrupt 路径中「先尝试从 `.bak` 恢复」的逻辑。进入外层 catch 后，line 280-282 会再次读取主文件并将其内容写入 `.bak`。对于仅空白字符的文件，`raw` 为真值，因此会直接覆盖可能仍然有效的 `.bak`，使用户失去最后一次可用备份；即使对于空文件，`raw` 为假值不会覆盖，也同样丧失了从 `.bak` 恢复的机会。这与 spec 中「空文件 / 仅空白字符：视为损坏，走『备份损坏文件后抛错』路径」的要求不等价。
- 建议：将空/空白文件纳入与 schema 不匹配相同的 corrupt 处理路径：先尝试读取并验证 `.bak`，仅在 `.bak` 不可恢复时再把损坏的主文件备份到 `.bak`，最后抛错。

### t111_code_f002 - `writeFileAtomic` 在 `handle.sync()` 抛错时未关闭文件句柄

- 严重度：minor
- 位置：`src/main/core/storage/write-json.ts:19-26`
- 问题：`writeFileAtomic` line 22 打开 `.tmp` 文件句柄后，line 23 调用 `handle.sync()`，line 24 才调用 `handle.close()`。若 `sync()` 抛出异常，`close()` 不会执行，导致 `FileHandle` 泄漏；在 Windows 上可能长期占用 `.tmp` 文件句柄，影响后续清理或重试。
- 建议：使用 `try/finally` 确保 `handle.close()` 在任何情况下都被调用。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：2 条（t111_code_f001、t111_code_f002）
- 总体判断：ENOENT/首次启动/空文件的 P0 保护主体已实现，但空/空白文件 corrupt 路径未复用 `.bak` 恢复逻辑，可能在最不该丢备份的场景下覆盖 `.bak`；文件句柄关闭也缺少异常保护。本轮不能 PASS。

verdict: FAIL

## Round 2 (2026-07-25 23:13 UTC+8)

- 当前轮次：2
- 前轮 finding 复核：
    - `t111_code_f001`（空/仅空白 config 文件未先尝试 .bak 恢复）：已修。`config-store.ts:148-150` 将空/仅空白主文件强制产生 `null` 以走 schema 失败路径，先尝试 `.bak` 恢复（`config-store.ts:198-215`），且仅在 `raw.trim().length > 0` 时才备份主文件（`config-store.ts:234`），不再覆盖可能有效的 `.bak`。
    - `t111_code_f002`（`writeFileAtomic` 句柄泄漏）：已修。`write-json.ts:19-24` 用 `try/finally` 保证 `handle.close()` 在 `handle.sync()` 抛错时仍执行。
- 本轮新发现：0 条
- 总体判断：前轮问题已按 spec 意图修复，本轮扫描未引入新的代码层问题。

verdict: PASS
