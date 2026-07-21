# Task spec

## 背景

t031 迁移工作流时 conventions.md 工作流字段段未完全对齐 repo_template：自述列表残留 `adoption/`、task 文件模板表缺"谁写/是否必有"列、无 front matter 详解、无 schema 类型落点段、specs_index.md "无 {tid}" 占位符有歧义。

## 范围

- `docs/blueprint/conventions.md`：
    - L3 自述列表删 `adoption/`
    - 命名与格式段措辞对齐 repo_template（task `{tid}` 小写、spike `{sid}` 说明）
    - task 文件模板表加"谁写/是否必有"列 + 明确声明"不再使用独立 log/adoption/task_report"
    - 新增 task.md front matter 详解段
    - 新增 schema 类型落点段（omni electron 项目特化：schemas/ 放连接器契约，src/shared/schemas/ 放代码内契约）
    - review 报告字段段对齐 repo（指向 render 脚本 + 模板）
- `docs/specs_index.md`：14 行"无 {tid}" 改"无"

## 非范围

- 不改 AGENTS.md（t031 已重写）
- 不改 templates/（repo 原样）
- 不动历史归因（decisions/handoff/bugs/testing/domain/代码注释）
- 不改代码

## 验收标准

- [ ] conventions.md L3 无 `adoption/`
- [ ] conventions.md task 模板表含"谁写/是否必有"列 + 明确废 log/adoption/task_report 声明
- [ ] conventions.md 含 task.md front matter 详解段
- [ ] conventions.md 含 schema 类型落点段
- [ ] specs_index.md 无 `{tid}` 占位符字样
- [ ] grep `adoption/` 在 conventions.md 无残留

## 依赖与约束

- 纯文档改动，无红/绿测试
- 黑盒：pnpm test 不破坏（文档独立于测试）
- 基于新工作流（t031 已建脚本/模板/json）
