# Task review t153（reviewer_focus: 代码）

- task：`t153_popup_config_save_loop`
- spec：`docs\tasks\t153_popup_config_save_loop\spec.md`
- diff_anchor：`5d2e3b971154325895deee9020097fd9cb453bb0`
- target：`git diff 5d2e3b971154325895deee9020097fd9cb453bb0`
- round：1
- reviewed_at：2026-07-26 17:50 UTC+8

## Findings

### t153_code_f001 - plugins 结构签名漏字段：改 displayName / CPA monitor 开关后面板不再更新

- 严重度：important
- 位置：`src/renderer/lib/config-sync.ts:10-16`（`plugins_structure_signature`）
- 问题：签名只取 `instanceId:enabled:executablePath`，但 `connector:list` 的输出还由其他 config 字段决定，且这些字段只经 `reload()` 到达 PopupView：
    - `displayName` / `name`：`handleConnectorList` 原样返回（`src/main/ipc/connector-ipc.ts:125-126`），`build_provider_usage_groups` 用它生成账号显示名（`src/renderer/lib/provider-usage.ts:139-147`、`:233`），`providerErrors` 也消费 `c.displayName`（`src/renderer/hooks/use_popup_derived.ts:88`）。
    - `parameterValues`：CPA 连接器的 `activeProviders` 由 `monitor_<provider>` 参数算出（`src/main/ipc/connector-ipc.ts:84-98`、`:130`），`visible_providers_from_groups` 据此决定面板可见 provider（`src/renderer/lib/provider-usage.ts:411-423`）。
      可复现失败场景：面板可见时，用户在设置窗改某账号备注（displayName）或切换 CPA 实例的 `monitor_*` provider → `config:save` → 广播 → 签名不变 → PopupView 不再 `reload()` → 面板显示名 / 可见 provider 无限期保持旧值，直到重启或增删/启停实例。本 task 前每次广播都 reload，该更新路径是通的，属于行为回退。
      `plan.md:17` 的风险缓释（"activeProviders 由 snapshot 通道覆盖"）不成立：`onStateChange` 只携带 `ConnectorSnapshotDTO`（`src/shared/types/ipc.ts:131-154`），不含 `activeProviders` / `displayName`；这两个字段只在 `handleConnectorList` 里从 config 计算。implementer 自述不作降级依据。
- 建议：最小修复——签名纳入 `displayName`（及 `name`）与影响 `activeProviders` 的 `parameterValues`（至少 CPA 的 `monitor_*` 键）；或改为对 `connector:list` 输出本身做签名。同步修订 `config-sync.ts` 顶部注释与 `plan.md:17` 的错误论断。

### t153_code_f002 - PopupView.tsx 已超 800 行重要阈值且本 task 继续净增

- 严重度：important
- 位置：`src/renderer/views/PopupView.tsx`
- 问题：diff 前 848 行（已达实现源码 important 阈值 800），本 task 净增 21 行至 869 行；diff / plan 中未给出不可拆的硬约束说明。符合评审标准中「已达阈值且本 task 仍净增」的出 finding 条件。
- 建议：本 task 内可只做低成本拆分（如把 persist 三个 effect + `patchConfig`/`apply_config` 抽为 `use_popup_config_sync` hook），或至少在 task/plan 中记录拆分计划与暂不可拆的理由。

### t153_code_f003 - popup_view.test.tsx 已超 1200 行重要阈值且本 task 继续净增

- 严重度：important
- 位置：`tests/unit/renderer/views/popup_view.test.tsx`
- 问题：diff 前 1421 行（已达测试源码 important 阈值 1200），本 task 净增 98 行至 1519 行；无不可拆硬约束说明。
- 建议：按场景拆文件（如 `popup_view.config_sync.test.tsx` 单独承载广播/persist 类用例），或在 task 文档说明暂缓理由。

### t153_code_f004 - 两个改动文件未过 prettier --check

- 严重度：minor
- 位置：`src/main/core/main-panel/main-panel-controller.ts:230`、`src/renderer/lib/config-sync.ts`
- 问题：`main-panel-controller.ts:230` 把 `report_content_height` 签名与首行函数体拼成一行（`) {            if (!win ...`）；新文件 `config-sync.ts` 同样未格式化。`pnpm exec prettier --check` 对两文件报 warn，`pnpm format:check` 会失败（pre-commit 的 lint-staged 会在提交时自动修，但评审基准工作区当前不过）。
- 建议：`pnpm exec prettier --write` 这两个文件。

## 结论

- 本轮新发现：4 条（important × 3，minor × 1）
- 规格合规核对：
    - spec 范围四点（PopupView 同步 ref + 保 identity、签名门控 reload、use-config 深比较、pinToTop 守卫）均已实现且方向正确；`apply_config` 的 ref 同步与 persist effect 的「state 偏离已同步 ref 才保存」闭环逻辑自洽，真实用户操作（拖拽/折叠）的持久化路径未变。
    - AC3 新增单测存在且通过：本 reviewer 实跑 5 个触及测试文件 79 tests 全绿；`pnpm typecheck` 通过；触及源文件 eslint `--max-warnings=0` 通过。
    - AC1/AC2 为打包黑盒项，本 review 未做打包实测，以实现方黑盒记录为准。
    - f001 属于 spec 范围第二点（签名门控）实现不完整导致的行为回退。
- 验证命令：`pnpm exec vitest run`（5 个触及测试文件，79 通过）、`pnpm typecheck`（通过）、`pnpm exec eslint <5 个源文件> --max-warnings=0`（通过）、`pnpm exec prettier --check <5 个源文件>`（2 文件 warn，见 f004）、`wc -l` 文件行数比对。
- 总体判断：守卫实现方向正确、测试到位，但签名漏字段造成设置窗编辑不再同步到可见面板（f001），叠加两个已超阈值文件继续膨胀，本 task 修复前不可信。

verdict: FAIL

## Round 2 (2026-07-27 01:48 UTC+8)

- round：2
- target：`git diff 5d2e3b971154325895deee9020097fd9cb453bb0`（相对当前工作区，含 Round 1 后修复）

### 前轮 finding 复核

- **t153_code_f001（签名漏 displayName/parameterValues）— 已修，验证通过**。
    - `src/renderer/lib/config-sync.ts:17-20` 改为 `JSON.stringify(plugins)` 整体序列化，`config.plugins` 任意字段（displayName/name、parameterValues、refreshIntervalSeconds、endpointOverrides 等）变化都会推进签名，方向从「漏更新」转为「保守多 reload」；冗余 reload 由 `use-plugins.ts:44-47` 的值相等保引用兜底，零重渲染，符合 spec 范围第二点。
    - 顶部注释（`config-sync.ts:3-15`）已同步改写，明确「故意整体序列化而非枚举字段」；Round 1 要求修订注释一项落实。
    - 新增 `tests/unit/renderer/lib/config-sync.test.ts` 7 条用例覆盖 name / parameterValues / enabled / 增删实例 / executablePath / 引用不同值相等 / 空列表，实跑全绿。
    - 残留：该测试文件自身引入一处类型错误，见本轮新 finding f005（修复本身逻辑无问题，问题在测试字面量类型）。
- **t153_code_f004（prettier）— 已修，验证通过**。`pnpm exec prettier --check` 对 5 个源文件 + 5 个测试文件全部通过（Round 1 报 warn 的 `main-panel-controller.ts`、`config-sync.ts` 已格式化）。
- **t153_code_f002 / f003（文件行数超阈值）— 未修，处置表标「遗留」**。复核确认：现状与 Round 1 一致（存量超阈值 + 本 task 小幅净增），`task.md` Round 1 处置表已填理由（存量问题、净增为必要守卫逻辑、拆分列入 `docs/legacy_backlog.md` 跟进）。本 reviewer 不撤回该 finding，遗留是否成立由 blocked/收尾流程裁定；本轮 diff 未再扩大净增（PopupView.tsx 仍 +39/-18、popup_view.test.tsx +128/-30，与 Round 1 相同）。

### 本轮新发现

#### t153_code_f005 - 新增 config-sync 测试引入 TS 类型错误，`pnpm typecheck` 红灯（AC4 不达标）

- 严重度：important
- 位置：`tests/unit/renderer/lib/config-sync.test.ts:45`（`make_plugin({ parameterValues: { monitor_usage: true } })`）
- 问题：`parameterValues` 类型为 `Readonly<Record<string, string | number>>`（`src/shared/types/config.ts:106`），字面量 `true`（boolean）不可赋值，`pnpm typecheck`（`tsc --noEmit`，覆盖 tests/）报错 `TS2322: Type 'boolean' is not assignable to type 'string | number'` 并以 exit 2 失败。可复现：当前工作区直接跑 `pnpm typecheck` 即红。vitest 经 esbuild 转译不做类型检查，故 80 条测试全绿掩盖了该错误；spec AC4（`pnpm typecheck` 通过）当前不满足。此为 f001 修复新增测试时引入的回归（Round 1 时 typecheck 通过）。
- 建议：`true` 改为合法值（如 `1` 或 `"on"`），或改用真实 CPA `monitor_*` 参数形态的 string/number 值；改后重跑 `pnpm typecheck` 确认归零。

### 结论

- 前轮 finding 复核：f001 已修（代码逻辑与注释均落实）、f004 已修、f002/f003 未修但处置表已标遗留并给出理由（不撤回）。
- 本轮新发现：1 条（important × 1）。
- 全量 diff 复查：修复轮改动仅限 `config-sync.ts` 重写 + 新增 `config-sync.test.ts` + prettier 格式化，无范围外文件；守卫逻辑（apply_config 同步 ref、签名门控 reload、use-config 深比较、pinToTop 守卫、use-plugins 保引用）维持 Round 1 结论，未发现新引入的逻辑/并发/边界问题。
- 验证命令：`pnpm exec vitest run`（5 个触及测试文件，80 通过）、`pnpm typecheck`（**失败**，TS2322，见 f005）、`pnpm exec eslint <5 个源文件> --max-warnings=0`（通过）、`pnpm exec prettier --check <10 个触及文件>`（全部通过）。
- 总体判断：f001/f004 修复正确，但修复轮引入的测试类型错误使 typecheck 红灯、AC4 不达标，一行可修。

verdict: FAIL

## Round 3 (2026-07-27 01:55 UTC+8)

- round：3
- target：`git diff 5d2e3b971154325895deee9020097fd9cb453bb0`（相对当前工作区，含 Round 2 后修复）

### 前轮 finding 复核

- **t153_code_f005（config-sync.test.ts 字面量类型错误）— 已修，验证通过**。
    - `tests/unit/renderer/lib/config-sync.test.ts:45` 已由 `monitor_usage: true` 改为 `monitor_usage: 1`，符合 `Readonly<Record<string, string | number>>`（`src/shared/types/config.ts:106`）。
    - 本 reviewer 实跑 `pnpm typecheck`（`tsc --noEmit`）exit 0，红灯归零，spec AC4 恢复满足。
    - 实跑该文件 7 条用例全绿；改动为一行字面量，未削弱断言语义（仍验证 parameterValues 变化推进签名）。
- **t153_code_f001 / f004**：Round 2 已复核通过，本轮 diff 复查两文件（`config-sync.ts`、`main-panel-controller.ts` 等）与 Round 2 一致，维持「已修」结论。
- **t153_code_f002 / f003（文件行数超阈值）**：维持 Round 2 结论——未修、处置表标「遗留」，本 reviewer 不撤回。本轮 diff 未再扩大净增（PopupView.tsx 仍 +39/-18、popup_view.test.tsx +128/-30，与 Round 1/2 相同）。

### 本轮新发现

无（0 条）。

### 结论

- 前轮 finding 复核：f005 已修并验证（typecheck 复绿、测试全绿）；f001/f004 维持已修；f002/f003 维持遗留（不撤回）。
- 本轮新发现：0 条。
- 全量 diff 复查：本轮唯一变更为 `config-sync.test.ts:45` 的 `true`→`1`，diff stat 与 Round 2 完全一致（14 文件，+498/-29），无范围外文件；守卫逻辑（apply_config 同步 ref、签名门控 reload、use-config 深比较、pinToTop 守卫、use-plugins 保引用）维持前轮结论。
- 验证命令：`pnpm typecheck`（exit 0）、`pnpm exec vitest run`（5 个触及测试文件，80 通过）、`git diff --stat` 比对。
- 总体判断：f005 一行修复正确，typecheck 与全部触及测试复绿，代码轴达标；f002/f003 遗留处置由收尾流程裁定。

verdict: PASS
