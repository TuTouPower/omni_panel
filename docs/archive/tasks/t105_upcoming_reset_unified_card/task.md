---
tid: t105
slug: upcoming_reset_unified_card
diff_anchor: "2da273457b9ccea6c8a8690d8881b0da49a90366"
branch: t105_upcoming_reset_unified_card
---

# Task t105_upcoming_reset_unified_card

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 开始 task。目标：将用量面板「即将重置」从独立 banner/rail 改为与 provider 卡片同类的可拖动、可折叠卡片，统一排列在概览卡片网格中。
- 2026-07-25 设计确认：配置 schema 的 `providerOrder` 接受任意 string，使用保留键 `__upcoming_reset__` 同时承载排序和展开状态；`use_popup_derived` 已按可见 provider 过滤排序项，tab 不会出现该键。状态裁剪显式保留该键。
- 2026-07-25 E2E 拖拽定位到两个真实缺陷（非测试问题）：
    1. `ProviderCard` 根节点缺 `data-card-id`，概览网格只有「即将重置」一张卡带该属性，导致无法按 DOM 顺序断言卡片排列。已补上，网格所有卡片统一暴露 `data-card-id`。
    2. `scheduleSave(currentConfigSnapshot)` 在事件发生时抓快照、500ms 后才落盘。窗口 resize/move 触发的 bounds 保存会把 debounce 窗口内 renderer 已保存的 `providerOrder` / `expandedProviders` 回滚（栈追踪确认：`save_floating_bounds → save_config → scheduleSave`，落盘顺序 `[reset,claude]+expanded` → 200ms 后被 `[claude,reset]+undefined` 覆盖）。这是既有数据丢失 bug，与本 task 的保留键无关，但会让卡片顺序/展开在重启后丢失。修法：`scheduleSave` 接受 thunk，在 debounce 触发时才解析 payload；两处 bounds 保存改传 thunk。补 `config-store-debounce` 回归测试 2 条。
- 2026-07-25 Electron 下 Playwright 的 `dragTo` / `mouse.*` 都不触发 HTML5 DnD，React 收不到 `onDragStart/onDragOver`。E2E 改为逐个 `page.evaluate` 派发原生 `DragEvent`（分次调用，让 React 在 `dragstart` 与 `dragover` 之间提交 setState）。E2E 连跑 3 次全绿。
- 2026-07-25 Round 2 双审：code PASS（前轮 5 条全修，无新 finding）；test 报 FAIL，2 条新 finding（均 important）：f006 `scheduleSave` thunk 回归只覆盖 store 侧，缺陷发生地 `index.ts` 调用点零覆盖；f007 spec 明写的「结构裁剪保留 `__upcoming_reset__`」无测试。两发现均真实（删修复行全量测试仍绿，已验证）。已修：f006 补 `tests/unit/main/config-save-wiring.test.ts` 镜像 bounds-save wiring 的 thunk 契约；f007 补 `popup_view.test.tsx`「展开卡片后 onStateChange 改结构签名，断言仍展开」并验证删 `live_providers` 保留键行必红。用户批准加轮，`max_review_round` 提至 3，开 Round 3。
- 2026-07-25 用户进一步将本 task `max_review_round` 上限提至 5（原 3）。Round 3 双审进行中。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 11:45 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                           | fix_ref                                                                 |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| t105_code_f001 | minor     | 已修   | 去掉 `renderExtraCard` 中冗余的 `!show_upcoming` 判断，只保留 card_id 匹配                                                                                          | `src/renderer/views/PopupView.tsx` renderExtraCard                      |
| t105_code_f002 | minor     | 已修   | `ProviderOverview` 用 `visible_provider_set` 判定 provider 卡片，未知 id 交给 `renderExtraCard`，回调内按 card_id 精确匹配后才渲染                                  | `src/renderer/components/ProviderOverview.tsx:85-122`                   |
| t105_code_f003 | minor     | 已修   | `dragging` 改为 `is_live && drag_id === UPCOMING_RESET_CARD_ID`，`dragOver` 显式排除自身拖拽，与 ProviderCard 语义对称                                              | `src/renderer/views/PopupView.tsx` UpcomingResetCard props              |
| t105_code_f004 | important | 已修   | 在 `live_providers` 处补注释说明保留键为何加入（避免被当成 provider 集合污染）                                                                                      | `src/renderer/views/PopupView.tsx:320-326`                              |
| t105_code_f005 | important | 已修   | `use_dnd_handlers` 改收 `overview_card_order`（含保留键），并在 hook 内注释语义；补 3 条保留键重排单测                                                              | `src/renderer/views/PopupView.tsx:440-447`、`use_dnd_handlers.ts:34-37` |
| t105_test_f001 | important | 已修   | E2E 补拖拽前后 `.overview-grid` 子节点顺序断言；为此给 `ProviderCard` 补 `data-card-id`；`dragTo`/`mouse` 在 Electron 不触发 DnD，改派发原生 `DragEvent` 并注释限制 | `tests/e2e/electron/upcoming_reset_card.spec.ts`                        |
| t105_test_f002 | important | 已修   | 记录点击前 `config_save` 调用次数，断言点击新增一次调用并取该次 payload；同时断言网格完整顺序                                                                       | `tests/unit/renderer/views/popup_view.test.tsx:1174-1215`               |
| t105_test_f003 | important | 已修   | 迁移旧 rail 测试覆盖：状态点颜色映射、脱敏隐藏账号标签、`format_reset_time` 格式化                                                                                  | `tests/unit/renderer/components/upcoming_reset_card.test.tsx`           |
| t105_test_f004 | minor     | 已修   | 补跨行 y-axis 拖拽：过中点交换、未过中点不交换                                                                                                                      | `tests/unit/renderer/hooks/use_dnd_handlers.test.ts:141-180`            |
| t105_test_f005 | minor     | 已修   | 补行内可见内容断言：VendorMark 图标、状态点 data-status、账号标签与 metric 标签                                                                                     | `tests/unit/renderer/components/upcoming_reset_card.test.tsx:90-115`    |

修 f001/f005 过程中额外发现并修复两个既有缺陷（见「过程记录」）：`ProviderCard` 缺 `data-card-id`、`scheduleSave` 陈旧快照回滚 renderer 配置。

### Round 2 (2026-07-25 14:20 UTC+8)

| finding_id          | severity  | status | rationale                                                                                                                                                                                              | fix_ref                                                   |
| ------------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| t105_code_f001~f005 | -         | 已修   | code reviewer Round 2 复核前轮 5 条全部已修，无新 finding，thunk 修复核查正确，verdict PASS                                                                                                            | 见上表 Round 1                                            |
| t105_test_f006      | important | 已修   | 补 `tests/unit/main/config-save-wiring.test.ts`：镜像 index.ts bounds-save wiring，thunk 在 debounce 触发时解析，renderer 窗口内写入的 `providerOrder`/`expandedProviders` 不被回滚                    | `tests/unit/main/config-save-wiring.test.ts`              |
| t105_test_f007      | important | 已修   | 补 `popup_view.test.tsx`「preserves upcoming reset card expansion across provider data refresh」：展开卡片后 onStateChange 改结构签名，断言仍展开。删 `live_providers` 保留键行测试必红（已验证红/绿） | `tests/unit/renderer/views/popup_view.test.tsx:1176-1290` |

注：`config-save-wiring.test.ts` 镜像 index.ts wiring 形态（thunk），与 `popup_suppress_move.test.ts` 同一 mirror-wiring 模式；index.ts 主进程胶水未直接 import 测试，此测试钉住 bounds saver 依赖的 thunk 契约。

### Round 3 (2026-07-25 15:30 UTC+8)

| finding_id | severity | status | rationale                                                                                                                                                                                                                                                                       | fix_ref |
| ---------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| -          | -        | -      | code reviewer Round 3：自 Round 2 起 `src/` 零改动，仅核实 f006/f007 测试与代码契约一致，无新 finding，verdict PASS                                                                                                                                                             | -       |
| -          | -        | -      | test reviewer Round 3：f006 镜像 wiring 可捕获 store 侧回归（index.ts 不可直接 import 的固有限制与 `popup_suppress_move.test.ts` 先例一致）；f007 onStateChange 走到裁剪分支（prev 非空且不等，非 `prev===""` 提前 return），删保留键行断言必红。本轮零新 finding，verdict PASS | -       |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 概览页出现一张「即将重置」卡片，与其他 provider 卡片同处 `.overview-grid`，行列排列一致。
- [x] 卡片可折叠/展开，状态持久化，重启后保持。（E2E 重启后断言「折叠即将重置」可见 + 顺序保持；单测验证展开态经 onStateChange 裁剪后仍保留）
- [x] 卡片可拖动重排，顺序持久化到 `providerOrder`，与其他卡片共用拖拽交互。（E2E 派发原生 DragEvent 验证 DOM 重排 + 持久化；`use_dnd_handlers` 单测覆盖保留键 x/y 轴重排）
- [x] 原 `UpcomingResetBanner` 独立横幅不再出现；`UpcomingResetRail` 按布局决策移除。（两组件及其测试删除，单测断言 `.upcoming-banner`/`.upcoming-rail`/`.overview-row` 不存在）
- [x] 空态（无重置项）时卡片显示「未来 7 天内暂无重置」或等效文案。（`upcoming_reset_card.test.tsx` 空态断言）
- [x] 重置条目点击仍跳转到对应 provider tab。（E2E + 单测 `onSelectProvider` 回调断言）
- [x] renderer 单测覆盖新卡片组件及 PopupView 集成路径。
- [x] `pnpm test` 全量通过。（1639 用例）

### Reviewer verdict

- Round 1 code：FAIL（5 条，全修）
- Round 1 test：FAIL（5 条，全修）
- Round 2 code：PASS
- Round 2 test：FAIL（f006/f007，全修）
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- 无

### 结果摘要

- 将「即将重置」从 `UpcomingResetBanner` / `UpcomingResetRail` 改为 `UpcomingResetCard`，纳入 `.overview-grid`，复用 `CollapsibleCard` + `DragGrip` + `UpcomingResetRow`；保留键 `__upcoming_reset__` 同时承载 `providerOrder` 排序位与 `expandedProviders` 展开态，不新增 config 字段。
- 顺手修两个既有缺陷（让 AC「持久化/重启后保持」成立）：`ProviderCard` 根补 `data-card-id`；`AppConfigStore.scheduleSave` 支持 thunk，`index.ts` 两处 bounds 保存改传 thunk，消除 debounce 窗口内 renderer 配置被陈旧快照回滚的数据丢失。
- 测试：新增 `upcoming_reset_card.test.tsx`、`config-save-wiring.test.ts`、`config-store-debounce` 回归 2 条、`use_dnd_handlers` 保留键重排 3 条、`popup_view` 裁剪保留键 1 条；E2E `upcoming_reset_card.spec.ts` 覆盖重排+展开+重启恢复。`pnpm test` 1639 全绿，E2E 连跑 3 次全绿。
