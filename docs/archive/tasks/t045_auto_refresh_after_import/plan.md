# Task plan

## 步骤与验证

1. 新增专用回调：`ConfigIpcDeps` 加 `onConfigImported?: (config: AppConfiguration) => void`（与 `onConfigSaved` 并列，不复用，避免污染 save/duplicate 路径） → 验证：读 `src/main/ipc/config-ipc.ts` 改动，类型通过。

2. handleConfigImport 成功路径调用：在 `handleConfigImport` 成功返回前（`config-ipc.ts:392` `onConfigSaved` 之后、`return ok({ imported: true })` 之前）调用 `deps.onConfigImported?.(parsed.data)`。**仅在成功路径**，取消/校验失败/secrets 回滚 throw 均不触达 → 验证：单测三态（成功调 1 次、取消/失败调 0 次）。

3. main 注册：`src/main/index.ts` 构造 `registerConfigIpc` 的 deps 时，新增 `onConfigImported` → 调 `refreshService.refreshAll()`（fire-and-forget，`.catch(log.error)`，仿 `TRAY_REFRESH_ALL` 写法 `index.ts:709-715`）。local-api 的 `config_deps` 同步加 → 验证：导入后日志见 `Refreshing all N enabled connectors` + 各 connector refreshed。

4. 时序确认：`onConfigSaved`（同步 rebuild 注册 connector runtime）先于 `onConfigImported`（refreshAll）。`refreshAll` 内部 `configStore.load()` 读到 import 后的 config、`refresh(instanceId)` 能定位已注册 runtime → 验证：读 `refresh-service.refreshAll` 与 rebuild 调用链；真机导入新账号确认刷到。

5. 测试：集成测试 mock `secretsStore`/`configStore`/`onConfigImported`，断言 import 成功触发 refreshAll、失败/取消不触发 → 验证：`pnpm test`。

6. 真机验证：开发态导入一份含新账号的配置，确认面板自动出现新账号、无需手动刷新 → 验证：手动观察 + 日志。

## 风险与回退

- 风险：`refreshAll` 并发刷新全部 connector 的瞬时开销与上游速率限制（tavily/firecrawl 等并发 `/usage`）；个别账号本次失败由下次周期自愈。`refreshAll` 已有并发=5 限流，可接受。
- 风险：rebuild 与 refreshAll 时序错位 → 新 connector 未注册刷不到。`onConfigSaved` 同步 rebuild 在前，`onConfigImported` 在后；若 rebuild 异步，改在 rebuild 完成回调里触发。
- 回退：若全局 refreshAll 开销过大，退化为只刷新本次导入新增的 connector（diff 前后 plugin instanceId 集合）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：config import → `onConfigSaved`(rebuild) → `onConfigImported`(refreshAll) 链路（如该文件记录 config 流程）。
- `docs/specs/` 相关：若存在 config/import spec，补「导入后自动全局刷新」行为说明；无则跳过。
