# Task review t195（reviewer_focus: 代码）

- task：`t195_config_save_cache_debounce`
- spec：`docs/tasks/t195_config_save_cache_debounce/spec.md`
- diff_anchor：`33c3773698023b903bbc3dd809f2eb987fb6b8b7`
- target：`git diff 33c3773698023b903bbc3dd809f2eb987fb6b8b7`
- round：2
- reviewed_at：2026-08-03 23:06 UTC+8

## Findings

### t195_code_f001 - PopupView unmount 时 dispose 丢弃 pending 防抖 patch，UI 偏好配置静默丢失

- 严重度：important
- 锚点：AC7「配置写入不丢且重启后生效」；AC4 防抖合并引入的静默丢失窗口
- 位置：`src/renderer/views/PopupView.tsx:184`（useEffect cleanup → dispose）、`src/renderer/lib/config-debounce.ts:71-75`（dispose 只清 timer 不 flush）
- 问题：偏好切换（折叠/展开/排序）经 `patchConfig → patch()` 落入 500ms 防抖 `pending`，仅当 timer 到期或显式 `flush()` 才持久化；`flush()` 在 PopupView 中从不被调用。当用户在切换偏好后 500ms 内离开 popup 视图（`src/renderer/App.tsx` 按 route 条件渲染，popup→settings 会真实 unmount PopupView），cleanup 调 `dispose()`，timer 被清除、`pending` 被整体丢弃，该批偏好未写入 config，重启后丢失。原实现（每次 patch 立即串行 get+save）无此窗口。`tests/unit/renderer/lib/config-debounce.test.ts`「dispose cancels a pending timer without saving」固化了「卸载丢弃 pending」的行为，与 AC7 不丢语义冲突。
- 建议：`dispose()` 改为「有 pending 时先 fire-and-forget 触发 flush（清 timer 但保留队列），再丢弃」，或在路由切换/卸载前显式 `flush()`；保持 timer 到期与 flush 的幂等（`flush_pending` 已具备 pending 判空）。

### t195_code_f002 - vault set/delete 写盘失败时 mirror 先于磁盘更新，内存与磁盘状态分叉

- 严重度：important
- 锚点：AC3（vault 缓存语义须与磁盘一致）；失败状态不一致（错误处理维度）
- 位置：`src/main/core/vault/file-vault-backend.ts:184-201`
- 问题：`set()` 中 `data[key] = encrypt_value(...)`（`data` 即 `ensure_mirror()` 返回的 mirror 引用）在 `await write_vault(data)` 之前执行；`delete()` 中 `mirror = next_data` 也在 `await write_vault(next_data)` 之前。若 `write_vault` 抛错（`writeJsonAtomic` 失败：磁盘满/权限/IO），mirror 已包含新 key（或已删 key）而磁盘未更新。后续 `get()`/`has()` 从 mirror 返回「未持久化」的值，调用方误以为写入成功，进程重启后该值丢失。原实现每次 set/delete 先 `read_vault` 再写，写失败时内存读到的仍是磁盘旧值，状态一致。
- 建议：写盘成功后再提交镜像。`set()` 改为对 mirror 做浅拷贝 `const next = { ...data, [key]: encrypt_value(...) }`，`await write_vault(next)` 成功后 `mirror = next`；`delete()` 同理在 `write_vault` 成功后再 `mirror = next_data`。

### t195_code_f003 - config-store.ts 缩进混乱

- 严重度：minor
- 锚点：代码质量（可读性）
- 位置：`src/main/core/config/config-store.ts:239-427`
- 问题：`load_uncached` 函数体（239-358 行）整体多一层缩进，`return { ... }` 对象内方法体缩进不齐（386-422 行成员缩进与前 16 行不一致），疑似移除旧内层闭包后未重新排版，破坏可读性。
- 建议：统一按 4 空格重排该段缩进。

### t195_code_f004 - 新增 mock 行缩进错误

- 严重度：minor
- 锚点：代码质量（格式一致）
- 位置：`tests/unit/ipc/connector-ipc.test.ts:569,647`、`tests/integration/scheduler/refresh-service.test.ts:611`
- 问题：为 `AppConfigStore` 接口补充的 `prune_unhealthy_plugins` mock 行缩进与周围对象成员不一致（少缩进 2 层），且 `refresh-service.test.ts` 中插入位置破坏了原 `};` 的对齐。
- 建议：格式化对齐。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：4 条（2 important + 2 minor）。
- 未进表的提示：
    - 文件过大：`src/main/core/config/config-store.ts`（428 行，本 task 净增 +104，超过实现源码 400 阈值）；`src/main/ipc/config-ipc.ts`（575 行，本 task 净增约 +10，超过 400 阈值）。`src/renderer/views/PopupView.tsx`（726 行，超 400 阈值但本 task 未净增，不触发条件）。均为 minor 级可读性提示，未直接造成可观测缺陷。
    - 圈复杂度：`config-store.ts` 的 `load_uncached` 手算 McCabe 约 14（多重 try/catch + ENOENT 分叉 + 备份恢复分支），未达 15 阈值且本 task 未显著新增分支，仅结论提示。
    - 范围外观察：`config-ipc.ts` 的 config 导入流程把 `onConfigImported`（refreshAll）移到 `onConfigSaved`（scheduler rebuild）之前，与 `src/main/config-callbacks.ts` 注释「onConfigSaved has already synchronously rebuilt the scheduler … before this fires」的既定顺序相反。当前 `refreshAll` 直接枚举 `load()` 返回的插件刷新、不依赖 scheduler 重建，故无即时可观测缺陷；但 prune 在 refreshAll 之后才执行，孤儿插件会在清理前被无谓刷新一次。建议后续保持文档顺序或同步更新该注释。
- 总体判断：AC1/AC2/AC3 的 config/vault/connector 缓存与失效主路径实现正确且测试覆盖充分；但 f001（防抖卸载丢配置）与 f002（vault 写失败镜像分叉）均为未解决的数据一致性问题，FAIL。
- 系统性 follow-up：无（当前 diff 引入的问题均在 t195 内处置）。

verdict: FAIL

## Round 2 (2026-08-03 23:06 UTC+8)

### 前轮 finding 复核（以 diff 与代码/测试为准）

- **t195_code_f001（important）— 已修**：`src/renderer/lib/config-debounce.ts` 的 `dispose()` 现在清 timer 后 fire-and-forget 调用 `flush_pending()`（其内部 pending 判空幂等），卸载时不再丢弃 pending patch；PopupView 在 `useEffect` cleanup 调 `config_patcher_ref.current?.dispose()`。测试「dispose cancels the pending timer but flushes pending patch (f001)」断言 dispose 后 `save` 被调用 1 次且携带 pending patch、残留 timer 不触发第二次 save，覆盖 AC7 不丢语义。原「dispose cancels a pending timer without saving」固化丢弃行为的旧测试已替换为断言 flush 的新语义。
- **t195_code_f002（important）— 已修**：`file-vault-backend.ts` `set()` 改为先构造 `const next = { ...data, [key]: encrypt_value(...) }`，`await write_vault(next)` 成功后才 `mirror = next`；`delete()` 同样在 `write_vault(next_data)` 成功后 `mirror = next_data`。新增 2 个写失败测试（把 `secrets.vault.tmp` 路径占为目录触发 EISDIR）：断言失败后镜像未提交（`get` 读不到新 key / `delete` 后 key 仍可读），且冷镜像从盘重读仍是磁盘旧值。写失败不再出现内存/磁盘分叉。
- **t195_code_f003（minor）— 已修**：`config-store.ts` 全文件已统一 4 空格缩进，`load_uncached` 函数体与 `return { ... }` 对象成员对齐一致，无残留多余缩进层。
- **t195_code_f004（minor）— 已修**：`tests/unit/ipc/connector-ipc.test.ts`、`tests/integration/scheduler/refresh-service.test.ts` 及 unit 版等全部新增 `prune_unhealthy_plugins` mock 行已与相邻对象成员 4 空格对齐；unit 版改用多行格式化，`};` 对齐正常。
- **config-ipc import 顺序（Round 1 范围外观察）— 已解决**：`handleConfigImport` 现为先 `prune_unhealthy_plugins()`（失败不阻断 import，日志告警）再 `onConfigSaved(saved_config)` 再 `onConfigImported(parsed.data)`，对齐 `config-callbacks.ts` 注释既定顺序；孤儿插件在清理前不再被刷新一次。`onConfigImported` 仍传 pre-prune 的 `parsed.data`，但 refreshAll 不消费该实参，无实际影响。

### 本轮新发现

- 无新 finding。

### 未进表的提示

- 文件过大 / 圈复杂度结论沿用 Round 1，本轮无新增。
- 新文件 `src/main/core/connector/script-cache.ts`（42 行）与 `src/renderer/lib/config-debounce.ts`（87 行）均远低于 400 阈值。

### 总体判断

- 前轮 4 条 finding 均已修复并有测试证实；受影响的全部相关测试（config-debounce、file-vault-backend、script-cache、config-store、config-ipc、refresh-service、effective_proxy、connector-ipc、auth-ipc、scheduler-orchestrator、local-api server、secrets-store、runtime）本地运行全绿（43 + 111 + 106 用例）。当前无未解决的 critical / important，仅 minor 级遗留均已在 Round 1 处置。
- 系统性 follow-up：无。

verdict: PASS
