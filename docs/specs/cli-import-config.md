# CLI import-config 回滚边界与依赖

## 行为

- `--config <path>` 导入（`src/main/cli/import-config.ts`）：校验 → 提取明文 secret 转存 vault → 剥离 secret → 备份现有 config 到 `.bak` → 原子覆盖写 config.json。
- 回滚语义（config save 失败时）：只撤销本次导入的变更——本次**新建**的 vault key 删除；本次**覆盖**已有值的 key 恢复导入前旧值。重复导入同一 plugin/param 时，回滚不得误删导入前已存在的凭据。
- secret 参数值须为字符串才转存（schema 放行 string|number，明文 secret 语义下字符串才是凭据）。
- CLI 模式运行依赖 Electron GUI 运行时库；apt 安装清单（含 Ubuntu 24.04+/Debian 13+ 的 t64 过渡包名与旧发行版差异）见 `docs/guides/cli-mode.md`「Electron GUI 运行时依赖」。

## 验证

- 单测：`tests/unit/main/cli/import-config.test.ts`——正常导入剥离/转存、schema 校验失败、未知连接器路径、`.bak` 备份、save 失败回滚（新建删除 + 重复导入覆盖恢复旧值）。
- 黑盒：`pnpm test` 全量（CLI 导入属 main 进程单测覆盖）；CLI 真进程 e2e 见 `tests/e2e/electron/cli_serve.spec.ts`。
