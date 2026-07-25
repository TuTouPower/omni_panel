# Task review t105（reviewer_focus: 代码）

- task：`t105_upcoming_reset_unified_card`
- spec：`docs\tasks\t105_upcoming_reset_unified_card/spec.md`
- diff_anchor：`2da273457b9ccea6c8a8690d8881b0da49a90366`
- target：`git diff 2da273457b9ccea6c8a8690d8881b0da49a90366`
- round：3
- reviewed_at：2026-07-25 12:50 UTC+8

## Findings

（本轮无新 finding。）

## 结论

### 本轮范围

Round 3 开轮目标：核实 Round 2 TEST 两条 finding（f006/f007）的测试修复是否落地、是否与代码契约一致。自 Round 2 以来 `src/` 零改动，唯一变化：

1. 新增 `tests/unit/main/config-save-wiring.test.ts`（f006 修复）。
2. `tests/unit/renderer/views/popup_view.test.tsx` 新增 `preserves upcoming reset card expansion across provider data refresh` 用例（f007 修复）。
3. `task.md` 过程记录 + 处置表追加。

对 CODE 维度，只需确认新测试不与代码契约矛盾，且未引入新代码侧问题。

### f006 修复核实（`tests/unit/main/config-save-wiring.test.ts`）

测试钉的契约：`scheduleSave` 接受 thunk，在 debounce 触发时（而非调度时）解析 payload。

- `config_store.scheduleSave(() => current_config_snapshot)`（test:50）镜像 `src/main/index.ts:453` `save_settings_bounds` 与 `:573` `save_config` 的 wiring 形态——两处均传 `() => currentConfigSnapshot`，与测试一致。
- 测试在 `advanceTimersByTimeAsync(100)` 后变更 snapshot（`providerOrder` 追加 `__upcoming_reset__`、`expandedProviders` 新增保留键），再推进 500ms 触发默认 debounce，断言落盘 JSON 反映变更后的值——精确复现 Round 1 过程记录中「bounds 快照回滚 renderer 写入」缺陷的修复语义。
- `config-store.ts:285-294` timer 回调 `this.save(typeof cfg === "function" ? cfg() : cfg)` 与 `:302-307` `flushPendingSave` 的同形分支均覆盖；thunk 在两条落盘路径都正确解析。
- 注释明确说明「index.ts 调用点不直接 import，测试钉住其依赖的 thunk 契约」，与 `popup_suppress_move.test.ts` 的 mirror-wiring 模式一致，不假装覆盖 index.ts 胶水本身。

契约对齐，无矛盾。

### f007 修复核实（`tests/unit/renderer/views/popup_view.test.tsx:1177-1289`）

测试钉的契约：结构裁剪必须保留 `__upcoming_reset__` 展开键。

- 测试路径：渲染 → 点击「展开即将重置」→ 断言「折叠即将重置」出现（已展开）→ 通过 `onStateChange_cb` 派发 payload 去掉 `acc-b` → 断言仍展开。
- `structural_signature`（`PopupView.tsx:36-38`）由 `provider:account_id,...` 组成；初始 `claude:acc-a,acc-b` → 派发后 `claude:acc-a`，签名确实改变，能越过 `useEffect` 的 `prev === signature || prev === ""` 守卫（`PopupView.tsx:309`）进入裁剪分支。
- `live_providers`（`PopupView.tsx:320-326`）显式含 `UPCOMING_RESET_CARD_ID`，裁剪循环 `for (const [p, v] of Object.entries(prev_e)) if (live_providers.has(p)) next[p] = v` 保留该键——正是测试断言的不变量。
- 测试在 Round 2 处置表声明「删 `live_providers` 保留键行必红」，与代码控制流一致：删除 `UPCOMING_RESET_CARD_ID` 后 `live_providers.has("__upcoming_reset__")` 为 false，裁剪会丢弃键，断言失败。

契约对齐，无矛盾。

### 测试运行

- `pnpm test tests/unit/main/config-save-wiring.test.ts tests/unit/renderer/views/popup_view.test.tsx`：2 文件 31 用例全绿。
- `pnpm test`（全量）：158 文件 1639 用例全绿。

### 文件膨胀复核

- `tests/unit/main/config-save-wiring.test.ts` 65 行（新建，远低于 600/1200 阈值）。
- `tests/unit/renderer/views/popup_view.test.tsx` 1389 行（基线约 1198，净 +191）。重要阈值 1200 已越 189 行。但：(a) 此文件为 PopupView 集成测试单一入口，本 task 新增 4 个场景（即将重置卡片挂载、展开保持、顺序持久化、threshold null），每个场景的 fixture（connector snapshot、config mock）按现有 `connectorInfo` 模式展开，拆分到独立文件需复制 PopupView render harness 与 mock 框架，反而引入 DRY 违反；(b) 项目 `docs/blueprint/conventions.md` 未对本文件给出覆盖阈值；(c) 测试属排除类别近邻（参数枚举 + 断言序列，非算法控制流）。不出 finding，与 Round 2 取舍一致。

### 范围外提示（不进 finding 表，仅记录）

Round 2 已记录的反向竞争——「renderer 在 bounds debounce 窗口内通过 IPC `config.save` 落盘，`config-ipc.ts:153` 走 `configStore.load()` 而非读 `currentConfigSnapshot`，`:164` `onConfigSaved(merged)` 把刚写入的 settingsBounds 从内存快照抹掉」——本轮仍未覆盖。该问题先于本 task 存在，改造面跨越 IPC/main 状态层，属另一 task 范畴。本 task 的修复与描述一致地只声明前一个方向（bounds saver 不再回滚 renderer 写入）。

### 总体判断

f006/f007 两条测试修复精确钉住各自缺陷的代码契约，与 `src/main/index.ts`、`config-store.ts`、`PopupView.tsx` 的实现行为完全一致，全量测试绿。自 Round 2 以来无 `src/` 改动，无新代码侧 finding。判 PASS。

verdict: PASS
