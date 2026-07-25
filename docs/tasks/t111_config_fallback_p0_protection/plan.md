# Task plan

## 步骤与验证

1. 改 `config-store.ts` `load()` 的 ENOENT / 空文件分支 → 验证：`tests/unit/main/core/config/config-store.test.ts` 红→绿（空文件抛错、目录存在但文件缺失抛错、目录不存在返回 defaults）。
2. 改 `write-json.ts` `writeJsonAtomic` 与 `writeBakAtomic` 加 `fsync` → 验证：单测模拟中断后 tmp 文件无 null padding。
3. `pnpm test` 全绿 + `pnpm typecheck` 通过 → 验证：CI 命令。

## 风险与回退

- 风险：区分「首次启动」与「config 被删」的逻辑在跨平台路径处理上可能有边缘 case（如符号链接、相对路径）。 → 回退：用 `fs.realpath` 标准化路径后再判断；若仍有问题，改为检查 `configPath` 的父目录是否存在而非 `dirname` 字符串。
- 风险：`fsync` 在 Windows 上行为与 POSIX 不同，可能引入性能回归。 → 回退：仅在 POSIX 平台 `fsync`，Windows 用 `FlushFileBuffers` 等价物；若测试失败，回退到「先写 tmp 再 rename」原实现。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「配置存储」小节补一句「config-store 的 ENOENT / 空文件分支与 schema 失败分支同样走 P0 保护，不 fallback defaults」。
