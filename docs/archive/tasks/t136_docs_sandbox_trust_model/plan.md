# Task plan

## 步骤与验证

1. 核对 connector 加载路径与 `node:vm` 实际职责 → 验证：文档只陈述本地目录运行模型，不扩展安全策略。
2. 修正 architecture/spec 表述与 runtime 失效 D8 引用 → 验证：`decisions.md` 不存在的引用清零。

## 风险与回退

- 风险：写成新增权限/安全管控，偏离用户明确范围。
- 回退：删除风险提示或管控语句，只保留事实描述与失效引用修正。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：connector 本地运行模型。
