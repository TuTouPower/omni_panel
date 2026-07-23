# Task spec

## 背景

review_20260723_opus：I1（`src/main/core/vault/file-vault-backend.ts:66-80`）`ensure_master_key` 中显式 `throw new Error("Invalid vault key length")` 被同一 `catch {}`（`:73`）捕获，与 ENOENT 走同一分支生成新 key 覆盖旧文件；`vault.key` 被截断/部分写入（磁盘满、异常关机）时所有旧密文永久不可解密，用户密钥静默丢失。I2（`src/main/core/scheduler/refresh-service.ts:54-62`）`is_auth_error` 的 `lower.includes("token")` 命中任何含 "token" 的错误（JSON "unexpected token"、"token pool exhausted"），触发非必要交互式 re-login 窗口（`:349-370`）。

## 范围

- vault：`ensure_master_key` catch 区分 ENOENT 与显式 throw（Invalid vault key length）；key 文件存在但长度不对时报错不覆盖，强制从 `.bak` 恢复。
- is_auth_error：仅 HTTP 401 / `unauthorized` / `invalid_token` / `www-authenticate` 响应头触发；移除宽泛 `includes("token")`。

## 非范围

- 不改 vault 加密体系（GCM + atomic + .bak + mutex 保留）。
- 不改 re-login 窗口本身（仅修正触发条件）。

## 验收标准

- [ ] vault key 文件损坏（长度不对）时 throw，不覆盖、不丢密钥。
- [ ] is_auth_error 对 "unexpected token" / "token pool exhausted" 返回 false。
- [ ] is_auth_error 对 401 / unauthorized / invalid_token 返回 true。
- [ ] 单测覆盖两路径。

## 依赖与约束

- 无外部依赖。
