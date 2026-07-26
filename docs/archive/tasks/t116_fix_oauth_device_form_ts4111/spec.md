# Task spec

## 背景

t112 收尾后 `oauth_device_form.test.tsx` 遗留 3 处 TS4111（`secrets.OAUTH_TOKEN` 等 index signature 属性用 dot 访问）。`pnpm typecheck` 报 3 错，阻塞严格类型检查。

## 范围

- 改 `tests/unit/renderer/components/forms/oauth_device_form.test.tsx`：`saved_params.secrets.OAUTH_TOKEN` / `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT` 三处 dot 访问改 bracket（`secrets["OAUTH_TOKEN"]`）。

## 非范围

- 不动其他文件。
- 不改 AddAccountParams.secrets 类型（保持 `Record<string, string>`）。

## 验收标准

- [ ] `pnpm typecheck` 中 oauth_device_form.test.tsx 的 3 处 TS4111 消失。
- [ ] `pnpm test` 全绿（该文件 7 用例不回归）。
- [ ] 改动仅限该测试文件。

## 依赖与约束

- 无前置。
