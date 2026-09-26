# handoff

- 最后更新：2026-09-26
- branch：`main`
- head_commit：`75ed7ea7`
- 当前状态：t523 任务链已集成入主干（`ccc95665`，t524 连接器 worker 修复随后亦已合入 `9cee24f6`）；本次为文档规范审阅修复。

## 2026-09-26 文档规范审阅修复

- branch：`main`
- head_commit：`75ed7ea7`
- 内容：
    - t523 链已集成，无未合并 task 分支；本次只做文档修复，不动源码。
    - 按 `DOCUMENTATION_STANDARD.md`（`~/kar/code/my_file/coding_agent/docs/`）§2/§3/§4/§6/§7/§9 修复 README / AGENTS / DESIGN / `docs/blueprint/*` / `docs/specs_index.md`：端口统一按代码实况 `17863`（`src/main/core/local-api/server.ts` `DEFAULT_PORT`）、模板权威落点改 `.repo_template/`、连接器隔离与 SHA-256 完整性断言对齐 ADR 036、领域模型 provider 清单与 §3.x 层级校正、覆盖率阈值与 `pnpm check` 组成对齐 `vitest.config.mts` / `package.json`。
    - 上一节（2026-09-25 t509 ~ t523 链完成）已按「过时段落迁 `docs/archive/handoff.md`」追加归档。
- 待用户裁决：`DEFAULT_PORT` 现为 `17863`，与 CPA（CLIProxyAPI）本机管理 API 知名端口相同（`docs/archive/bugs_2026_07.md` 记录的 2026-07-26 hotfix 已在 t520 重构中被回退）；是否重设端口尚未决定。
- 下一步：按审阅结论处理遗留冲突项。
