# Live API Contract Tests（历史说明）

本目录曾存放打真实上游的连接器契约测试。**当前无 live 用例**，目录仅剩本 README。

## 历史

|阶段|commit|说明|
|---|---|---|
|引入|`b7368050`（2026-05-30）|`tests/contract_live/plugins.live.test.ts`：对真实上游握手，只断言响应形状（退出码 0、`updatedAt` 为合法 ISO 8601、`items` 数组及 `id`/`name`/`used`/`limit`/`displayStyle`/`status` 字段），不断言具体数值；凭据未设则跳过不失败。|
|移除|`baaeb5dd`（2026-06-13，`refactor: remove legacy plugin runtime`）|删除该测试文件，随旧 plugin 运行时一并移除。|

凭据与插件清单等原始说明见 `git show baaeb5dd^:tests/contract_live/README.md`。

## 现状

- 无匹配测试文件：`pnpm test:contract:live`（`vitest run --config vitest.contract_live.config.mts`）当前以退出码 1 结束（no test files found）。
- 脚本与 `vitest.contract_live.config.mts` **保留**，因删除会留下失效引用：`package.json` `test:full` 直接调用该脚本；`vitest.config.mts` 以 `exclude: ["**/contract_live/**"]` 排除本目录；`docs/blueprint/testing.md`（用户干扰分级表）与 `AGENTS.md`（须许可命令清单）仍以命令名提及它。
- 主套件不受影响：`pnpm test` 走 `vitest.config.mts`，不含 live 契约。

## 原验证职责的当前承担

- 响应形状/字段契约：由 mock 上游的 `tests/integration/connector/*.test.ts` 与 zod schema 校验（`src/shared/schemas/`、`tests/unit/schemas/`、导出的 `schemas/*.schema.json`）覆盖。
- 真实上游握手：**当前无自动化覆盖**，按需人工验证；`pnpm test` 不触达真实上游。
