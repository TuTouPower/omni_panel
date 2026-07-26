# Task plan

## 步骤与验证

1. 读取 t121/t122 归档与当前 HEAD，整理 handoff 汇总 → 验证：branch/head_commit/遗留可追溯。
2. 更新 architecture（renderer 树、LocalAPI、sandbox 模型）与 runtime.ts D8 注释 → 验证：对照文件系统、web-panel、server 监听、decisions.md。
3. 修正 domain/bugs/specs_index/window/decisions/platform-services/config-store → 验证：目标文件存在、类型与源码一致、ADR 编号唯一。
4. conventions 记录命名迁移策略 → 验证：不要求全量改名。
5. 全局搜索旧表述 → 验证：无矛盾残留。

## 风险与回退

- 风险：handoff 违反只追加；ADR 引用漏改；弱化 LocalAPI 风险接受描述。
- 回退：按最小语义块逐文件恢复。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`、`domain.md`、`decisions.md`、`conventions.md`。
