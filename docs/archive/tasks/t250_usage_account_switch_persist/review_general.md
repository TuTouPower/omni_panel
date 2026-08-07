# Task review t250（reviewer_focus: 通用）

- task：`t250_usage_account_switch_persist`
- spec：`docs/tasks/t250_usage_account_switch_persist/spec.md`
- diff_anchor：`fe7059e3b14f2b14d7bb68d4249f79bf63578f9f`
- target：`git diff fe7059e3b14f2b14d7bb68d4249f79bf63578f9f`
- round：1
- reviewed_at：2026-08-08 00:56 UTC+8

## Findings

### t250_gen_f001 - activeUsageTab 持久化死锁：config 无键时用户页签切换永不写回，AC2 失效

- 严重度：critical
- 锚点：AC2「切换到某 provider 页签后重启应用，面板恢复显示该页签」
- 位置：`src/renderer/views/PopupView.tsx:179-182`（apply_config 置位）与 `:310-314`（persist effect 门控）
- 问题：`has_active_tab_pref_ref` 只在 `apply_config` 读到 `config.activeUsageTab` 为 string 时置 true（`:179-181`）；persist effect 只有 ref 为 true 才 `patchConfig({activeUsageTab})`（`:311-312`）。对 config 不含该键的配置（全新安装 / 旧配置升级，即 spec「范围」与 AC3 显式覆盖的人群），ref 永远是 false。用户首次切换页签 → `setActiveTab`（`ProviderNav onChange`，`:718`）不触碰 ref → effect 跳过 → 永不写盘 → 重启后回 overview。且该键全仓唯一写入方就是此 effect（`src/shared/types/config.ts:73` / `src/main/core/config/types.ts:107` 之外无任何 writer），死锁：键永远不会出现，ref 永远不置位。AC2 的「切换→重启→恢复」对最常见的旧配置人群完全失效；现有 AC2 测试（`popup_view_t250.test.tsx:37-56`）只覆盖 config 已含键的恢复路径，未覆盖「用户切换→首次写盘」这一真实动作。
- 建议：用户侧切换时也置位（如 `ProviderNav onChange` 包一层 `setActiveTab` 并设 `has_active_tab_pref_ref.current = true`）；或照抄 providerL2Open 的 t153 prev_ref 模式（prev ref + 值相等抑制回显，天然同时防 mount 写默认值且不吞用户切换）。

### t250_gen_f002 - AC4 测试恒真：不推进防抖 timer 断言 config_save 未调用；activeUsageTab 缺 t153 回显抑制

- 严重度：critical
- 锚点：AC4 + 测试策略「回显防误写（AC4）：套用 t153 建立的回显抑制模式，补对应测试」
- 位置：`tests/unit/renderer/views/popup_view_t250.test.tsx:65-92`；`src/renderer/views/PopupView.tsx:179-182`、`:310-314`
- 问题：AC4 测试用真实 timer（无 fake timers），`patchConfig` 走 `create_debounced_config_patcher` 500ms 防抖（`src/renderer/lib/config-debounce.ts:42,70-73`）。测试只 `await Promise.resolve()` 刷微任务，timer 永不触发，`config_save` 在任何实现下都不会被调用——断言恒真，无法失败。更严重的是实际代码确实会写回：回显 `activeUsageTab="claude"` → `apply_config` 置 ref=true 并 `setActiveTab("claude")`（`:180-181`）→ persist effect 触发 `patchConfig({activeUsageTab})`（`:311-312`）。若测试推进 500ms 后断言会失败，与测试标题「回显不触发 config.save」直接矛盾。providerL2Open 用了 t153 的 `prev_l2open_ref` + `record_bool_equal` 值相等抑制（`:172-178`、`:299-306`），activeUsageTab 却只有 f004 门控、无等价 prev ref，回显抑制机制未按 spec 测试策略套用。
- 建议：AC4 测试用 `vi.useFakeTimers` + `advanceTimersByTime(500)` 真正验证回显后无写回；实现侧给 activeUsageTab 补 t153 式 prev ref（string 值相等），使回显不触发写回。

### t250_gen_f003 - AC1（providerL2Open 持久化/恢复）无任何测试覆盖

- 严重度：important
- 锚点：AC1「切到「N账号」重启恢复；切回概览重启恢复」；可测试性声明「全部 AC 可自动测试」；测试策略「断言切换后写入正确键、挂载时从 mock 配置恢复」
- 位置：`tests/unit/renderer/views/popup_view_t250.test.tsx`（仅 3 个 activeUsageTab 用例）；`tests/unit/renderer/components/provider_card_overview.test.tsx:50-95`
- 问题：新增测试只覆盖 activeUsageTab（AC2/AC3/AC4），无任何用例验证 providerL2Open 的写盘（点击「N账号」→ config.save 收到 providerL2Open）与恢复（挂载 providerL2Open → 卡片显示明细）。`provider_card_overview` 只验证 `onToggleL2Open` 回调被调用（`:57-59`），不触达 PopupView 的真实持久化路径。AC1 在自动测试层面无覆盖。
- 建议：补 PopupView 级用例：mock config 含 `providerL2Open:{deepseek:true}` → 挂载恢复明细；点击「N账号」→ 防抖后 `config.save` 收到对应键。

### t250_gen_f004 - 「折叠复位为概览」行为测试断链，且回显折叠路径不复位 l2Open

- 严重度：important
- 锚点：行为缺陷 + 原 ProviderCard 内部 effect 语义等价性（task.md 声称「上移父级、原 effect 语义」）
- 位置：`src/renderer/views/PopupView.tsx:573-582`；`src/renderer/components/ProviderCard.tsx:112-113`；`tests/unit/renderer/components/provider_card_overview.test.tsx:50-95`
- 问题：原 `provider_card_overview`「resets account detail to overview after the card is collapsed」测试随受控化删除，替换用例只验证「回调触发 + expanded=false 且 l2Open=false 时隐藏明细」，未验证父级 `toggle_expand_provider` 折叠时确实复位 `l2Open=false`。该复位逻辑现仅存在于 `PopupView.toggle_expand_provider`（`:577-579`），无任何测试触达，属此前已测行为回退到未测。且复位仅在用户 toggle 路径触发；config 回显使 `expanded_providers[X]=false`（`apply_config` `:165-171`）时并不复位 `l2open_providers[X]`——原 ProviderCard effect 对任意 `expanded===false` 都复位，二者不完全等价（需 config 同时 `expandedProviders[X]=false` 与 `providerL2Open[X]=true` 的不一致配置才可复现）。
- 建议：补 PopupView 级用例覆盖 toggle 折叠复位；如认可回显路径不复位，在代码注释/文档声明差异，否则在 apply_config 中同步复位。

### t250_gen_f005 - 新增 config 键无 schema 校验测试

- 严重度：minor
- 位置：`src/main/core/config/types.ts:106-107`；`tests/unit/config/config-schema.test.ts:127-155`
- 问题：zod 已加 `providerL2Open` / `activeUsageTab`，但未补对应 schema 测试（既有 t222 有 `sparklineWindowDays` 的接受/拒绝用例模式）。
- 建议：补两条 `config-schema` 用例（接受合法值；activeUsageTab 非 string / providerL2Open 非 boolean record 拒绝）。

### t250_gen_f006 - 在 state updater 内调用另一 setState（副作用入纯函数）

- 严重度：minor
- 位置：`src/renderer/views/PopupView.tsx:574-581`
- 问题：`set_l2open_providers` 被调用在 `set_expanded_providers` 的 updater 函数体内。updater 应为纯函数，React 并发渲染下可能被重复调用或被中断后丢弃 expanded 更新，而 l2open 复位已生效（丢明细态）。当前幂等、低概率，但违反纯 updater 约定。
- 建议：在 `toggle_expand_provider` 函数体（而非 updater 内）先算 next 再并列调用两个 setState。

### t250_gen_f007 - providerL2Open 不随结构签名裁剪，残留过期 provider 键

- 严重度：minor
- 位置：`src/renderer/views/PopupView.tsx:378-406`
- 问题：结构签名变化时仅裁剪 `collapsed_accounts` / `expanded_providers`，`l2open_providers` 不裁剪；被移除 provider 的 `providerL2Open` 残留写入 config（同键在 `expandedProviders` 会裁剪，行为不一致）。无害但造成配置脏数据。
- 建议：结构裁剪处一并过滤 `l2open_providers` 的过期 provider。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：7 条（critical 2 / important 2 / minor 3）
- 未进表的提示：
    - `docs/specs/ui-views-web.md:43`「账号明细仅在当前展开期间有效」仍与 t250 持久化语义冲突，spec 上下文「Finalization 时更新」已登记，非本 diff 缺口，未入表。
    - `toggle_expand_provider` 中 `set_l2open_providers` 处调用在 updater 内（见 f006）。
- 总体判断：AC1（l2open）实现正确且回显抑制到位，但 AC2（页签持久化）对无键配置存在死锁（f001，核心功能失效），AC4 测试恒真且实现未按 spec 套用 t153 抑制（f002），测试对 AC1 无覆盖（f003）。存在未解决 critical / important。
- 系统性 follow-up：建议标题「activeUsageTab 持久化死锁 + t222 同类 f004 门控缺陷核查」，slug `usage_tab_persist_deadlock`，阻断性 critical（t222 sparkline 疑似同一死锁，建议一并核查）。

## Round 2 (2026-08-08 01:26 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **f001（critical，已消除）**：`has_active_tab_pref_ref` 门控删除，改为 `prev_active_tab_ref`（初值 `"overview"`）+ 值相等抑制（`PopupView.tsx:54,311-317`）。apply_config 仅在 `typeof config.activeUsageTab === "string"` 时同步 ref+state（`:180-183`）。config 无键时 ref 保持 `"overview"`，用户经 ProviderNav onChange 切换（`:727` setActiveTab）→ effect `prev_ref !== activeTab` → 写盘。死锁消除。新增「AC2：config 无 activeUsageTab 时用户切换页签后写回 config」测试（`popup_view_t250.test.tsx:93-108`）：真实 debounce 600ms 后断言 `config_save` 收到 `activeUsageTab:"claude"`，非恒真（若门控仍存则 config_save 永不被调用，断言失败）。回显路径无写盘（见 f002）。
- **f002（critical，已消除）**：activeUsageTab 补 t153 式 prev ref（`prev_active_tab_ref`），回显经 apply_config 同时更新 ref+state → effect 值相等短路，不写回。AC4 测试改真实 timers + `wait_debounce`（600ms > 500ms 防抖），断言 `config_save` 未被调用（`popup_view_t250.test.tsx:188-214`）——防抖窗口确实推进，若实现仍写回则断言失败，非恒真。AC2 用户切换测试证明同一防抖通道正常触发，与 AC4「抑制」区分成立。
- **f003（important，已消除）**：新增「AC1：config.providerL2Open 恢复多账号卡片明细 + 切换写回」（`popup_view_t250.test.tsx:110-186`）：多账号 kimi fixture，`providerL2Open:{kimi:true}`+`expandedProviders:{kimi:true}` 挂载恢复明细（断言 Account 1 可见），点「概览」防抖后断言 `config_save` 收到 `providerL2Open:{kimi:false}`。经真实 PopupView apply_config → toggle_l2open → persist effect → debounce → config.save 路径，非 mock 回调。
- **f004（important，部分消除）**：主问题「折叠复位行为无测试触达」已修——新增「f004：折叠 provider 卡片复位 l2Open 为概览」（`popup_view_t250.test.tsx:216-294`）：点「折叠」经真实 `toggle_expand_provider`（`:583-591`）复位 l2open 并写盘。残余差异：config 回显使 `expandedProviders[X]=false` 时仍不复位 `l2Open`（`apply_config` `:166-178` 只同步，不复位）；该差异仅需「expanded=false 与 l2open=true 并存」的不一致配置才复现，不锚定任何 AC，非可观测正常操作缺陷，处置表已记录接受，不构成 blocker。
- **f005（minor，已消除）**：`config-schema.test.ts` 补 providerL2Open/activeUsageTab 接受用例 + 拒绝用例（non-boolean record / non-string），zod 两侧类型同步。
- **f006（minor，已消除）**：`toggle_expand_provider` 在 updater 外先算 `next_expanded`，`set_l2open_providers` 移出 `set_expanded_providers` updater 纯函数（`:583-591`）。
- **f007（minor，已消除）**：结构签名裁剪处新增 `set_l2open_providers` 过滤过期 provider（`:409-415`），与既有 collapsed/expanded 裁剪模式一致（ref 均不同步，效果一致触发一次写盘剪除）。

### 本轮新发现

- **t250_gen_f008 - t250 测试用真实 timers + wait_debounce 产生 act 警告，测试卫生回退**
    - 严重度：minor
    - 位置：`tests/unit/renderer/views/popup_view_t250.test.tsx:22-25`（`wait_debounce`）、`:102/:182/:210/:287`
    - 问题：本轮 5 用例跑出 8 条 `An update to PopupView inside a test was not wrapped in act(...)`；既有 popup_view 测试（t153/config/main）为 0 警告。真实 600ms 等待使 plugin/config 加载的异步 state 更新在 act 外落定。断言本身不依赖 act（config_save mock 独立于 DOM），无假通过风险；但属测试卫生回退，且 round-1 f002 建议的 `vi.useFakeTimers + advanceTimersByTime(500)` 本可同时消除该问题。
    - 建议：改 fake timers 推进防抖，或把异步 resolve 包进 act；若维持真实 timers，需消除 act 警告以恢复 0 警告基线。

### 结论

- 前轮 finding 复核：f001/f002/f003/f005/f006/f007 已消除；f004 主问题已消除，残余回显差异已记录接受（非阻断）。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - AC4 防抖窗口内（500ms）收到外部导入、且用户 pending 写未 flush 时，pending patch 仍会覆盖外部新值——此为 t153/t195 既有 debounce 设计的全局限制（collapsed/expanded/order 同受），非 t250 引入，未入表。
    - AC1「多 provider 选择互不影响」未单独建多 provider 独立用例，map 结构天然隔离，属覆盖可更广（minor）。
- 总体判断：7 条前轮 blocker（critical 2 / important 2）均已用 diff+代码核实消除，新发现仅 minor。无未解决 critical / important。
- 系统性 follow-up：t250 的 activeUsageTab 死锁已修，但同模式门控在 t222 sparkline（`PopupView.tsx:275-279` `has_sparkline_pref_ref`）仍存——config 无该键时用户改窗口偏好同样不写盘。建议沿用 round-1 立项标题「t222 sparkline 门控死锁核查」，slug `sparkline_pref_deadlock`，阻断性 important（与本 task 同款死锁、不同键，需人工/配置核实 sparklineWindowDays 是否恒在 config 中）；不阻断 t250 本轮 verdict。

verdict: PASS
