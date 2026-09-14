# Task review t479（reviewer_focus: 测试）

- task：`t479_config_write_concurrency`
- spec：`docs/tasks/t479_config_write_concurrency/spec.md`
- diff_anchor：`ee55be3127fe95c8c99479468cd0990cc23faba7`
- target：当前 worktree 相对 diff anchor 的测试与验收证据
- round：1
- reviewed_at：2026-09-14 00:00 UTC

reviewed_scope: 06c9c9f88453fb94

## Findings

无 finding。

## AC 复验方式

- AC-001：`handleConfigSave` 与 `import_config` 的事务路径均在统一队列内；配置/IPC/CLI 定向回归通过，导入回滚与非交错语义由 t472 回归继续覆盖。
- AC-002：duplicate/create 的 read-modify-commit 被放入 `run_serialized`，配置 store 并发实例测试通过。
- AC-003：桌面 IPC 与 CLI 均调用共享 `import_config`；CLI import 定向回归与共享 transfer 回归通过。
- AC-004：生产入口代码审查确认没有绕过统一事务队列的直接 `configStore.save`；store 自身的 `doSave` 是事务提交点。
- AC-005：`config-store.test.ts` 的并发复制 + 另一字段修改测试断言两种非重叠修改同时存在。
- AC-006：并发新建 + 另一实例隐藏/删除测试断言实例列表和 `removedConnectorIds` 同时保留。
- AC-007：save 采用 base match 冲突拒绝；import/duplicate/create 在串行临界区内完成，IPC 单测及定向回归通过。
- AC-008：并发 prune + 用户修改测试断言用户字段保留且孤儿被清除；启动 auto-seed 的实现检查确认同样走事务。

定向命令 `pnpm exec vitest run tests/integration/config/config-store.test.ts tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/import-config.test.ts`：3 files、94 tests passed。全量 Vitest 的 357 failures 均落在已确认的 Node 24 `better-sqlite3` native binding 环境问题或 t478 未合并的基线分支差异，未发现 t479 定向回归失败。

## 结论

测试覆盖了所有 AC 的可自动验证路径，断言包含非重叠修改保留而非仅 JSON 可解析性；无 blocking finding，verdict：PASS。

verdict: PASS
