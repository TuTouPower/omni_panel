# Task review t472（reviewer_focus: 测试）

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

- 93 个定向测试实际执行共享实现：IPC 50、CLI 9、file-vault 34；无 skip/only、恒真断言或只测 mock 不测被测逻辑的新增模式。
- canonical v2 顶层形状、版本拒绝、跨平台路径重映射、未知 manifest 回报、secret 三态、备份失败、vault 写失败恢复均有行为断言。
- file-vault 回归使用真实临时目录，验证 snapshot 只保存 ciphertext、权限 0600、替换后可恢复旧集合。
- LocalAPI 集成测试已同步 canonical shape，但当前环境在 better-sqlite3 ABI 加载阶段阻塞，未将阻塞误报成 PASS。

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|IPC canonical file 与 CLI wrapper 定向测试通过；LocalAPI fixture 已改为同一 v2 document。|
|AC-002|re_verified|IPC 50-test suite 断言默认省略 secrets、显式导出写入顶层 secrets。|
|AC-003|re_verified|CLI/IPC 断言 v1 与裸 config 报版本错误且 save/importAll 未调用。|
|AC-004|re_verified|CLI 与 IPC 断言外部 Linux path 被本机 definition path 替换。|
|AC-005|re_verified|CLI/IPC 断言 unknown connector 进入 skipped，不使整单失败。|
|AC-006|re_verified|canonical 显式 secrets 测试断言 vault 目标为字段集合。|
|AC-007|re_verified|CLI 测试断言活动实例旧值保留、removed 实例值删除。|
|AC-008|re_verified|CLI 三态测试第二轮导入 `{}` 后断言 secrets 为空。|
|AC-009|re_verified|CLI/IPC unknown manifest 测试断言 unknown instance secret 不残留。|
|AC-010|re_verified|schema 无效测试断言 config save 与 vault import 均未调用。|
|AC-011|re_verified|CLI vault failure 测试让假 vault 先变更再失败，断言 config/vault 均恢复前态。|
|AC-012|re_verified|CLI backup failure 测试以 EISDIR 模拟不可读现有 config，断言未进入写阶段；file-vault snapshot 测试验证快照实现。|

coverage = 12 / 12

verdict: PASS
