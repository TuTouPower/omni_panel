# Task spec

## 背景

review_20260726_054747 采纳项 13、32：vault `.bak` 未走主文件权限收紧；scrubber 唯一注册点是 vault `get` 注册明文，`set`/`delete` 从不 `unregister`，OAuth token 轮换持续累积逼近 10000 上限。

## 范围

- `.bak` 写入指定 `mode: 0o600`，写后 `set_file_permissions(backup_path)`；补权限与 POSIX mode 测试。
- `set` 覆盖已有 key 前先取旧值 `scrubber.unregister(旧明文)`；`delete` 同样清退。
- `logger.ts` `register` 首次达上限时输出一次不含敏感值的 warning。
- 补测试：轮换 N 次后注册值有界；`delete` 后旧值不驻留。

## 非范围

- 不改 vault 加密格式；不做 fail closed。

## 验收标准

- [ ] `.bak` 权限与主 vault 一致（POSIX 0600，Windows ACL 收紧）。
- [ ] `set` 覆盖/`delete` 后旧明文从 scrubber 移除。
- [ ] 轮换 N 次后注册值有界，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- TDD。
