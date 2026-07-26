# Task review t153（reviewer_focus: 测试）

- task：`t153_popup_config_save_loop`
- spec：`docs\tasks\t153_popup_config_save_loop\spec.md`
- diff_anchor：`5d2e3b971154325895deee9020097fd9cb453bb0`
- target：`git diff 5d2e3b971154325895deee9020097fd9cb453bb0`
- round：1
- reviewed_at：2026-07-27 01:39 UTC+8

## Findings

无。

## 结论

- 本轮新发现：0 条
- 总体判断：三条 AC 要求的单测全部到位且带正向对照，危险模式扫描命中的两处（删断言、弱 flush 否定断言）经调查均为合法或已证有效，放行。

### 调查记录（危险模式命中项的放行说明）

1. **删除断言（命中「删 expect」模式，判定合法）**：`tests/unit/renderer/views/popup_view.test.tsx` 原「persists upcoming reset card order and expansion」中删除 `await waitFor(() => { expect(config_save).toHaveBeenCalled(); })`。该 waitFor 是同步点而非 AC 断言，其前提是「挂载期必有一次副作用保存」——正是本 task spec 要求消除的行为；修复后该等待必然超时，属「规格变了」的合法适配。归因双落点：测试内注释（`popup_view.test.tsx:1338-1339`）与 `task.md` 过程记录。核心断言（点击展开 → `config.save` 携带 `providerOrder` + `expandedProviders`）原样保留，且新增「does not save config on mount when persisted UI state already exists (t153)」（`popup_view.test.tsx:1409`）直接钉死新行为，覆盖无净损失。

2. **单 tick flush + 否定断言（命中「异步时序」维度，判定有效）**：新增测试用 `await act(async () => { await Promise.resolve(); })` 后断言 `config_save not.toHaveBeenCalled()`。调查：本文件在 diff_anchor 处已有同模式测试（anchor 版 480-509 行，防「广播回显反向保存」回归），该模式在本测试环境（React 19.2.6 + RTL 16.3.2 + jsdom）已作为有效回归守卫存在；且断言前的 `waitFor` 轮询本身以宏任务泵空微任务队列。判定不构成掩盖。

### AC 覆盖核对（spec 验收标准第 3 条）

- 「广播回显不触发 persist」：`popup_view.test.tsx:1409`（挂载期 apply_config 不回写，覆盖 collapsed/expanded/providerOrder 三类 ref 同步路径）+ `popup_view.test.tsx:1434`（无变化广播不触发 save）。广播与挂载共用同一 `apply_config`，路径覆盖充分。
- 「plugins 签名不变不触发 reload」：`popup_view.test.tsx:1434` 断言 `plugin_list` 调用数不变；签名函数本身由 `tests/unit/renderer/lib/config-sync.test.ts` 6 例覆盖（空/undefined、无关字段变化、enabled 变化、增删实例、executablePath 变化）。
- 「use-config 深比较跳过相同配置」：`tests/unit/renderer/hooks/use_config.test.ts:165`（JSON 深拷贝回显保引用）。

正向对照齐备（「全部跳过」式假实现无法通过）：`use_config.test.ts:80`（不同内容广播会生效）、`use_plugins.test.ts` 新增「updates plugins when reload returns a structurally different list」、`popup_view.test.tsx:1461`（结构变化广播触发 reload）、`main_panel_controller.test.ts` 新增「re-applies setAlwaysOnTop when pinToTop actually changes」。

### 其余扫描结果

- `.skip` / `.only` / `eslint-disable` / `ts-ignore` / 恒真断言 / `toBeTruthy` / `toBeDefined` 当证据：diff 新增行零命中。
- mock 边界：全部 mock 在系统边界（`window.usageboard` IPC 层、`main_panel_controller.test.ts` 的 FakeWindow 模拟 Electron BrowserWindow）；未 mock 自有模块/被测逻辑。`popup_view.test.tsx:8` 的 `vi.mock(theme)` 为 diff 之前就存在的 jsdom 环境必需，非本 diff 引入。
- 测 AC 还是 mock：新增测试均通过渲染后界面/调用计数/引用相等说话；`config-sync.test.ts` 直接测纯函数，但该函数即本 task 交付物，且有 PopupView 层间接覆盖，不构成凑数。
- AC 第 1、2 条（打包 60s 浸泡、无闪烁）为黑盒验收项，不属于单测文件可承载范围，由工作流 Step 4 黑盒覆盖；本轴不作要求。
- 实测：`npx vitest run` 跑 5 个变更测试文件，79 测试全绿（2026-07-27 01:39 UTC+8）。

### 提示（非 finding）

- 「ignores config broadcasts」测试的回显 config 未携带 collapsed/expanded/providerOrder 字段，该用例单独不区分修复前后的 persist 行为（区分力来自 plugin_list 计数断言）；persist 不回写的区分力由挂载期测试承担。覆盖充分，仅作记录。

verdict: PASS

## Round 2 (2026-07-27 01:46 UTC+8)

### 前轮 finding 复核

- Round 1 零 finding，无待复核项。本轮仅复审 Round 1 之后的变更：`src/renderer/lib/config-sync.ts` 签名实现改为 `JSON.stringify(plugins)` 整体序列化（code review t153_code_f001 驱动），`tests/unit/renderer/lib/config-sync.test.ts` 相应替换一条用例并新增一条。

### 本轮新发现

0 条。

### 变更复审记录（危险模式命中项的放行说明）

1. **反转断言（命中「删除/反转 expect」模式，判定合法）**：原「ignores fields…」用例断言 `refreshIntervalSeconds` 变化**不**改变签名；替换后 `config-sync.test.ts:36-43` 断言其**必须**改变签名，并新增 `config-sync.test.ts:45-56` 覆盖 `name`/`parameterValues` 变化。属行为反转，归因为「实现按 code review f001 变更」：测试内注释（`config-sync.test.ts:38-39` 引 `t153_code_f001`）与 `task.md` 处置表（f001 行「已修」）双落点。新行为更保守（任何 plugins 字段变化都触发 reload，冗余 reload 由 `use_plugins` 保引用兜底、零重渲染），spec AC「plugins 签名不变不触发 reload」不受影响——UI 级字段（providerOrder/collapsed/expanded）本就在 `config.plugins` 之外，结构上不可能进入签名。断言未弱化（`not.toBe` 精确比较），覆盖为净增（6 例 → 7 例）。

2. **双向对照仍齐备**：「is stable for deep-equal plugin lists with different references」（`config-sync.test.ts:22-26`）防「恒变签名」式假实现，五条 change 用例防「恒等签名」式假实现；整体 JSON 序列化的假实现（如只序列化 instanceId）会被 name/parameterValues/refreshIntervalSeconds 用例拦截。

### 其余扫描结果

- 本轮变更文件内 `.skip` / `.only` / 恒真断言 / `ts-ignore` / mock 误用：零命中（测试直测纯函数，无 mock）。
- 实测：`npx vitest run tests/unit/renderer/lib/config-sync.test.ts` 7 例全绿；消费方回归 `popup_view.test.tsx`（38 例）+ `use_plugins.test.ts`（11 例）全绿（2026-07-27 01:45 UTC+8）。

### 提示（非 finding）

- `task.md:21` 过程记录仍描述签名为「instanceId+enabled+executablePath」旧实现，与 f001 修复后的整体序列化不符；属文档同步问题，归实现/收尾轴，本轴仅记录。
- `JSON.stringify` 对 key 序敏感，语义相等但 key 序不同的 config 会得到不同签名；实际路径两侧均经同一 IPC 反序列化，key 序稳定，不构成现实风险，仅作记录（`use-config` / `use-plugins` 的深比较同此性质）。

verdict: PASS

## Round 3 (2026-07-27 01:54 UTC+8)

### 前轮 finding 复核

- Round 1、Round 2 均零 finding，无待复核项。本轮为确认轮，仅复审 Round 2 之后的唯一测试变更：code review t153_code_f005 修复——`tests/unit/renderer/lib/config-sync.test.ts:45` 的 `parameterValues: { monitor_usage: true }` 改为 `{ monitor_usage: 1 }`。

### 本轮新发现

0 条。

### 变更复审记录

1. **类型修正不改变测试语义（判定合法，无 finding）**：`src/shared/types/config.ts:106` 定义 `parameterValues: Readonly<Record<string, string | number>>`，原值 `true`（boolean）确为类型错误，改为 `1`（number）与类型契约一致。断言意图「parameterValues 变化 → 签名变化」不受影响：`{ monitor_usage: 1 }` 与基准 `make_plugin()` 的 `{}` 在 `JSON.stringify` 下必然不同，`not.toBe` 精确比较原样保留，未弱化、未删改其他断言。属「测试写错（类型错误）」的合法修复，归因有落点（code review f005 处置）。
2. **diff 范围核对**：`git diff 5d2e3b9... --stat -- tests/` 确认测试改动仍限于 Round 1/2 已审的 5 个文件，无新增测试文件、无额外删改。

### 其余扫描结果

- 本轮变更行零命中危险模式（非删除/反转/弱化/跳过/静默错误，仅字面量类型修正）。
- 实测：`npx vitest run tests/unit/renderer/lib/config-sync.test.ts` 7 例全绿（2026-07-27 01:54 UTC+8）；implementer 侧 `pnpm typecheck` 与全量 `pnpm test`（1823 例）复绿的自述与本改动性质一致。

verdict: PASS
