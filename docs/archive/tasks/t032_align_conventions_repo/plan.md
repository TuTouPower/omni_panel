# Task plan

## 步骤与验证

1. 读 repo_template conventions.md 工作流字段段作参照 → 验证：已读
2. 改 conventions.md L3 删 adoption/ → 验证：grep 无
3. 命名与格式段措辞对齐（task {tid}/spike {sid}） → 验证：读确认
4. task 文件模板表加列 + 明确声明 → 验证：读确认表结构
5. 新增 task.md front matter 详解段 → 验证：章节存在
6. 新增 schema 类型落点段（omni 特化） → 验证：章节存在
7. review 字段段对齐 repo（指向 render 脚本） → 验证：读确认
8. specs_index.md 14 行"无 {tid}"→"无" → 验证：grep 无 {tid}
9. pnpm test 回归 → 验证：不破坏

## 风险与回退

- 风险：schema 落点段通用版与 omni 实际（schemas/ 连接器契约 + src/shared/schemas/ 代码契约）不符 → 按 omni 现状特化，不照搬 repo 通用表
- 风险：改 conventions 自述（L3）影响导航 → 同步检查 AGENTS 引用
- 回退：分支 t032_align_conventions_repo 可整体丢弃

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：本身就是本 task 产物
