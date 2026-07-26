# Task spec

## 背景

review_20260726_054747 采纳项 17、18：web `session.login/refresh` 返回 `{ok,error}` 与 `SessionLoginResult` 契约不符；`usageboard-web.ts` 双重强转掩盖 `connector.catalog`、`config.createInstance`、`settings.openConnectorsDir`、`kimi`、`buildInfo` 等成员缺失与部分返回类型错误。

## 范围

- `session.login/refresh` 返回 `{ saved: false }`；补严格契约测试。
- `api` 直接标注 `UsageboardApi`，删 `as unknown as UsageboardApi`；补齐缺失成员 stub、修正 Promise/void 返回契约、`get_json` 加泛型、`log` 参数改 `RendererLogPayload`。
- 增加 web API 契约测试，验证新增成员不抛 `TypeError`。

## 非范围

- 不改 web UI 行为；`config.duplicate` 已存在不动。

## 验收标准

- [ ] web session stub 返回 `{ saved: false }`。
- [ ] `api` 无双重强转，编译期可发现成员缺失。
- [ ] web API 契约测试通过；`pnpm test` 通过。

## 依赖与约束

- TDD。
