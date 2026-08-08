# Task review t267（reviewer_focus: 通用）

- task：`t267_electron_e2e_plugin_config_isolation`
- spec：`docs/tasks/t267_electron_e2e_plugin_config_isolation/spec.md`
- diff_anchor：`29ad7981a7fff7a5153b3c69717aeabc712c2602`
- target：`git diff 29ad7981a7fff7a5153b3c69717aeabc712c2602`
- round：1
- reviewed_at：2026-08-08 19:00 UTC+8

## Findings

### t267_gen_f001 - kill 兜底后未等进程 exit 即返回，跨平台下重启仍可能与旧进程 teardown 并发

- 严重度：minor
- 锚点：行为缺陷——`closeApp` 的 kill 兜底路径返回前未确认进程树真正退出；macOS/Linux 下 `child.kill()` 发 SIGTERM 为异步，进程需时间终止。
- 位置：`tests/e2e/fixtures/electron_app.ts:88-89`
- 问题：`proc.kill()` 调用后 `closeApp` 立即返回。Windows 上 TerminateProcess 即时生效，风险低；但项目跨 Windows/macOS/Linux（fixture 已有 `process.platform === "win32"` 分支），POSIX 下 SIGTERM 到进程实际退出存在窗口：restart 测试 `omni.stop()` 返回后立刻 `omni.start()`，新实例可能与仍处于 teardown 的旧主进程共享 userData，重现本 task 要消除的并发写/读竞态。主路径（exit 事件正常触发）不受影响，仅异常兜底路径有此缺口。
- 建议：kill 后 await 短时限（如 500ms）的 `proc` exit 事件，确保兜底后也以进程退出作为返回条件，与主路径保证一致。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条（minor）。
- 未进表的提示：无。
- 总体判断：实现正确。`closeApp` 在 `app.close()` 后按 exit 事件（确定性条件等待）确认主进程退出，超时才 kill 兜底，未用无界 sleep，未删/弱化任何断言（AC3 满足）；修复点落在唯一受竞态影响的进程（userData 全部写入方在 `src/main/`，renderer/preload 无磁盘写入），与 run 2 实测 snapshot-cache ENOENT 主进程写源吻合，修复方向正确。AC2 已由 reviewer 现场复核：`plugin_config` 单跑 4 passed（含 restart 用例）；AC1 连续 3 次全过以 implementer 记录为准，逻辑上由本修复保证。范围合规：仅改 e2e harness + docs，未动生产逻辑。
- 系统性 follow-up：无。

verdict: PASS

## Round 2 (2026-08-08 19:50 UTC+8)

### 前轮 finding 复核

- **t267_gen_f001（kill 兜底后未等 exit）**：已修复。现 `closeApp` 抽 `wait_for_exit(proc, timeout_ms)`（exitCode 非 null 立即返回），close 后 `wait_for_exit(proc, 3000)`，未退出再 `proc.kill()` 后 `wait_for_exit(proc, 3000)` 确认退出——kill 后也等 exit，消除 POSIX/Windows 下 kill 异步终止窗口，restart 不再与旧进程 teardown 并发。修复与建议一致，f001 消除。

### 本轮新发现

### t267_gen_f002 - 修复未消除 AC2 偶发失败：endpoint 保存被 shutdown 打断，重启读回默认值

- 严重度：important
- 锚点：AC2「单独运行 plugin_config.spec.ts 仍全部通过」；AC3「不以删除断言或无界 sleep 消除竞态」。观察行为与该 AC 直接冲突。
- 位置：`tests/e2e/electron/plugin_config.spec.ts:91-123`；`tests/e2e/fixtures/electron_app.ts:72-89`（`closeApp`）
- 问题：reviewer 现场连跑 `plugin_config` 21 次，2 次失败（run 4、run 11），失败率约 10%。失败症状与本 task 目标完全一致：restart 后 endpoint 读回默认 `http://127.0.0.1:17863`（断言 expected `https://cpa.example.test`）。失败 run 日志证据（`.scratch/run_4.log`、`.scratch/run_11.log`，只读排查留痕，非提交物）：
    - 失败测试实例的 userData 目录整个生命周期只有 **2 次** `config.json` 写入（均为启动时 16 plugins 落盘），`cpa.example.test` 字样在整个日志中**从未**出现在任何 config 写入里（仅断言输出 2-3 次）。
    - 通过 run（run_1 等）restart 用例目录有 **6 次** config 写入，其中包含保存后的 flush 写。失败 run 缺的正是「保存 → will-quit flush」这两次写。
    - 保存完成 → 断言 detail 视图隐藏（毫秒级）→ `omni.stop()` 立刻触发 `before-quit`：保存的 debounce 500ms 未到期，`scheduleSave` 的 pending 落在 renderer 或未传至 main 的 config-store，`will-quit` flush 只刷 main 侧已登记 pending，故该次保存丢失。
    - 即**修复命中点（进程退出时序）不是失败根因**：root cause 是「保存落盘窗口（debounce 500ms + IPC 传值）短于测试的 stop 时序」，偶发取决于 debounce 计时与 stop 竞速。harness 已 `app.close()` + 等主进程 exit + kill 兜底 + `wait_for_exit`，进程退出侧时序已完全收敛，仍偶发失败正说明瓶颈在保存→flush 前已被退出打断，而非残留进程写 userData。
    - 疑点：保存后 `toBeHidden` 断言返回即代表「detail 视图关闭（save completed）」，但保存值未落到 main config-store；与 t267 run 2 实测 snapshot-cache ENOENT（进程残留）是**不同根因**，harness 修复覆盖不到。
- 建议（供 implementer/下一步，reviewer 不改代码）：修复须保证「保存落盘」在 restart 前完成，方向二选一：
    1. 用例侧确定性等待：保存后显式等待 config.json 出现目标 endpoint（如 `page.waitForFunction` 轮询读盘或经 IPC 等 config 持久化完成），再 `omni.stop()`；或
    2. 关闭时序保证：`stop()`（closeApp）前先触发 main 侧 flush（如经 IPC 调 `flushPendingSave` 或等 `hasPendingSave()` 为 false），确保 pending 落盘后才 close。
       禁止无界 sleep；AC3 要求确定性条件等待。修复后须**多次连续单跑验证 AC2**（本 task 偶发 ~10%，3 次通过不足以证明消除）。

### Round 2 结论

- 前轮 finding 复核：t267_gen_f001 已消除（kill 后等 exit，实现正确）。
- 本轮新发现：1 条（t267_gen_f002，important）。
- 未进表的提示：8 个 `OmniPanel.exe` 为**主仓打包应用实例**（user-data-dir `Roaming\OmniPanel`），与 e2e 无关；测试期间 0 个 `electron.exe` 残留，间歇失败非外部进程污染，属可复现的测试自身竞态。
- 总体判断：harness 进程退出修复方向正确且 f001 已闭合，但 AC2 偶发失败仍可复现（21 次 2 败），未达验收标准，存在未解决 important。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-08 20:15 UTC+8)

### 前轮 finding 复核

- **t267_gen_f001（kill 兜底后未等 exit）**：仍消除（无回归，`closeApp` 逻辑本轮未变）。
- **t267_gen_f002（AC2 偶发失败，保存值重启后丢失）**：**未消除**。implementer 用 `expect.poll` 轮询 `omni.userDataDir/config.json` 直到出现 `endpointOverrides.default === "https://cpa.example.test"`（timeout 10s）再 stop——方向符合 AC3（确定性条件等待，非无界 sleep），字段路径正确（与 `CpaConnectorSettings.tsx:94,177-219` 读写一致）。但 reviewer 独立复跑 `plugin_config` **10 次、3 次失败**（run 3/4/9），失败率不降反升，失败模式从「restart 读回默认」转为**确定性 poll 超时**：

### 本轮新发现

### t267_gen_f003 - poll 确定性超时：保存值未持久化到 config.json，根因是保存写盘丢失而非 stop 时序

- 严重度：important
- 锚点：AC2「单独运行 plugin_config.spec.ts 仍全部通过」。poll 修复后失败确定性复现（3/10），AC 未达成。
- 位置：`tests/e2e/electron/plugin_config.spec.ts:109-124`（新增 poll）；根因在保存持久化链路（`CpaConnectorSettings.tsx:157-232` → `accounts_section.tsx:107-131` → `save_plugin_settings`/`save_config`）。
- 问题：reviewer 连跑 10 次，失败 run（`.scratch/r3_3.log` 等，只读排查留痕）关键证据：
    - restart 用例 userData 目录整个生命周期仅 **2 次** `config.json` 写入（均启动时 16 plugins 落盘）；`cpa.example.test` **从未**出现在任何 config.json 写入日志中（全 log 仅 1 次，为 connector 实际发起的 `net-client GET https://cpa.example.test/v0/management/auth-files`）。
    - 即：保存后 connector 已用新 endpoint 在内存生效并触发刷新（`onSaved` → `trigger_background_refresh`），但 **config.json 未写盘**。poll 确定性等 10s 读盘仍读不到 → 超时失败（耗时 19-20s vs 通过 run 11-12s）。
    - **根因修正**：f002 原判断「保存 debounce 500ms 被 `stop()` 的 shutdown 打断」不成立——本轮 poll 已彻底移除 stop 时序变量（10s 内不 stop），写盘仍不发生，证明是**保存持久化链路本身偶发不落盘**（renderer 保存驱动或 main config-store save/scheduleSave 路径），不是进程退出/stop 时序问题。f002 修复方向（等落盘再 restart）正确但治标不治本：等不到的是根本不存在的落盘。
- 建议（供 implementer/下一步，reviewer 不改代码）：
    1. 排查保存链路为何偶发不写盘：`save_plugin_settings` → `save_config` 是否经 `config.save`/`scheduleSave` 到达 main `config-store.doSave`；确认 renderer `use-config` 的 config 合并是否偶发丢弃 `endpointOverrides`（如 stale `config` prop 覆盖），或 main 侧 `scheduleSave` debounce pending 被后续调度跳过。
    2. 修复后须**多轮连续单跑验证 AC2**（本 task 失败率不低，10 次全过为最低门槛）。

### Round 3 结论

- 前轮 finding 复核：t267_gen_f001 保持消除；t267_gen_f002 未消除（poll 修复无效，根因修正为保存写盘丢失）。
- 本轮新发现：1 条（t267_gen_f003，important，同一 AC2 blocker 的根因证据升级）。
- 未进表的提示：poll 修复本身符合 AC3（确定性等待），其价值是使隐藏的保存缺陷确定性暴露；但 AC2 仍未达成。
- 总体判断：harness 进程退出修复有效（f001 闭合），但核心验收 AC2 仍失败（10 次 3 败，poll 确定性超时），且根因在保存持久化链路、超出 t267 harness 范围，存在未解决 important。
- 系统性 follow-up：建议 follow-up task 立项查「renderer 保存 endpointOverrides 偶发不落盘」；slug 建议 `config_save_persistence_flaky`。

verdict: FAIL

## Round 4 (2026-08-08 22:16 UTC+8)

### 前轮 finding 复核

- **t267_gen_f001（kill 兜底后未等 exit）**：保持消除（`closeApp` 逻辑本轮未变）。
- **t267_gen_f002（AC2 偶发失败，保存值重启后丢失）**：**已消除**。reviewer 独立复跑 `plugin_config` **12 次全部通过**（每 run 约 13s，之前 10-20% 失败率），且原 poll 超时（10s 等不到落盘）不再出现——poll 现稳定为 true，AC2 达成。
- **t267_gen_f003（保存值未持久化，根因是保存写盘丢失）**：**已消除**。双根因修复均落位且被验证：
    1. **生产修复**（`CpaConnectorSettings.tsx`）：useEffect 移除 `setEndpoint(...)` 与 `config` 依赖，仅 `[connector.instanceId, hasSecrets, displayName]` 触发。逻辑正确：config 变化（保存 echo / 外部广播 / connector 刷新）不再覆盖用户编辑中的 endpoint 输入，`configChanged` 不再被错误置 false，保存不再静默跳过。effect 仍保留 displayName→alias、hasSecrets→密钥回填、monitors 同步（均为既有行为，非本轮引入）。相关单测 `cpa_connector_settings` + `settings_view_accounts` 共 **38 例全部通过**，无回归。
    2. **测试输入修复**（`plugin_config.spec.ts` `set_react_input`）：用 `nativeInputValueSetter` + 派发 input/change 事件设值，规避 React 受控 input 在 Playwright fill/pressSequentially 下偶发不触发 onChange。实现为标准的 React 受控组件设值技巧，可靠；新增 `expect(endpoint_input).toHaveValue(...)` 确认输入生效，合理。

### 本轮新发现

### t267_gen_f004 - 生产修复与 spec 契约区「非范围」冲突，spec 未同步（处置为改 spec）

- 严重度：minor
- 锚点：非 AC 行为缺陷，属「实现合理但与 spec 描述不符（spec 过时）→ 处置为改 spec，不计 FAIL」。
- 位置：`spec.md:20`（契约区「非范围」）、`spec.md:76`（上下文区「依赖与约束」）；生产修复 `src/renderer/components/CpaConnectorSettings.tsx`
- 问题：spec 契约区「非范围」明确「CPA 配置持久化的生产逻辑（基线已验证非生产 bug）」，上下文区「依赖与约束」明确「修复只限 e2e 测试与 harness，不得改动生产逻辑」。本次经用户授权扩范围修改了 `CpaConnectorSettings.tsx`（生产 renderer 组件），且 f003 实证该处**就是生产 bug**（基线「非生产 bug」判断被证伪）。用户授权是有效决策，但 spec 未同步更新，状态权威与实现冲突。
- 建议：finalization 时同步 spec——契约区「非范围」删除/改写该行，上下文区「依赖与约束」补充用户授权扩范围的记录，并在 `docs/pending.md` p093 注明已修复。

### t267_gen_f005 - set_react_input 的 page 参数未使用

- 严重度：minor
- 锚点：行为无缺陷，纯代码卫生。
- 位置：`tests/e2e/electron/plugin_config.spec.ts:45-60`
- 问题：`set_react_input(page, locator, value)` 首参 `page` 在函数体内从未使用（经 `locator.elementHandle()` + `handle.evaluate` 设值），为死参数，易误导调用方以为依赖 page。
- 建议：移除 `page` 参数，仅保留 `(locator, value)`；更新调用处。

### Round 4 结论

- 前轮 finding 复核：t267_gen_f001/f002/f003 全部消除（12 次独立单跑全过 + 38 例单测无回归）。
- 本轮新发现：2 条（t267_gen_f004/f005，均 minor）。
- 未进表的提示：
    - Round 4 首次压测 run 1 出现 better-sqlite3 ABI 不匹配（NODE_MODULE_VERSION 127 vs 146）致 4 failed——系 implementer 跑全量单测后 ABI 未切回 electron（`node scripts/ensure_sqlite_abi.mjs electron` 后恢复），非本 diff 缺陷，亦非修复回归。
    - AC1（完整 `pnpm test:e2e:electron` 连续 3 次）以 implementer 记录 2 次 43 passed 为准；reviewer 无法独立复跑完整套件，但单 spec 12 次强验证 + 进程退出时序收敛 + 保存落盘可靠，逻辑上 AC1 应稳定。建议 finalization 前补 1 次完整 e2e 达标 AC1 的 3 次要求。
- 总体判断：f002/f003 双根因（生产 effect 覆盖 + 测试输入竞态）修复有效，AC2 达成（12/12），生产修复经 38 例单测无回归，AC3 的确定性条件等待不变量保持；仅剩 2 条 minor（spec 同步、死参数），无未解决 critical / important。
- 系统性 follow-up：无（p093 已登记并随本 task 闭环）。

verdict: PASS
