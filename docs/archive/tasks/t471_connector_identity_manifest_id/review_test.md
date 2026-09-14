# Task review t471（reviewer_focus: 测试）

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
- 改测方向复核：本轮无为迁就实现而弱化既有断言；旧路径错误预期随 manifestId 契约变更同步为 manifest id 预期，且新增了本机路径重映射的行为断言。
- 本轮新发现：0 条
- 未进表的提示：AC-002 的真实跨 OS 文件系统移动和 AC-007 的真实 Windows 宿主行为遵循 spec 已声明的有意不测；固定字符串与 definition 注入测试覆盖了可自动验证的等价行为。AC-008 可继续增加真实临时 vault 双实例集成断言，但现有实例维度 key lookup、迁移字段保留和 secret 参数 key 单测已形成有效覆盖，不构成 blocking 缺口。测试文件规模阈值提示不直接造成行为缺陷。
- 总体判断：定向迁移、auto-seed、config-store、IPC 和 CLI 测试覆盖全部自动化 AC；危险模式扫描未发现恒真/弱化/删除断言、skip/only、mock 被测逻辑或静默错误。
- 系统性 follow-up：无

### 危险模式扫描

- 新增测试未命中恒真断言、删除/反转断言、注释断言、`.skip`/`.only`、类型检查禁用或条件跳过弱化断言。
- 文件系统与 logger transport 只作为系统边界 mock；被测迁移、config-store、IPC handler 和 CLI import 均实际执行。
- `git diff` 中既有断言仅将未知连接器的错误文案从路径改为 manifest id；未删除行为覆盖。

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|schema/迁移集成测试断言必填 manifestId 与旧配置可加载。|
|AC-002|re_verified|auto-seed 移动路径及实例保持测试通过；真实跨 OS 移动按 spec 有意不测。|
|AC-003|re_verified|manifest identity 与 IPC/CLI import path remap 测试断言外部路径不会保存。|
|AC-004|re_verified|migration unit/integration tests 断言回填、数量、启用态和参数值。|
|AC-005|re_verified|auto-seed test 断言 manifestId 匹配不重复 seed，并对同 manifest 多实例逐项更新。|
|AC-006|re_verified|生产调用点扫描与现有 lookup 测试共同证明 identity 不再取 executablePath。|
|AC-007|re_verified|固定 Windows、POSIX、UNC、混合分隔符、结尾分隔符和盘符 fixture 通过。|
|AC-008|re_verified|多实例 migration/auto-seed 测试断言实例级字段不合并；secret key 测试断言 key 集合按 instanceId 建立。|
|AC-009|re_verified|config-store logger transport 集成测试断言逐条 orphan 字段、原因和移除数量摘要。|

coverage = 9 / 9

verdict: PASS
