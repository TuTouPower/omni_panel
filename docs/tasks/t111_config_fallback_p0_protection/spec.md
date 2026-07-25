# Task spec

## 背景

`docs/bugs.md` 记录的「config 数据丢失：fallback 路径绕过 P0 保护，auto_seed 覆盖账号」根因链：

1. `writeBakAtomic` 在 `writeFile` 阶段进程被强杀，`config.json.bak` 的 tmp 只剩预分配 null 字节，rename 后变成纯 `\0` 文件。
2. 重启时主 `config.json` 解析失败，去读 `.bak` 也是 null 字节损坏。
3. `config-store.ts` 的 `load()` 在**主 + bak 都坏**时，只有 schema 解析失败路径才走「抛错、不 fallback、防 auto_seed 覆盖」的 P0 保护；而 ENOENT / 空文件分支直接 `return DEFAULT_CONFIGURATION`（空 plugins），**没抛错**。
4. `DEFAULT_CONFIGURATION` 空 plugins 触发 auto_seed，重新生成 connector（新 instanceId）写回 config.json，覆盖原账号。

当前代码（`config-store.ts:251-253`）：

```ts
if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    // config.json 不存在 = 首次启动，返回 defaults 合理（auto_seed 填内置 connector）
    return { ...DEFAULT_CONFIGURATION };
}
```

ENOENT 分支把「首次启动」与「config.json 被误删/移动」混为一谈，后者会触发 auto_seed 覆盖。

## 范围

- 改 `src/main/core/config/config-store.ts` `load()`：
    - **空文件 / 仅空白字符**：视为损坏，走「备份损坏文件后抛错」路径，不返回 defaults。
    - **ENOENT**：区分「首次启动」与「config 目录已存在但 config.json 缺失」：
        - 若 `dirname(configPath)` 不存在 → 首次启动，返回 `DEFAULT_CONFIGURATION`。
        - 若目录存在但 `config.json` 缺失 → 视为异常，抛错提示手动恢复，不 auto_seed。
- 改 `src/main/core/storage/write-json.ts`：
    - `writeJsonAtomic` 在 `writeFile` 前 `fsync` 目录，确保 tmp 文件元数据落盘后再 rename（防强杀留 null padding）。
    - `writeBakAtomic` 同步修改（复用同一实现）。
- 补单测：`tests/unit/main/core/config/config-store.test.ts` 覆盖：
    - 空文件 → 抛错，不返回 defaults。
    - 目录存在但 config.json 缺失 → 抛错，不 auto_seed。
    - 目录不存在 → 返回 defaults（首次启动）。
    - writeJsonAtomic 中断后 tmp 文件无 null padding。

## 非范围

- 不改 auto_seed 本身逻辑（t038 tombstone 已处理复活问题）。
- 不改 secrets.vault 恢复流程（已手动完成）。

## 验收标准

- [ ] 空 config.json 启动时抛错，不触发 auto_seed。
- [ ] config 目录存在但 config.json 缺失时抛错，不触发 auto_seed。
- [ ] 全新安装（目录不存在）正常返回 defaults 并 auto_seed。
- [ ] `writeJsonAtomic` 中断后无 null padding。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 无前置 task。
- 需验证 Windows / macOS / Linux 三平台 `fsync` 行为一致。
