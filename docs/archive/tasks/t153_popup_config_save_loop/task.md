---
tid: "t153"
slug: "popup_config_save_loop"
title: "修复用量面板配置保存回环导致闪烁"
status: "done"
branch: "t153_popup_config_save_loop"
worktree: ""
review_level: "full"
diff_anchor: "5d2e3b971154325895deee9020097fd9cb453bb0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t153_popup_config_save_loop

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 诊断：52MB 日志（已被 50MB 上限截断）显示 16 分钟内 19,965 次 `config:save`（~30ms/圈）。链路：`patchConfig` get→save → 主进程广播 → `onConfigChange` → `reload()` + `apply_config` 新对象覆盖 state → persist effect 守卫失配再保存。
- 复现尝试：当前 config（21 plugins / floating / 面板可见）下打包运行收敛（仅启动 2 次挂载期保存），未复现长循环；循环期 plugins 16→18 变化 + floating 可见是必要外因，但根因是 renderer 响应广播会反向保存配置这一不变量破坏。
- 顺带发现：挂载期必发 2 次无意义保存（refs 初始空、`apply_config` 不同步 refs）；`use-config` 回显引用比较跨 IPC 恒 false；`apply_config_change` 每次广播都 `setAlwaysOnTop`。
- 修复策略：不改单一嫌疑点，直接恢复不变量——广播只准同步 state/ref，绝不允许因此再保存。
- TDD：先红 6 处（config-sync 签名模块缺失、use_plugins reload 引用不稳、use_config 回显深比较、main_panel pinToTop 重复调用、PopupView 挂载期保存 + 广播触发 reload），后绿。
- 实现：`renderer/lib/config-sync.ts` 新增 `plugins_structure_signature`（Round 1 review 后定为 `JSON.stringify(config.plugins)` 整体序列化，避免漏字段导致面板陈旧）；`use-plugins.reload` 值相等保引用；`use-config` 回显深比较跳过；`PopupView.apply_config` 统一「同步 ref + 条件 setState」（providerOrder/collapsed/expanded），`onConfigChange` 仅在 plugins 签名变化时 `reload()`；`main-panel-controller` pinToTop 未变不重复 `setAlwaysOnTop`。
- 既有测试适配（非逻辑变更）：`popup_view.test.tsx`「persists upcoming reset card order and expansion」原依赖挂载期副作用保存做同步点；挂载期保存被消除后，同步点移除，核心断言（点击展开→持久化 expandedProviders + providerOrder）不变。
- 既有测试基建适配：`popup_view.test.tsx` beforeEach 的 config.get/save 与 event.onConfigChange 提为模块级 mock 句柄（默认行为不变），供广播类测试捕获回调。
- 黑盒：`pnpm typecheck` ✓；`pnpm test` 178 文件 1822 测试全绿。
- 打包实测（60s 浸泡，面板 floating 可见）：`config:save` IPC 仅 1 次（启动期结构剪枝的合法收敛保存：清掉已不存在 provider 的 expanded 键，保存后即收敛）；`Reloading plugin list` 仅 1 次（挂载）；广播后 PopupView 不再 reload（plugins 签名未变）。对比修复前同窗口期 ~2000 次保存/16 分钟 19965 次。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-27 01:45 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                | fix_ref                                                                                |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| t153_code_f001 | important | 已修   | 签名改为 `JSON.stringify(config.plugins)` 整体序列化，任何插件配置变化（含 displayName/parameterValues）都触发 reload；冗余 reload 由 `use_plugins` 保引用兜底，零重渲染 | `src/renderer/lib/config-sync.ts:10-21`、`tests/unit/renderer/lib/config-sync.test.ts` |
| t153_code_f002 | important | 遗留   | PopupView 行数超阈值是存量问题（diff 前 848 行），本 task 净增 21 行属必要守卫逻辑；组件拆分是独立重构（参照 t044 先例），列入跟进 backlog                               | 收尾时补 `docs/legacy_backlog.md`                                                      |
| t153_code_f003 | important | 遗留   | 测试文件超阈值同为存量（diff 前 1421 行），新增 98 行为覆盖本 task 验收所必需；测试拆分列入跟进 backlog                                                                  | 收尾时补 `docs/legacy_backlog.md`                                                      |
| t153_code_f004 | minor     | 已修   | `prettier --write` 修复（pinToTop 守卫拼接行）                                                                                                                           | `src/main/core/main-panel/main-panel-controller.ts`                                    |

### Round 2 (2026-07-27 01:52 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                     | fix_ref                                          |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| t153_code_f005 | important | 已修   | 测试 fixture 布尔改数值（`parameterValues` 类型为 `Record<string, string\|number>`）；`pnpm typecheck` 已复绿 | `tests/unit/renderer/lib/config-sync.test.ts:45` |

### Round 3 (2026-07-27 01:55 UTC+8)

Round 3 零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 打包运行 60s（面板可见）：`config:save` IPC 次数 ≤ 5（仅启动收敛），无持续增长；`Reloading plugin list` 不出现刷屏。—— 实测两次浸泡：60s 内 1 次保存/1 次 reload；5 分钟内 2 次启动收敛保存后归零。
- [x] 面板可见时不因配置广播发生全量重渲染闪烁（`connector:list` 不随广播反复调用）。—— 广播后 PopupView 不再 reload（plugins 签名未变）；冗余 reload 由值相等保引用兜底。
- [x] 新增单元测试：广播回显不触发 persist；plugins 签名不变不触发 reload；use-config 深比较跳过相同配置。—— `config-sync.test.ts` 7 例、`use_plugins.test.ts` +2、`use_config.test.ts` +1、`popup_view.test.tsx` +3、`main_panel_controller.test.ts` +2。
- [x] `pnpm test` 全绿，`pnpm typecheck` 通过。—— 1823 测试全绿；typecheck exit 0。

### Reviewer verdict

- Round 1 code：FAIL（f001-f004，已处置）
- Round 1 test：PASS
- Round 2 code：FAIL（f005，已处置）
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- `t153_code_f002` / `t153_code_f003`：`PopupView.tsx`（869 行）与 `popup_view.test.tsx`（1519 行）超文件行数阈值，均为 diff 前存量超阈；已登记 `docs/legacy_backlog.md`，等下次大改面板时拆分。

### 结果摘要

- 修复用量面板配置保存回环（16 分钟 19,965 次 `config:save`、52MB 日志撞顶）导致的持续闪烁：广播只同步不反存、plugins 签名门槛 reload、reload/回显保引用、pinToTop 去重；打包浸泡验证收敛（60s 内 1 次合法启动收敛保存）。
