# Task review t293（reviewer_focus: 测试）

- task：`t293_config_save_conflict_cache_stale`
- spec：`docs/tasks/t293_config_save_conflict_cache_stale/spec.md`
- diff_anchor：`4c98f4f789c6d73c4b874df28948fcd3df3388fc`
- target：`git diff 4c98f4f789c6d73c4b874df28948fcd3df3388fc`
- round：1
- reviewed_at：2026-08-11 02:20 UTC+8

## Findings

无（clean review，0 finding）。

逐维度核实结论：

- **AC-001（重叠 CONFIG_SAVE 后写拒绝/合并，先写不丢）**：两层覆盖。config-store 集成测试 `rejects an overlapping save that committed after the caller loaded (lost update guard)`（`tests/integration/config/config-store.test.ts:809`）用同一 `base` 并发驱动两个 `saveIfBaseMatches`，断言恰一 saved、恰一 conflict，且 final 落盘 = 先写者变更（`language` 变、`launchAtLogin` 保持旧值），后写变更被拒绝而非静默覆盖——直接验证「内存缓存不再击败冲突检测」的核心机制（队列内读 `cached_config`，第二个在第一个提交后被拒）。config-ipc 单测 `handleConfigSave returns CONFLICT when a concurrent save committed (lost update guard)`（`tests/unit/ipc/config-ipc.test.ts:885`）mock store 返回 `"conflict"`，断言 `result.ok === false` + `error.code === "CONFLICT"` + `save` 未被调用，验证 IPC 层映射。
- **AC-002（最终落盘 = 按序执行结果，非 flaky）**：队列串行化使两调用严格按序执行（`saveTail.then` 链），结果确定性，无计时依赖；集成测试断言 final 与 winner 一致即「按序执行」语义。已连续运行多遍通过，非 flaky。
- **AC-003（单线程正常 save 行为不变，既有测试全绿）**：实测受影响 13 个测试文件 259 用例全部通过，含 `tests/integration/connector/grok_oauth_account_lifecycle.test.ts`（真实 `createConfigStore` + `handleConfigSave` 的组合路径）与 config-store-debounce / config-save-wiring。单窗口正常路径 `current`（load 返回的 `cached_config` 同引用）与队列内 `committed` 恒等，`JSON.stringify` 比较不误报。
- **测试可信**：冲突检测核心（`enqueueCompareAndSave`）未被 mock，store 集成测试走真实临时文件；mock 仅出现在 IPC/其它模块的 store 边界。CONFLICT 测试外层有硬断言 `expect(result.ok).toBe(false)`，内层 `if (!result.ok)` 条件块不构成「前置不满足无证据 PASS」。
- **改测方向复核**：迁移断言 `save.mock.calls[0][0]` → `saveIfBaseMatches.mock.calls[0][1]` 是接口从 `save(config)` 变为 `saveIfBaseMatches(base, config)` 后的合法语义迁移，断言对象仍是「将要持久化的 config」同属性（密钥剥离、accountOrders 合并、collapsedAccounts 保留、schema 清洗、plugins 保护），强度未降。CONFLICT 测试由「二次 load 模拟并发」改为「mock 返回 conflict」，断言的是同一用户可观察行为（并发写 → CONFLICT），仅替换触发机制，属「新语义新测试」而非「迁就实现」。
- **危险模式扫描**：未命中 `.skip/.only`、`@ts-ignore`、`eslint-disable`、恒真断言、删/反转/注释断言、弱化断言、mock 核心逻辑、阈值掩盖、`expect().toBeVisible()` 作唯一证据。`expect(saved).toBeDefined()` 均为后续实属性断言前的守卫，非「存在即通过」。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无「迁就实现」的改测。既有断言迁移与 CONFLICT 测试重写均保留原用户可观察语义，仅随接口与机制调整；已逐条对照 anchor 版本确认无断言删除或强度下降。
- 本轮新发现：0 条
- 未进表的提示：
    - 测试策略字面写「config-ipc 并发 save 用例（重叠 save + 延迟完成）」，实际并发重叠在 config-store 层覆盖（真实队列串行化，无需显式延迟完成控制），config-ipc 层只测单次 conflict 映射。行为语义等价，不作 finding。
    - `enqueueCompareAndSave` 冷缓存路径（`cached_config ?? load_uncached()`）与「`save`/`scheduleSave` 与 `saveIfBaseMatches` 交错」场景未直接测；两场景机制同源（队列 + `cached_config`），非 AC 必需，可选扩展。
    - CONFLICT 测试 `toHaveBeenCalledWith(expect.anything(), expect.anything())` 参数断言弱，但外层硬断言 `result.ok === false` + CONFLICT code 已覆盖映射正确性，不削弱。
- 总体判断：AC-001/002/003 均有真实、确定性、非 mock 核心的测试覆盖，危险模式零命中，改测均为合法迁移；可通过。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 33e75d02f85184ff
