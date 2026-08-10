# Task review t293（reviewer_focus: 代码）

- task：`t293_config_save_conflict_cache_stale`
- spec：`docs/tasks/t293_config_save_conflict_cache_stale/spec.md`
- diff_anchor：`4c98f4f789c6d73c4b874df28948fcd3df3388fc`
- target：`git diff 4c98f4f789c6d73c4b874df28948fcd3df3388fc`
- round：1
- reviewed_at：2026-08-11 02:22 UTC+8

## Findings

无（clean review，0 finding）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：0 条。

实现侧结论（以 `git diff` 与代码为准，逐条核过 AC）：

- **AC-001 已满足**。`handleConfigSave`（`src/main/ipc/config-ipc.ts:194-199`）不再 `load()` 二次重读（旧实现 `config-store.ts` 旧版重读命中内存缓存，恒等于 `current`，冲突检测形同虚设），改调 `configStore.saveIfBaseMatches(current, stripped)`，把比较与写入放进 save 串行队列（`src/main/core/config/config-store.ts:270-287` enqueueCompareAndSave）。队列 FIFO 保证：两个基于同一旧快照的重叠 CONFIG_SAVE，先入队者 compare 通过并 commit（`cached_config` 更新为后写配置），后入队者读到已提交状态 ≠ base → 返回 `"conflict"`，被拒绝（`config-ipc.ts:196-199` 映射为 CONFLICT）。无论入队顺序，恰好一个通过、一个被拒，先写变更不静默丢失。`cached_config` 仅由 `doSave`（成功落盘后）更新，且唯一写入口即 queue（config.json 无其他写者，已 grep 核实），故比较基准可靠。
- **AC-002 已满足**（按「被接受写按序执行」的连贯解读，见下「AC-002 解读」）。集成测试 `tests/integration/config/config-store.test.ts:809-861` 用 `Promise.all` 两个 `saveIfBaseMatches` 断言恰一 `saved`、一 `conflict`，且最终落盘等于胜者版本；enqueue 在单 tick 内同步调用，`a` 先入队，结果确定性，非 flaky（实测通过）。
- **AC-003 已满足**。`pnpm test` 全绿：254 files / 2847 passed / 2 skipped（含 config-store、config-ipc、local-api、scheduler、auth/connector/import 全部受影响 mock 补齐）；`tsc --noEmit`、`eslint`（两改动源文件）均 0 error 0 warning。
- **不偏航/不自由发挥**：改动集中在 `config-store.ts` + `config-ipc.ts`；其余均为 `AppConfigStore` 接口新增 `saveIfBaseMatches`（`config-store.ts:70-73`）后测试 mock 的必要补齐，无范围外模块改动。`enqueue` 泛型化（`config-store.ts:242-257`）仅把 `enqueueSave` 的 `() => doSave(config)` 抽为参数，语义等价（原 `run.catch()` 与现 `run.then(..,..)` 对队列吞错、inflightSaves 递减一致）。
- **AC-002 解读提示（非 finding，不进表）**：AC-002 字面「与按序执行结果一致」若按「两次 save 各自重载新鲜状态串行跑完」读，最终应同时含两次改动；而冲突拒绝语义天然丢弃后写。二者仅当把「按序执行」理解为「被接受的写按队列顺序落盘」才一致——这与 AC-001 明示允许的「后写被冲突拒绝」连贯。实现与集成测试均按后者，判定合规。建议 implementer 若担心歧义，可在 task.md 处置表记录该解读，或下轮请 test reviewer 对 AC-002 断言强度复核。
- **文件过大（按降级规则仅列结论，不进 finding 表）**：
    - `src/main/core/config/config-store.ts`：489 行，本 task 净增 +44（> 实现源码 400 minor 阈值，task 有净增）
    - `tests/integration/config/config-store.test.ts`：910 行，净增 +65（> 测试 600 minor 阈值，task 有净增）
    - `tests/unit/ipc/config-ipc.test.ts`：1442 行，净增 +14（> 测试 1200 important 阈值；超阈值主因是存量 1428 行，本次仅 +14，非本 task 堆大，仅列示）
    - `src/main/ipc/config-ipc.ts`：720 行（> 400 minor），本 task 净 -1（未净增，不满足出 finding 条件，仅列示存量）
    - 以上均未因过大直接产生可观测缺陷，故只列路径与行数。
- **复杂度**：`enqueueCompareAndSave` / `enqueue` 分支极简；`handleConfigSave` 复杂但本 task 对其净改动 ±0（仅把 reload 块替换为 saveIfBaseMatches 块），未增分支/嵌套。无复杂度 finding。
- **范围外观察（仅提示）**：`saveIfBaseMatches` 只覆盖 CONFIG_SAVE 路径；`handleConfigDuplicate` / `handleConfigCreateInstance` / `handleConfigImportData`（`config-ipc.ts:318/374/516`）仍为 load→merge→`save()` 无冲突检测，但属 spec 非范围「非并发路径的 save 行为调整」，不判缺陷。LocalAPI `POST /v1/config`（`server.ts:1342-1351`）经 `handleConfigSave` 同样获得保护，CONFLICT 经 `send_result` 映射 400 + error body，与旧错误面一致。

- 总体判断：实现正确闭环了 spec 范围——冲突检测移入 save 串行队列、以「仅成功 save 更新」的提交态为比较基准，重叠 CONFIG_SAVE 恰一通过，先写不丢失；既有测试全绿。无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 33e75d02f85184ff
