# Task review t327（reviewer_focus: 通用）

- task：`t327_session_library_card_squash_fix`
- spec：`docs/tasks/t327_session_library_card_squash_fix/spec.md`
- diff_anchor：`8fd0d3f9256d34e854ac7d8a3235499602201545`
- target：`git diff 8fd0d3f9256d34e854ac7d8a3235499602201545`
- round：1
- reviewed_at：2026-08-12 22:30 UTC+8

## Findings

### t327_gen_f001 - e2e 断言无法区分「仅 items-start」回归态与修复态，auto-rows-max 半边无回归保护，AC-001「按钮可见」覆盖有洞

- 严重度：important
- 锚点：AC-001（标题/摘要/meta/目录/按钮可见）——回归态下按钮/标题被上排卡片遮挡，测试仍绿
- 位置：`tests/e2e/web/session_library_grid_squash.spec.ts:69`（`first_h > 50`）、`:88-92`（前 12 等高）、`:98-105`（scrollHeight > clientHeight）
- 问题：本 spec 是 task 唯一的自动化验证（可测试性声明：「以 web e2e 覆盖」），但断言全部基于 `offsetHeight` / 等高 / 可滚动，对 spec 背景自行记载的「仅 `items-start` 会致卡片溢出行与下邻重叠（实测回归）」完全无感。用 playwright 注入同一 360 会话场景实测：
    - 修复态（items-start + auto-rows-max）：卡片 offsetHeight=125px，行距 top 215/352/489（无重叠），scrollHeight 12072。
    - 「仅 items-start」态（覆写 `grid-auto-rows:auto`）：卡片 offsetHeight=125px，但行距 top 215/229/243（约 14px），前后行卡片大幅垂直重叠（第 1 卡 bottom=340 > 第 5 卡 top=229），下排卡片标题/按钮被上排卡片覆盖——正是背景段记载的回归。该态下本 spec 全部断言仍绿：`offsetHeight=125>50`、前 12 等高（Set size=1）、scrollHeight 1357>476。即删除 `auto-rows-max` 后本 spec 不会红，AC-001「按钮可见」被违反而测试不报。
- 建议：补空间断言，最小实现：断言相邻行卡片 `getBoundingClientRect` 无垂直重叠（如第 1 卡 `rect.bottom` < 第 2 行首卡 `rect.top`），或断言第 2 行卡片「单独打开」按钮可点（未被遮挡）。现状下该回归不会自动被捕获。

### t327_gen_f002 - spec 背景段机制数字自相矛盾

- 严重度：minor
- 锚点：文档一致性问题（上下文区，非 AC）
- 位置：`docs/tasks/t327_session_library_card_squash_fix/spec.md:5`
- 问题：背景段「把行压缩到 55.5px … `align-items: stretch` 使卡片拉伸塌成行高 → 2px 细条」自相矛盾：若卡片拉伸至行高应为 55.5px 而非 2px。实测 pre-fix 态卡片 offsetHeight=2px、行距约 14px（非 55.5px）。机制方向（auto 行压缩 + stretch 塌陷）与修复方向正确，但具体数字描述不实，可能误导后续维护者。
- 建议：改背景段数字为实测值，或删除具体像素仅保留机制描述。不影响 AC，处置为改 spec。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：实测显示 `auto-rows-max` 单独即足以修复（覆写 stretch + max-content 后几何与完整修复完全一致：125px 卡、无重叠、可滚动），`items-start` 在此组合下冗余（防御性、无害）。当前实现行为正确，此项仅为最小化观察，不单列 finding。
- 总体判断：实现正确且已独立复验（修复态 125px 卡、无重叠、可滚动，符合 AC-001/002/003）；但 f001 未解决的重要级测试覆盖空洞导致 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑新 e2e spec（1 passed，断言 first/前 12 卡 offsetHeight>50、`.library-card-title` 可见）+ playwright 实测修复态 offsetHeight=125px。注意 f001：重叠回归态下「按钮可见」未被测试捕获（实测该态测试仍绿）。
- AC-002：`re_verified` — 重跑 e2e（scrollHeight>clientHeight 断言通过）+ 实测 scrollHeight 12072 > clientHeight 476。
- AC-003：`re_verified` — 重跑 e2e（连点加载更多至 350 卡，前 12 等高 Set size=1）+ 实测 350 态前 12 卡高度全 125px。

coverage = 3 / 3

reviewed_scope: 37d7c812bed97076

verdict: FAIL

## Round 2 (2026-08-12 22:14 UTC+8)

本轮只读复核 f001 + f002 修复；未改代码/测试/spec/task.md。

### 前轮 finding 复核

**t327_gen_f001（important）— 已消除。** 修复为 e2e 补「同列上张无重叠」断言（`tests/e2e/web/session_library_grid_squash.spec.ts:97-119`）。

- 断言逻辑可靠：逐卡取前 24 张 `getBoundingClientRect`，找「同列上张」＝左缘对齐（`Math.abs(b.left - box.left) < 5`）且严格在上方、top 最大者，断言 `box.top >= same_col_above.bottom - 1`。grid `repeat(auto-fill,minmax(280px,1fr))` 下同列卡左坐标一致，±5px 容忍亚像素；1280 宽约 4 列，24 卡跨 6 行，第 2 行起均有同列上张，断言多次执行，非恒真。容忍 1px 远小于正常 gap（12px），远小于回归重叠（~111px），无假阳性/假阴性风险。首卡（无上张）被跳过是正确语义。
- 修复态通过：重跑 `MOCK_FIXTURE=synthetic npx playwright test --config=playwright.config.ts --project=web tests/e2e/web/session_library_grid_squash.spec.ts` → 1 passed（含重叠断言与既有 offsetHeight/等高/scrollHeight 断言）。
- 区分度独立复验（.scratch 临时 spec，已清理）：覆写 `grid-auto-rows:auto` 模拟「仅 items-start」回归态 → 首卡 offsetHeight 仍 125px（旧断言全绿），同款重叠逻辑判定 20/24 张卡违反不变量、最大重叠 111px。即删掉 auto-rows-max 后本断言必然变红，AC-001「按钮可见」回归可被自动捕获。Round 1 空洞已闭合。

**t327_gen_f002（minor）— 已消除。** `docs/tasks/t327_session_library_card_squash_fix/spec.md:5` 背景段改为：2px 细条 / `grid-auto-rows: auto` 内容超高行距压缩到 ~14px（卡片内容 125px）/ `align-items: stretch` 使卡片塌成 2px；修复＝`auto-rows-max` + `items-start`，并注明「仅 items-start 会致卡片溢出行与下邻重叠（实测回归），须两者配合」。数字自洽（2px / ~14px / 125px），55.5px 矛盾数字已删除；与代码 `SessionList.tsx:50`（`items-start auto-rows-max` 共存）一致。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核：f001 已消除（新增同列无重叠断言，实测区分度 20/24 违反、max 111px）；f002 已消除（spec 背景数字一致，55.5px 已删）。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：两项 blocker/minor 均已按 diff 与独立复验消除，当前实现符合 AC-001/002/003，无未解决 blocking finding。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑 e2e 1 passed（含新重叠断言与 title 可见断言）；scratch 复验回归态下重叠断言 20/24 卡违反，证明 AC-001 按钮可见回归可被自动捕获。
- AC-002：`re_verified` — 重跑 e2e `scrollHeight > clientHeight` 断言通过。
- AC-003：`re_verified` — 重跑 e2e 连续加载至 350+ 卡，前 12 卡等高（`Set size=1`）断言通过。

coverage = 3 / 3

reviewed_scope: 4c00c57b15e17023

verdict: PASS
