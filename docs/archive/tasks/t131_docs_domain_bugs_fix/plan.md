# Task plan

## 步骤与验证

1. 对照 connector 目录补全 domain provider 枚举 → 验证：逐目录核对，无漏项或把 CPA 混入直连列表。
2. 对照 t111 归档 spec/commit 给 bugs.md 追加修复行 → 验证：修复事实、branch、commit 均准确。

## 风险与回退

- 风险：provider 分类错误或修复记录超出已验证范围。
- 回退：恢复本 task 修改的两个最小语义块。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：内置直连 provider 枚举。
