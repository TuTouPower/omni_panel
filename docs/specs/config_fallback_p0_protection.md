# 配置存储损坏 fallback 的 P0 保护（config_fallback_p0_protection）

## 背景

`docs/bugs.md` 记录的「config 数据丢失：fallback 路径绕过 P0 保护，auto_seed 覆盖账号」根因链：

1. `writeBakAtomic` 在 `writeFile` 阶段进程被强杀，`config.json.bak` 的 tmp 只剩预分配 null 字节，rename 后变成纯 `\0` 文件。
2. 重启时主 `config.json` 解析失败，去读 `.bak` 也是 null 字节损坏。
3. `config-store.ts` 的 `load()` 在**主 + bak 都坏**时，只有 schema 解析失败路径才走「抛错、不 fallback、防 auto_seed 覆盖」的 P0 保护；而 ENOENT / 空文件分支直接 `return DEFAULT_CONFIGURATION`（空 plugins），**没抛错**。
4. `DEFAULT_CONFIGURATION` 空 plugins 触发 auto_seed，重新生成 connector（新 instanceId）写回 config.json，覆盖原账号。

## 范围

- 改 `src/main/core/config/config-store.ts` `load()`：
    - **空文件 / 仅空白字符**：视为损坏，走「先尝试 `.bak` 恢复，否则抛错」路径，不返回 defaults；空/空白主文件不覆盖可能有效的 `.bak`。
    - **ENOENT**：区分「首次启动」与「config 目录已存在但 config.json 缺失」：
        - 若 `dirname(configPath)` 不存在 → 首次启动，返回 `DEFAULT_CONFIGURATION`。
        - 若目录存在但 `config.json` 缺失 → 视为异常，抛错提示手动恢复，不 auto_seed。
- 改 `src/main/core/storage/write-json.ts`：
    - `writeFileAtomic` 先写 `.tmp`，`fsync` 落盘并关闭句柄后再 `rename`，防强杀中断致目标文件留 null padding。
    - 句柄关闭放在 `try/finally`，确保 `fsync` 抛错时也不泄漏 `FileHandle`。
    - `writeBakAtomic` 复用 `writeFileAtomic`。
- 补测试覆盖：
    - 集成测试 `tests/integration/config/config-store.test.ts`：空文件 → 抛错；目录存在但 config.json 缺失 → 抛错；目录不存在 → 返回 defaults；writeJsonAtomic 正常写入结果无 null padding。
    - 单元测试 `tests/unit/core/storage/write-json.test.ts`：mock `node:fs/promises`，校验 `open → sync → close → rename` 时序，以及 `sync` 抛错时句柄仍被关闭。

## 非范围

- 不改 auto_seed 本身逻辑（t038 tombstone 已处理复活问题）。
- 不改 secrets.vault 恢复流程（已手动完成）。

## 验收标准

- [x] 空 config.json 启动时抛错，不触发 auto_seed。
- [x] config 目录存在但 config.json 缺失时抛错，不触发 auto_seed。
- [x] 全新安装（目录不存在）正常返回 defaults 并 auto_seed。
- [x] `writeJsonAtomic` 中断后无 null padding。
- [x] `pnpm test` 全绿。

## 依赖与约束

- 无前置 task。
- 需验证 Windows / macOS / Linux 三平台 `fsync` 行为一致。
