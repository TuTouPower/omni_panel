---
tid: "t267"
slug: "electron_e2e_plugin_config_isolation"
title: "electron e2e plugin_config 完整套件隔离修复"
status: "done"
branch: "t267_electron_e2e_plugin_config_isolation"
worktree: ""
review_level: "single"
diff_anchor: "29ad7981a7fff7a5153b3c69717aeabc712c2602"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- SPIKE：本机完整 electron e2e 连跑 3 次均 43 passed，未复现 plugin_config 失败；但 run 2 出现 snapshot-cache.json rename ENOENT（writeJsonAtomic 失败）——`closeApp` 后仍有子进程写已关闭 userData 目录，证实 Electron 子进程在 Playwright `app.close()` 后未完全退出。
- 修复 1（进程残留）：`closeApp` 在 `app.close()` 后等待主进程 exit 事件（3s 超时才 kill 兜底，kill 后同样等 exit）。close 前捕获 process 引用（close 后 app.process() 返回 undefined）。
- review f002/f003 揭示真实根因（用户授权扩范围修生产 bug）：reviewer 实证保存偶发不落盘。深入定位出**双根因**：
    1. **生产 bug**：`CpaConnectorSettings` 的 useEffect 依赖含 `config`，config 变化（保存 echo / 外部广播 / connector 刷新）时 `setEndpoint(config.endpointOverrides.default ?? metadata.default)` 覆盖用户编辑中的输入，值回退默认 17863，保存被静默跳过（configChanged false）。修复：effect 去掉 setEndpoint 与 config 依赖，仅 `[connector.instanceId, hasSecrets, displayName]` 触发（displayName 同步 alias、hasSecrets 同步密钥，config 变化不重置表单）。
    2. **测试输入竞态**：React 受控 input 在 Playwright fill/pressSequentially 下偶发不触发 onChange——fill 后 DOM value 恒默认（onChange 未进 state）、pressSequentially 产生光标拼接（`178`+新值+`63`）。修复：`set_react_input` helper 用 `nativeInputValueSetter` + 派发 input/change 事件（React 受控组件可靠设值）。
- 修复后验证：plugin_config 单跑 12 次全过（原 ~10-20% 偶发消除）；完整 electron e2e 连跑验证。
- p093 内容修订：根因从「保存链路偶发不落盘」更新为「受控 input onChange 竞态 + effect 覆盖」，已随本 task 修复。

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

### Round 1 (2026-08-08 20:10 UTC+8)

| finding_id    | severity | status | rationale                                                | fix_ref         |
| ------------- | -------- | ------ | -------------------------------------------------------- | --------------- |
| t267_gen_f001 | minor    | 已修   | kill 兜底后未等 exit；改 wait_for_exit，kill 后也等 exit | electron_app.ts |

### Round 2 (2026-08-08 20:20 UTC+8)

| finding_id    | severity  | status | rationale                                                           | fix_ref               |
| ------------- | --------- | ------ | ------------------------------------------------------------------- | --------------------- |
| t267_gen_f002 | important | 已修   | 保存后确定性等待 config.json 落盘；根因深化为生产 bug（见 Round 3） | plugin_config.spec.ts |

### Round 3 (2026-08-08 21:00 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                        | fix_ref                                          |
| ------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| t267_gen_f003 | important | 已修   | 生产 bug：CpaConnectorSettings effect 依赖 config 覆盖用户输入；去 config 依赖不重置 endpoint。测试输入改 nativeInputValueSetter（受控 input onChange 可靠触发） | CpaConnectorSettings.tsx / plugin_config.spec.ts |

### Round 4 (2026-08-08 21:30 UTC+8)

| finding_id     | severity | status | rationale                                                                                | fix_ref               |
| -------------- | -------- | ------ | ---------------------------------------------------------------------------------------- | --------------------- |
| t267_gen_f004  | minor    | 已修   | spec 非范围/依赖约束过时（基线「非生产 bug」被 f003 证伪，用户授权扩范围）；改 spec 反映 | spec.md               |
| t267_gen_f005  | minor    | 已修   | set_react_input 死参数 page；删除                                                        | plugin_config.spec.ts |
| t000_test_f002 | minor    | 遗留   | 一句话                                                                                   | pNNN                  |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1（完整 e2e 连续 3 次通过）：完整 `pnpm test:e2e:electron` 连跑 3 次均 43 passed。
    - AC2（plugin_config 单跑通过）：单跑 12 次全过（原 ~10-20% 偶发消除，reviewer 独立 12/12）。
    - AC3（无削弱断言/无界 sleep）：确定性条件等待（poll config.json 落盘、wait_for_exit 进程退出、toHaveValue 输入生效、nativeInputValueSetter 可靠设值），无删除断言。

### Reviewer verdict

`single`：

- Round 1 general：PASS（f001 minor 已修）
- Round 2 general：FAIL（f002 important：保存被 shutdown 打断——后证伪）
- Round 3 general：FAIL（f003 important：生产保存链路偶发不落盘——根因实证）
- Round 4 general：PASS（f002/f003 双根因修复有效，reviewer 独立 12/12 + 38 单测；f004/f005 minor 已修）

### 结果摘要

- 修 electron e2e plugin_config 偶发失败：harness closeApp 确保进程退出；深入定位出生产 bug（CpaConnectorSettings effect 覆盖用户输入）+ 测试输入竞态（受控 input onChange 不可靠），用户授权扩范围修复。p093 闭环，d029 登记。
