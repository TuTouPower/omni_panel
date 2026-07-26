# Task plan

## 步骤与验证

1. 把 `MAX_LOG_FILE_BYTES` 与段数上限提为 `initLogging` 可注入参数（默认 50MB / 10 段），便于单测驱动 → 验证：现有 logging 测试不红。
2. 写入链上加轮转：`stat` 超限时 `rename(logFile, segmentPath(N))`，N 递增；段数达上限才停写 + warn → 验证：新单测（注入 1KB 上限，写超量后断言段文件存在、当前段继续增长）。
3. 核对 `cleanupOldLogs` 对段文件的清理；核对 `exportCurrentLog` 行为并在 spec/代码注释写明语义 → 验证：清理单测覆盖段文件。
4. TDD：先写失败测试（轮转不存在时断言段文件生成必失败）再实现。
5. 黑盒：`pnpm test`；如有打包验证需求按 `docs/guides/testing.md` 执行。

## 风险与回退

- 风险：rename 与 append 并发竞态——必须复用 `pending_write` 串行链。
- 风险：Windows 上 rename 被占用文件失败——当前 appendFile 即开即关，占用窗口极小；catch 后降级为继续写原文件并 warn。
- 回退：`git revert` 本 task commit。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`「日志」小节：50MB 上限语义从「静默停写」改为「分段轮转 + 段数上限」。
