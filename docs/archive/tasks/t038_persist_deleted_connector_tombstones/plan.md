# Task plan

## 步骤与验证

1. 红灯：`tests/unit/main/core/config/auto-seed.test.ts` 加 case "tombstone id 不被重新 seed" → 验证：`pnpm test tests/unit/main/core/config/auto-seed.test.ts` 失败。
2. 红灯：`tests/unit/ipc/config-ipc.test.ts` 加 case "删除 connector 写入 removedConnectorIds" → 验证：失败。
3. schema：`AppConfiguration` 加 `removedConnectorIds?: string[]`（可选，默认空）；`appConfigurationSchema` 放行；`config-store` stripRemovedConfigFields 不剥离该键。
4. seed 改造：`auto_seed_connectors(existing, definitions, removedIds)` 跳过 `removedIds` 命中的 definition。
5. 启动接入：`src/main/index.ts:161` 调用传入 `config.removedConnectorIds ?? []`。
6. 删除写入：`SettingsView.tsx` `onConfirm`（直连 + CPA 移除两处）在同一 `save_config` 内追加该 connector manifest id 到 `removedConnectorIds`（去重）。需从 `pluginInfos`/manifest 取 `metadata.name`（= connector id），非 instanceId。
7. 绿灯：跑上述两测试通过；`pnpm test` 全绿。
8. 打包验证：`pnpm package` → 删除一个内置账号 → `omni.stop/start` 或重启 exe → 确认不复活。

## 风险与回退

- 风险 A：tombstone 按 manifest id 记录，若用户手动删 connector 目录后又放回，仍被 tombstone 挡。→ 缓解：记录 id 即"用户明确删除过"，恢复目录不等于恢复意图；可在设置页"添加连接器"时清对应 tombstone（后置，非本 task）。
- 风险 B：旧版本写出的 config 无新字段，新版首次启动按空 tombstone 处理（等价现状，无回归）。
- 风险 C：CPA "移除数据源" 也复用同一路径，须确认 CPA tombstone id（`cpa`）不会误伤其他以 `cpa` 为子串的 connector（A10 已精确匹配，沿用即可）。
- 回退：新增字段可选 + seed 函数新增参数默认空集；还原代码即恢复旧行为。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：不变量 8 补"直连删除须 tombstone 持久化，auto-seed 不得复活"。
- `docs/blueprint/architecture.md`：启动流程 auto-seed 段补 tombstone 过滤。
