# Task review t166（reviewer_focus: 代码）

- task：`t166_collector_records_incremental`
- spec：`docs\tasks\t166_collector_records_incremental\spec.md`
- diff_anchor：`d1ef4847473baf4c3019812281c69f639fbba4ab`
- target：`git diff d1ef4847473baf4c3019812281c69f639fbba4ab`
- round：1
- reviewed_at：2026-07-31 12:35 UTC+8

## 审查范围

diff 仅触及 `src/main/core/token-stats/manager.ts`（+16 行），新增 `same_config` 与 `update_config` 去抖分支。测试侧 `tests/unit/main/core/token-stats/manager.test.ts`（+28 行）属 test reviewer 职责，本报告仅确认实现正确性。

已验证：

- `npx tsc --noEmit` 通过。
- `TokenStatsConfig`（`src/shared/types/token-stats.ts:142-156`）字段：`win_home`(string)、`wsl_enabled`(boolean)、`wsl_distro`(string)、`wsl_user`(string)、`poll_interval_ms`(number)、`state_path`(string)。全部平坦原始类型，无嵌套对象、无数组、无 `undefined`/函数/null 字段。`JSON.stringify(a) === JSON.stringify(b)` 对此类对象是可靠等值判断。
- `build_token_stats_config`（`src/main/index.ts:298-306`）用对象字面量构造，字段插入顺序固定；每次 config 保存调用同一函数，序列化键序一致。`state_path` 来自 `getTokenStatsStatePath()`（`paths.ts:28`，基于 `getDataRoot()`，运行期固定），`win_home` 来自 `homedir()`（进程期固定）-- 仅 `cfg.tokenStats.*` 子字段变化时 config 真变化，去抖命中正确。

## 生命周期与不变量核对

| 场景                                                 | `current_config`     | 行为                                                                                                              | 结论                               |
| ---------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 首次 `start(cfg)`                                    | null → cfg           | `start` 内 `child.postMessage` 初始 config                                                                        | 首次必发                           |
| `start` 后 `update_config(同cfg)`                    | cfg（非 null）       | `same_config` 命中，return                                                                                        | 正确跳过（start 已发）             |
| `update_config(异cfg)`                               | cfg（非 null）       | 不跳过，更新 `current_config`，postMessage                                                                        | 正确传播                           |
| child crash 后 30s 重启窗口内 `update_config(异cfg)` | cfg（非 null，旧值） | 不跳过；`current_config = new`；child=null 不 postMessage；30s 后 `start(current_config)` 发 new                  | 正确：窗口期更新缓存，重启后发新值 |
| rapid_failure 达阈值后 `current_config=null`         | null                 | `if (current_config && ...)` 短路为 false，不进 return；执行 `current_config = config`；child=null 不 postMessage | 安全：仅更新缓存，无副作用         |
| `stop()` 后 `update_config(cfg)`                     | null（stop 置 null） | 同上                                                                                                              | 安全                               |

无漏发、无错发。

## Findings

无。

## 结论

- 本轮新发现：0 条
- 范围收缩提示（不进 finding 表）：spec 范围含 3 项（records emit 增量化 / config 去抖 / 降 MAX_RECORDS），本 task 仅落地 config 去抖（spec:14），其余两项（records 增量化、降上限）按 `task.md` 标遗留，理由：t162/t163/t164/t165 已消除用户感知的查询/渲染端内存问题，C（records 增量协议）涉及 claude-reader + scan-state + collector 三处协议变更，风险评估高于剩余写入端收益。该裁剪是 task 管理决策（遗留机制允许），非实现层缺陷；config 去抖项（spec:14）完整落地且单测覆盖（`manager.test.ts:203-229` 两条：相同跳过、字段变化 postMessage）。若后续 task 接手 C，建议同步评估 WAL 88MB 与单日 15 次 20 万 records 突发是否仍成立。
- 实现正确性：`same_config` 对平坦原始 config 可靠；去抖逻辑在 start/crash 重启/stop/rapid-failure 全路径下行为正确；无副作用、无漏发。
- 代码质量：`update_config` CC=2（一个 early return），`same_config` CC=1，远低于阈值；manager.ts 201 行，未膨胀；命名准确；无死代码、无 DRY 违反。
- 总体判断：放大器 D 实现完整、正确、测试覆盖到位，零 finding。

verdict: PASS
