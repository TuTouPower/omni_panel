# Task spec

## 背景

review_20260726_054747 采纳项 20：`logger.ts` 与 `config_redaction.ts` 各维护一套密钥名识别规则且覆盖不一致，新增命名只改一处会形成脱敏缺口。

## 范围

- 新建 `src/shared/lib/secret_key.ts` 导出 `is_secret_key_name(name)`，取两套规则并集（含 `api_key`/`token`/`refresh_token`/`password`/`passwd`/`cookie`/`authorization`/`credential`/`session`/`private_key`/`certificate`/`passphrase`/`access_key`/`secret_key`），保留单词与 `_`/`-` 边界。
- `logger.ts:redact_secret_keys`、`config_redaction.ts:redact_parameter_values` 均改调该函数，删各自 pattern。
- 补共享测试：上述密钥名均脱敏，普通字段不误判。

## 非范围

- 不改 scrubber 值注册逻辑（属 t137）。

## 验收标准

- [ ] 两处共用同一 `is_secret_key_name`。
- [ ] 密钥名并集全部脱敏，普通字段不误判，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 与 t137 同改 `logger.ts`，注意避免冲突。
