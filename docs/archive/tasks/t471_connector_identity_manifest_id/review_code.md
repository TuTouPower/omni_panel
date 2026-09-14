# Task review t471（reviewer_focus: 代码）

- task：`t471_connector_identity_manifest_id`
- spec：`docs/tasks/t471_connector_identity_manifest_id/spec.md`
- diff_anchor：`702dfdb0d780cffecd3fc8b6e5e4315430148676`
- target：`git -C '/workspace/scratch/816ee2fd705d/omni_panel_t471' diff 702dfdb0d780cffecd3fc8b6e5e4315430148676`
- round：1
- reviewed_at：2026-09-14 14:21 UTC+8

## Findings

reviewed_scope: 0ab89937b276e6e7

本轮零 finding。

## 结论

- 前轮 finding 复核：首轮，无
- 本轮新发现：0 条
- 未进表的提示：`src/main/core/config/config-store.ts` 562 行、`src/main/ipc/config-ipc.ts` 733 行、`tests/unit/ipc/config-ipc.test.ts` 1486 行、`tests/integration/config/config-store.test.ts` 1053 行达到文件规模提示阈值；本轮未观察到由规模直接造成的行为缺陷。`migrate_connector_plugins` 的分支、备份和日志路径已逐一检查，无需新增 follow-up。
- 总体判断：按 manifestId 的身份迁移、跨平台尾段解析、本机路径重映射、多实例保留、孤儿日志/摘要和全部生产 lookup 均与契约一致；安全、错误处理、并发保存、性能、架构边界、公开 schema/文档一致性均未发现 blocking finding。
- 系统性 follow-up：无

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|`src/shared/types/config.ts:115-120` 与 `src/main/core/config/types.ts:37-44` 将 `manifestId` 设为必填；`tests/integration/config/config-store.test.ts` 覆盖旧配置迁移后可加载。|
|AC-002|re_verified|`src/main/core/config/auto-seed.ts:30-56` 仅按 manifestId 更新本机路径并逐实例返回；`tests/unit/main/core/config/auto-seed.test.ts` 覆盖移动路径和多实例。|
|AC-003|re_verified|`src/main/core/config/manifest-identity.ts:115-118` 与导入路径重映射按本机 definition 刷新路径；`tests/unit/main/core/config/manifest-identity.test.ts`、IPC/CLI 导入回归通过。|
|AC-004|re_verified|`migrate_connector_plugins` 回填并刷新路径且复制原实例字段；`tests/unit/main/core/config/manifest-identity.test.ts` 与 `tests/integration/config/config-store.test.ts` 断言数量、实例和参数保持。|
|AC-005|re_verified|`auto_seed_connectors` 的唯一索引为 `manifestId`，并保留同 manifest 的全部实例；对应 auto-seed 回归通过。|
|AC-006|re_verified|`rg` 扫描 `src/main`/`src/shared` 后，`executablePath` 仅用于本机路径存储/重映射、健康检查和日志；definition/secret/调度/IPC identity lookup 均按 manifestId。|
|AC-007|re_verified|`extract_manifest_id_from_path` 使用 `/` 与 `\\` 统一尾段解析；固定 Windows、POSIX、UNC、混合分隔符和盘符 fixture 通过。|
|AC-008|re_verified|迁移通过对象复制保留 instanceId/stateId、启用态、参数、端点和间隔；secret key lookup 与 `keyFor(instanceId, name)` 仍按实例维度，相关单测通过。|
|AC-009|re_verified|`config-store` 对每个 dropped entry 写 instanceId/manifestId/path/reason，并写移除数量摘要；集成测试捕获逐条日志和 `1 connector(s) removed`。|

coverage = 9 / 9

verdict: PASS
