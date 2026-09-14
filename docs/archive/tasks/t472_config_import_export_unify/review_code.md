# Task review t472（reviewer_focus: 代码）

- task：`t472_config_import_export_unify`
- spec：`docs/tasks/t472_config_import_export_unify/spec.md`
- diff_anchor：`614dea2e447f6d3214595ed8d2129d03e2c132aa`
- target：`git -C '/workspace/scratch/816ee2fd705d/omni_panel_t472' diff 614dea2e447f6d3214595ed8d2129d03e2c132aa`
- round：1
- reviewed_at：2026-09-14 08:54 UTC

## Findings

reviewed_scope: c4ce0beb01ee3de6

本轮零 finding。

## 结论

- 共享 `config-transfer.ts` 是唯一 config/vault 导入实现；桌面 IPC、LocalAPI/Web 与 CLI 只负责入口文件/HTTP/确认框。
- envelope、config schema、secrets record、formatVersion 和 endpoint policy 均在写入前校验；v1/裸 config 不会进入存储阶段。
- manifestId 过滤后才计算活动实例和 vault 目标集合；显式 secrets、缺失 secrets、空对象和未知 manifest 的 secret 语义与 spec 一致。
- config `.bak` 与 ciphertext-only vault snapshot 均在第一次写入前生成；config/vault 任一写入失败都尝试恢复共同前态。
- 全量 LocalAPI/TypeScript 门禁的阻塞均为环境问题（better-sqlite3 native binding、生成 build-info/tsx IPC），不是本 diff 的业务错误。

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|桌面 `handleConfigExport/Import`、LocalAPI `handleConfigExportData/ImportData`、CLI `get_config_export/import_config_file` 均调用共享 transfer；IPC/CLI 定向回归通过。|
|AC-002|re_verified|`export_config` 固定 `formatVersion: 2`，默认不创建 `secrets`，显式 includeSecrets 才导出顶层集合；IPC/LocalAPI 测试断言 canonical shape。|
|AC-003|re_verified|`parse_transfer_document` 拒绝缺失、v1 与其他版本并返回实际版本；CLI/IPC 测试断言无 save/importAll。|
|AC-004|re_verified|`normalize_plugins` 使用 manifestId + 本机 definition 调用 `remap_connector_paths`；CLI/IPC path remap 回归通过。|
|AC-005|re_verified|未知 manifest 被跳过并返回 `skipped`，对应 secrets 按活动实例过滤；IPC/CLI 回归覆盖。|
|AC-006|re_verified|显式 `secrets` 经过活动实例过滤后调用一次 `importAll`，覆盖旧 vault；CLI/IPC 回归覆盖。|
|AC-007|re_verified|缺失 `secrets` 从旧 `exportAll` 中只保留新 config 活动实例，悬空实例被清理；CLI 三态回归覆盖。|
|AC-008|re_verified|显式 `secrets: {}` 产生空目标集合并整体替换；CLI 回归断言 vault 为空。|
|AC-009|re_verified|未知 manifest 被过滤后不在活动实例集合中，其显式 secret 不进入目标 vault；CLI/IPC 回归覆盖。|
|AC-010|re_verified|envelope/schema/secrets 失败发生在 `load/exportAll/backup/save/importAll` 之前；v1、裸 config、schema 失败回归断言存储无写入。|
|AC-011|re_verified|写 config 后 vault 失败会 save 前态 config，并通过加密 snapshot 或旧集合恢复 vault；CLI failure regression 与 IPC failure regression 通过。|
|AC-012|re_verified|`backup_config` 只对 ENOENT 跳过；其他 backup 错误直接中止，且 vault snapshot 发生在 config save 前；CLI backup-failure regression 通过。|

coverage = 12 / 12

verdict: PASS
