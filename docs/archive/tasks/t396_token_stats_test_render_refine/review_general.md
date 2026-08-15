# Task review t396（reviewer_focus: 通用）

- task：`t396_token_stats_test_render_refine`
- spec：`docs/tasks/t396_token_stats_test_render_refine/spec.md`
- diff_anchor：`c2ffe16cf151b7030359bc71bfd57cb95db0631b`
- target：`git diff c2ffe16cf151b7030359bc71bfd57cb95db0631b`
- round：1
- reviewed_at：2026-08-15 10:05 UTC+8

## 验证方式

只读审查。实际跑通：`pnpm vitest run` 相关 3 文件（manager 21、build-config 3、palette 7）与 token-stats 全组 + ipc（共 137 tests）全绿；`pnpm typecheck` 通过；`eslint --max-warnings=0` 改动文件无告警。逐条 AC 均对照源码 + 测试做破坏性推理（删除关键置位/断言测试必挂）。

## Findings

### t396_gen_f001 - 模块缓存注释与 AC-004 后的实际 key 不一致

- 严重度：minor
- 锚点：文档/代码一致性（评审要点「JSDoc 与代码一致」）
- 位置：`src/renderer/lib/echarts_token_resolver.ts:310-312`
- 问题：t350 遗留模块注释仍写「模块级 palette 缓存，key = `${theme}:${revision}`」，但 AC-004 已将 key 改为 `${theme}:${revision}:${root_signature}`（`:318`）。注释描述与实现不符，后续维护者据注释推断 key 语义会得出错误结论。
- 建议：把注释更新为包含 root 签名（可补一句「不同 root 不同 key，防止跨 root 复用首次构建 palette」）。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
  - `manager.test.ts:503-524`「clears pending restart timer on config update after exit (t347 f003)」仍裸用 `vi.useFakeTimers()` 无 try/finally。属既有测试，未被 t396 触碰，不在 AC-002 要求范围；仅作观察，不构成 finding。
  - `src/main/index.ts:495-496` `session_history_locator_paths` 重复推导 `wsl_distro/wsl_user` 默认值（"Ubuntu-22.04"/""），与 `build-config.ts` 的默认值形成两处真源。属既有代码，非 t396 引入；AC-005 收敛默认值后建议后续统一。
  - `is_tripped()` 目前仅测试消费，无生产调用方接 IPC/UI。spec 明确「API 或探针」即可，满足；留作扩展观察。
- 总体判断：5 条 AC 全部实现且测试可信，无越界改动；仅 1 条 minor 注释陈旧，PASS。
- 系统性 follow-up：无

## AC 核对明细

- **AC-001**：`manager.test.ts:480-501` 5000 sessions → 3 批，断言 `toHaveBeenCalledTimes(3)` + `calls[0]/[1][2]===false` + `calls[2][2]===true`，真锁定「仅末批 rebuild」。实现 `manager.ts:102` `is_last = offset + UPDATE_BATCH_SIZE >= total`。
- **AC-002**：`manager.ts` `is_tripped()` 加入接口与实现；`tripped` 熔断跳闸置 true（`:203`）、`start()`（`:132`）/`stop()`（`:282`）复位；update_config 恢复路径经 `start()` 复位（`:268`）。测试：A14 用例熔断后 `is_tripped()===true`、stop 后 `===false`；t347 AC-003 用例熔断后 `===true`、update_config 恢复后 `===false`。两熔断用例均 try/finally 包 fake timers（t347 用例本轮从裸 useFakeTimers 改 finally）。破坏性推理：删 `tripped=true` → is_tripped 断言挂；删 stop 复位 → 断言挂。
- **AC-003**：`chart-data.ts:870-872,889-891` 两处轴查找改预构建 Map（dir→index、session key→index），`?? -1` 与 `indexOf/findIndex` 未命中返回 -1 一致；groupBy 产出 key 唯一，Map 无重复覆盖语义差；输出不变（chart-data.test.ts 65 全绿）。与 `prepareBarData`（`:141-142,146-148`）模式一致。
- **AC-004**：`echarts_token_resolver.ts:315-319` key 纳入 `root_signature`（data-theme/class/style）；不同 class root → 不同 key。测试 `palette.test.ts:180-208`：rootA 构建后 rootB（class 不同）重建（spy 计数 >0）、rootA 再 resolve 命中缓存（spy 计数 0）。破坏性推理：旧 key（无 root）下 rootB 命中 rootA 缓存、`toBeGreaterThan(0)` 必挂，测试真锁定隔离。现有调用方（`palette_for/top_category_color/agent_color/use_chart_palette`）均走默认 `current_root()`，行为不变；既有 t350 用例保持绿。
- **AC-005**：`build-config.ts`（新）抽导出，逻辑与 index.ts 原内联闭包逐字段一致（默认值、homedir()/getTokenStatsStatePath() 调用时机不变）；`index.ts:434,566` 两调用点改走 import，删内联闭包与 unused import。类型 `Pick<AppConfiguration,'tokenStats'>` 与调用方 `AppConfiguration` 兼容（typecheck 通过）。测试 3 用例：空 tokenStats 默认值、持久化值覆盖、部分字段缺省独立性，触达默认+持久化+独立三分支。
- **范围外**：未触碰查询/聚合行为、dashboard 读取路径、其它渲染组件重构；无偏航。
- **handoff.json**：`ac_evidence` 键精确为 AC-001..005，与实现证据一致；`base_sha` 与 diff_anchor 一致。

verdict: PASS

reviewed_scope: a493104958a6aebf
