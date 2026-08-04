---
tid: "t195"
slug: "config_save_cache_debounce"
title: "config/vault/connector 缓存层与持久化防抖"
status: "done"
branch: "t195_config_save_cache_debounce"
worktree: ""
review_level: "full"
diff_anchor: "33c3773698023b903bbc3dd809f2eb987fb6b8b7"
depends_on: ""
conflicts_with: ""
note: "P1+P2"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- config-store：`load()` 改内存缓存（首次读盘 + parse + 缓存），`save`/`scheduleSave`/`flushPendingSave` 经 `enqueueSave→doSave` 写盘后刷新缓存（唯一写入口）。`prune_invalid_plugins`（manifest 健康检查）从 `parse_config` 抽出，新增 `prune_unhealthy_plugins()`：启动期（auto_seed 前）与 config 导入后调用一次；load 不再做逐插件 manifest stat。
- vault：`file-vault-backend` 加内存镜像 `ensure_mirror()`，`get/has/list_keys` 不重读整份文件；`set/delete` 更新镜像并写盘。损坏 bak 恢复语义保留在首次 ensure_mirror。
- connector 脚本：新增 `script-cache.ts`（按脚本路径 mtime 缓存 readFile + `compile_script` 结果）；`runtime.ts` 导出 `compile_script`、`run_connector` 增可选 `compiled_code` 参数跳过 transpile；`refresh-service.execute_connector` 改用缓存。
- renderer：新增 `config-debounce.ts`（防抖合并 patch → 一次 get+save，内部串行队列）；PopupView `patchConfig` 改用 patcher，偏好切换本地已乐观生效、500ms 防抖持久化。
- onConfigSaved 代理分流：`proxy_config_changed`（`effective_proxy.ts`）比较前后 `proxy` 字段，仅变化时重新 `detect_system_proxy`。注意：D12「系统代理外部切换（Clash 开关）经 config save 生效」语义被 spec AC5 取代，现仅用户修改 proxy 配置字段时触发。
- 踩坑：AppConfigStore 接口加 `prune_unhealthy_plugins` 后，所有 mock configStore 的测试文件须补该方法（connector-ipc/auth-ipc/config-ipc/local-api/refresh-service/scheduler-orchestrator）。lint `--fix` 移除类型断言会连带删除 inline mock 的补充行，需复查。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-03 23:08 UTC+8)

Round 1 code FAIL（2 important + 2 minor）、test PASS（3 minor）；Round 2 code PASS。共 7 条 finding 全部已修。

| finding_id     | severity  | status | rationale                                              | fix_ref                                                           |
| -------------- | --------- | ------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| t195_code_f001 | important | 已修   | dispose 改 fire-and-forget flush pending，卸载不丢配置 | src/renderer/lib/config-debounce.ts:71-80 + 对应测试              |
| t195_code_f002 | important | 已修   | vault set/delete 写盘成功后才提交镜像                  | src/main/core/vault/file-vault-backend.ts set/delete + 写失败测试 |
| t195_code_f003 | minor     | 已修   | config-store.ts 缩进统一重排                           | src/main/core/config/config-store.ts                              |
| t195_code_f004 | minor     | 已修   | mock 行缩进对齐                                        | tests/unit/ipc/connector-ipc.test.ts + refresh-service.test.ts    |
| t195_test_f001 | minor     | 已修   | vault 冷镜像用例真正写盘 + 断言热/冷镜像差异           | tests/integration/vault/file-vault-backend.test.ts                |
| t195_test_f002 | minor     | 已修   | 补 AC2 并发读改写用例（脏读/丢失）                     | tests/integration/config/config-store.test.ts                     |
| t195_test_f003 | minor     | 已修   | runtime 预编译用例改名去夸大                           | tests/integration/connector/runtime.test.ts                       |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：AC1–AC6 满足；AC7 `[deploy]` 待人工签收
- 证据：AC1 load 内存缓存（config-store 集成测试缓存命中/不重读盘）；AC2 save 唯一写入口失效缓存 + 并发读改写无脏读丢失（t111 并发写 + t195 新增交错用例）；AC3 vault 镜像（get/has 不重读、写失败镜像不提交）+ connector 脚本 mtime 缓存（script-cache 命中/变更重编译）+ 写穿与冷镜像测试；AC4 防抖合并一次 save + dispose flush pending 不丢（config-debounce 单测）；AC5 `proxy_config_changed` 仅 proxy 字段变化触发 + scheduler-orchestrator reconcile 既有「仅调度集合变化 rebuild」回归；AC6 CONFIG_CHANGED 广播路径不变（config-sync 签名 + onConfigSaved 分流仅删代理冗余探测）。全量 2086 unit/integration pass；web e2e 48 pass（synthetic fixture）；electron e2e 11 例既有失败与 t194 一致登记 p038（非本 task 引入）。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS

### 结果摘要

config/vault/connector 脚本三级缓存 + renderer 防抖持久化 + onConfigSaved 代理分流，AC1–AC6 达成，AC7 待人工签收。
