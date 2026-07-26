# Task plan

## 步骤与验证

1. 读取 t121/t122 归档记录和当前 HEAD，整理汇总交接 → 验证：branch、head_commit、遗留 finding 可追溯。
2. 更新 renderer 目录树与 LocalAPI 长期描述 → 验证：逐项对照文件系统、`web-panel.md` 和 server 监听实现。
3. 搜索旧 LocalAPI 表述与失效目录描述 → 验证：无矛盾残留。

## 风险与回退

- 风险：handoff 违反只追加规则；LocalAPI 风险接受描述被弱化。
- 回退：只回退新增交接段或本 task 修改的 architecture 语义块。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：renderer 目录树与 LocalAPI 当前真相。
