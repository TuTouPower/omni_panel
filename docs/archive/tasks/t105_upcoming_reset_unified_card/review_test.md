# Task review t105（reviewer_focus: 测试）

- task：`t105_upcoming_reset_unified_card`
- spec：`docs/tasks/t105_upcoming_reset_unified_card/spec.md`
- diff_anchor：`2da273457b9ccea6c8a8690d8881b0da49a90366`
- target：`git diff 2da273457b9ccea6c8a8690d8881b0da49a90366`
- round：3
- reviewed_at：2026-07-25 12:50 UTC+8

## Findings

零 finding。

## 结论

### 前轮 finding 复核

#### Round 2（f006、f007）

| finding                                                                    | 结论 | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| t105_test_f006（`scheduleSave` thunk 回归只覆盖 store 半边，调用点无测试） | 已修 | 新增 `tests/unit/main/config-save-wiring.test.ts:41-64`。镜像 `src/main/index.ts:453`/`:576` 的 bounds-save wiring 形态：`let current_config_snapshot` + `scheduleSave(() => current_config_snapshot)`，在 debounce 窗口内（`advanceTimersByTimeAsync(100)`）改写 `providerOrder` / `expandedProviders`，推进到 500ms 后断言落盘 JSON 反映改写后的值。该测试对两类回归有效：(a) `config-store.scheduleSave` 完全退回值语义——`save(thunk)` 会让 `JSON.stringify(function)` 返回 `undefined`，`JSON.parse` 抛错；(b) thunk 在调度期提前解析（`const resolved = typeof cfg === "function" ? cfg() : cfg`）——落盘的是旧快照，`expect(written.providerOrder).toEqual(["__upcoming_reset__","claude"])` 红。镜像模式的固有限制（不能直接捕获 `index.ts` 把 thunk 改回值的回归）与仓库既有先例 `tests/unit/main/popup_suppress_move.test.ts` 一致，且 thunk 解析契约由本测试 + `config-store-debounce.test.ts:80-107`（Round 2 已加）双重钉住，属可接受折中。 |
| t105_test_f007（spec 要求的「状态裁剪保留 `__upcoming_reset__`」无测试）   | 已修 | 新增 `tests/unit/renderer/views/popup_view.test.tsx:1177-1289`（`"preserves upcoming reset card expansion across provider data refresh"`）。测试用 2 个 account（acc-a、acc-b）挂载，展开卡片，再通过 `on_state_change_cb("gateway-connector", { items: [仅 acc-a] })` 触发 `use-plugins` 的 snapshot 更新 → `providerGroups` 重算 → `structural_signature` 从 `claude:acc-a,acc-b` 变为 `claude:acc-a`。`PopupView.tsx:306-334` 的 useEffect 满足 `prev !== signature && prev !== ""`（首次加载时 prev 已被设为 `claude:acc-a,acc-b`，非空），进入裁剪分支而非提前 return。若从 `PopupView.tsx:320-326` 的 `live_providers` 集合删掉 `UPCOMING_RESET_CARD_ID`，裁剪会移除 `expanded_providers.__upcoming_reset__`，`expanded` 变 false，`折叠即将重置` label 变 `展开即将重置`，`:1287` 的 `expect(screen.getByLabelText("折叠即将重置")).toBeInTheDocument()` 红。裁剪分支确实被走到。                                                               |

无「换形式弱化」情况：两条新测试均使用 `toEqual` 精确断言（`config-save-wiring.test.ts:62-63`）或 `getByLabelText` 行为断言（`popup_view.test.tsx:1254`、`:1287`），无 `.skip` / `.only` / `@ts-ignore` / `eslint-disable` / 恒真断言 / 注释掉的 expect / `if` 条件跳过断言。`config-save-wiring.test.ts:60` 的 `vi.mocked(writeFile).mock.calls[0]?.[1] as string` 是读取边界 mock 调用参数的标准写法，非弱化；若 `writeFile` 从未被调用，`JSON.parse(undefined)` 会抛错而非静默通过。

#### Round 1（f001–f005，Round 2 已复核通过）

Round 2 已全部判定「已修」，本轮 diff 未再触及这些测试覆盖的范围，结论不变。

### 本轮新发现

0 条。

### 总体判断

Round 2 的两条 finding 均已实质修复：f006 的 mirror-wiring 测试能钉住 thunk 解析契约（store 侧两类回归均会红），其「不能直接断言 index.ts 调用点传值」的局限与 `popup_suppress_move.test.ts` 先例一致，属可接受；f007 的新测试确实走到裁剪分支（首次加载 signature 非空、refresh 改变 signature），移除 `UPCOMING_RESET_CARD_ID` 即红。无新发现。

verdict: PASS
