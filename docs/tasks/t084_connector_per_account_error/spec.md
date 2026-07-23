# Task spec

## 背景

多账号 connector（CPA 逐 auth_file）某账号失败时 throw 整体 failed，不调 ctx.report_failed_account + continue。t059 仅修空响应，本 task 扩展到 per-account catch。

## 范围

- CPA connector per-auth_file catch -> report_failed_account + continue；其他 connector throw 前检查是否可降级为 report。单测覆盖混合成功/失败场景。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] CPA connector 单个 auth_file 失败时调 `ctx.report_failed_account` 并继续处理其余账号，不再整体 throw。
- [ ] 单测覆盖混合成功/失败场景：成功账号正常发行 observation，失败账号进入 failed_accounts 且不影响成功账号。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖。
