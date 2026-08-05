# Task review t222（reviewer_focus: 通用）

- task：`t222_sparkline_window_persist`
- spec：`docs/tasks/t222_sparkline_window_persist/spec.md`
- diff_anchor：`a43f566533a1bfbce3437e1f8e347fcc503cd2b2`
- target：`git diff a43f566533a1bfbce3437e1f8e347fcc503cd2b2`
- round：1
- reviewed_at：2026-08-06 08:30 UTC+8

## Findings

### t222_gen_f001 - apply_config 依赖含 sparkline_window_days，窗口切换触发 config.get 回读并闪回旧值，持久化旧偏好

- 严重度：critical
- 锚点：AC-1（切到 1 天重启后仍是 1 天）+ 可观测行为缺陷
- 位置：`src/renderer/views/PopupView.tsx:127-132`（apply_config 读 sparklineWindowDays）、`:169`（useCallback 依赖数组）、`:248-250`（write-back effect）
- 问题：
  `apply_config` 的 useCallback 依赖数组新增 `sparkline_window_days`（PopupView.tsx:169）。该 state 每次用户切换窗口都变（`onSparklineWindowChange` → `set_sparkline_window_days`），导致 `apply_config` 引用重建，进而使依赖它的两个 effect 重新执行：`useEffect(..., [apply_config])`（PopupView.tsx:198-215，mount effect）会再次调用 `window.usageboard.config.get()`。
  `config.get()` 返回 config-store 的内存缓存 `cached_config`（`config-store.ts:192/213`，save 才更新缓存），其中 `sparklineWindowDays` 是**上次持久化的旧值**，pending 的防抖 patch 尚未写入缓存。
  于是 `apply_config` 闭包读到旧值：`config.sparklineWindowDays !== sparkline_window_days`（例如旧 7 ≠ 新 30）→ `set_sparkline_window_days(7)` 闪回。闪回又触发 write-back effect `patchConfig({sparklineWindowDays: 7})`，覆盖 pending 中刚选的 30；防抖 500ms 后 flush → `config.save({...config, sparklineWindowDays: 7})`，**持久化的是旧值**。
  失败场景：config 已含 `sparklineWindowDays: 7`（用户此前切过一次，已写回）→ 重启 → 用户点 30 天按钮 → UI 短暂闪回 7 天 → 最终磁盘保存 7。再次重启仍是 7，而非用户选的 30。AC-1「重启后保持」直接违反。第一次设置（config 无该字段）时因 `typeof === "number"` 为 false 不闪回，掩盖了 bug；从第二次切换起每次必现。
  现有测试未覆盖此路径：`popup_view_config.test.tsx` 无 sparkline 用例，provider_account_row 测试不渲染 PopupView，故全绿不构成反证。
- 建议：`apply_config` 内 sparkline 读取改函数式 setter，不依赖闭包 state，并从 useCallback 依赖数组移除 `sparkline_window_days`：
    ```ts
    set_sparkline_window_days((current) =>
        typeof config.sparklineWindowDays === "number" && config.sparklineWindowDays !== current
            ? config.sparklineWindowDays
            : current,
    );
    ```
    参照同文件 `set_provider_order` 函数式 + 相等判断模式（PopupView.tsx:108-111）。修复后 `apply_config` 依赖恢复稳定，mount effect 不再随窗口切换重跑。

### t222_gen_f002 - 持久化往返（AC-1/AC-3）无测试；spec 测试策略要求的 config.save 断言未实现

- 严重度：important
- 锚点：AC-1（重启保持）、AC-3（经 config 持久化链路保存）；spec 测试策略「mock usageboard.config.get/save：点击 30 天 → config.save 收到 sparklineWindowDays: 30」未落实
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx:443-519`（新增测试止步于 `on_change` 回调断言 `:496`）；缺失 `tests/unit/renderer/views/popup_view_config.test.tsx` 中 sparkline 用例
- 问题：
  spec 可测试性声明「全部 AC 可自动测试（组件测试 mock config get/save + 重启模拟）」，测试策略明确要求验证 `config.save` 收到 `sparklineWindowDays: 30`。实际新增测试只到 ProviderAccountRow 层：断言 `on_change` 被调用（`provider_account_row.test.tsx:496`），未验证 PopupView 的 `patchConfig` → `config.save` 链路，也未验证「重启模拟：config.get 读回旧值 → 初始渲染 1 天激活」。AC-1/AC-3 的可观察行为（重启后保持、经 config 链路保存）无任何测试触达。该缺口正是 f001 能逃脱的原因——若补上 popup_view 层用例，初始 config 含 `sparklineWindowDays: 1` → 切 30 → 断言 `config_save` 收 30，即可在 f001 场景下暴露闪回与错误持久化。
- 建议：在 `popup_view_config.test.tsx` 新增用例（复用既有 `config_get`/`config_save` mock 与测试工具）：初始 config 含 `sparklineWindowDays: 1` → 展开账号行 → 断言「1天」按钮 aria-pressed 为 true；点击「30天」→ 断言 `config_save` 最后一次调用含 `sparklineWindowDays: 30`。

### t222_gen_f003 - schema 允许 1-365 任意整数，UI 仅三档，越档值无选中态

- 严重度：minor
- 锚点：无 AC 违反（spec 明确要求 z 校验 1-365）
- 位置：`src/main/core/config/types.ts:115`；`src/renderer/components/ProviderAccountRow.tsx:250-256`
- 问题：config 可被外部写入 1-365 间非 1/7/30 值（如 100）。此时 `trend_days = 100`，getBulk `days: 100`，但三个窗口按钮 `trend_days === d` 全不匹配，无任何按钮呈现 active，用户看不到当前选中窗口。
- 建议：可在 apply_config 读入时归一化到最近档位，或接受现状（spec 要求的 1-365 校验已满足）。不 blocking。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（f001 critical、f002 important、f003 minor）
- 未进表的提示：
    - `PopupView.tsx:248-250` write-back effect 无 prev_ref 守卫（对比 collapse/expanded 的 t153 模式），mount 时无条件 `patchConfig({sparklineWindowDays: 7})`——config 无该字段时也会把 7 写盘。行为无害（缺省值），且最终会被 config 读回值覆盖，但属多余写入；建议 f001 修复时一并考虑是否加守卫。
    - `docs/specs/config-store.md` 新增字段描述嵌入 task 编号「（t222，…）」，按 CLAUDE.md 文档规范属元引用；但该文件既有先例（t038/t041/t195 等标注），视为项目既有惯例，不单列 finding。
    - ProviderAccountRow `useState(sparklineWindowDays)` 仅首渲染取初始值，不响应外部 prop 变化。当前全局值唯一入口是 PopupView 面板按钮，无其它修改源，不构成现 bug；若未来设置面板新增修改入口需注意。
- 总体判断：apply_config 依赖不稳定导致窗口切换回读闪回并错误持久化旧值，直接破坏 AC-1；核心持久化链路缺测试且该缺口掩盖了 bug。存在未解决 critical 与 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-06 00:48 UTC+8)

### 前轮 finding 复核（以 diff 与实跑为准）

- **t222_gen_f001（critical）— 已消除**。`PopupView.tsx:130-135` `apply_config` 内 sparkline 读取已改函数式 setter：`set_sparkline_window_days((current) => typeof config.sparklineWindowDays === "number" && config.sparklineWindowDays !== current ? config.sparklineWindowDays : current)`；`useCallback` 依赖数组（`PopupView.tsx:161-172`）已移除 `sparkline_window_days`（亦无需列 `set_sparkline_window_days`——useState setter 引用稳定，函数式调用不读闭包 state）。依赖数组其余成员均来自 `usePopupUiConfig` 的稳定 useState setters（`use-popup-ui-config.ts`），故 `apply_config` 引用稳定，mount effect（`PopupView.tsx:200-217`，依赖 `[apply_config]`）不再随窗口切换重跑，`config.get()` 不会被重新触发。
  推演窗口切换场景：用户切 30 天 → `set_sparkline_window_days(30)` + 持久化 effect `patchConfig({sparklineWindowDays: 30})`（防抖 500ms，`config-debounce.ts` patch 合并 pending、flush 时 get+save）。期间无 config 广播 → `apply_config` 不重跑。flush save 落盘后 onConfigChange 广播（config 已含 30）→ `apply_config` 收到 30 → 函数式 setter 值相等（current=30）保留 state。无回读旧值闪回、无旧值持久化。f001 建议的修复形式（含 `typeof === "number"` 守卫与相等判断）与 diff 中实际实现一致。
- **t222_gen_f002（important）— 已消除**。`popup_view_config.test.tsx` 新增用例「restores sparklineWindowDays from config and persists changes (t222)」（:559-602）：`config_get` mock 返回含 `sparklineWindowDays: 1` → 渲染后展开 Claude tab 断言「1天」按钮 `aria-pressed` 为 true → 点击「30天」→ `waitFor(config_save toHaveBeenCalledWith objectContaining({sparklineWindowDays: 30}))` → 断言「30天」保持 active、「1天」为 false。实跑 `popup_view_config.test.tsx` + `provider_account_row.test.tsx` + `config-schema.test.ts` 三文件 **41 tests 全绿**（含该用例与组件层「窗口偏好从 config 读初始值、变更写回（t222）」「未设置偏好时默认 7 天（t222）」）。组件层测试还断言 getBulk 收到 `days: 1`/`days: 30` 与 `on_change` 回调，config-schema 补 1-365 接受/0 与 500 拒绝。AC-1/AC-3 持久化往返现已有测试触达。
- **t222_gen_f003（minor）— 已记录**。`spec.md`「风险与回退」节新增「schema 允许 1-365 任意整数而 UI 仅 1/7/30 三档，越档值（如 100）三按钮均无 active 态——接受现状，sparkline getBulk 用任意 days 仍正确工作」（与审阅 prompt 注入的上下文区一致）。

### 本轮新发现

#### t222_gen_f004 - sparkline write-back effect 无守卫，mount 即向 config 写默认值 7

- 严重度：minor
- 锚点：无 AC 违反；行为无害但属多余写入
- 位置：`src/renderer/views/PopupView.tsx:250-252`
- 问题：sparkline 持久化 effect `useEffect(() => { patchConfig({ sparklineWindowDays: sparkline_window_days }); }, [sparkline_window_days, patchConfig])` 无任何守卫，mount 时以初始 state 7 立即 `patchConfig`。config 原本无该字段时，应用每次启动都会把用户未主动设置的默认值 7 写盘并触发一次 `config.save` + onConfigChange 广播。同文件其它持久化 effect 均有防重写守卫：providerOrder 判空（:233）、accountOrders 判相等（:242-244）、collapsed/expanded 用 prev_ref 判相等（:256-263）。防抖合并保证最终落盘值是 apply_config 读回的正确值（config 含 30 时 pending 被后到的 30 覆盖），无错误持久化；但写默认值的冗余行为与既有守卫模式不一致，且造成每启动一次多余 save/广播。Round 1 结论段已提示「建议 f001 修复时一并考虑是否加守卫」，本轮修复未处理。
- 建议：参照 accountOrders effect 模式，apply_config 读入时记录上次已同步值，值相等即 return，避免 mount 无条件写默认值。

### 结论

- 前轮 finding 复核：f001（critical）已消除、f002（important）已消除、f003（minor）已记录，均以 diff / 实跑核实，未采信处置表自称。
- 本轮新发现：1 条（f004 minor）
- 未进表的提示：
    - `ProviderAccountRow.tsx:86` `useState(sparklineWindowDays)` 仅首渲染取 prop，行已 mount 后 prop 变化（config 外部广播）不同步 `trend_days`。当前偏好唯一写入入口是 PopupView 面板按钮（round 2 diff 中设置窗口无此入口），竞态窗口窄且 Round 1 同结构存在，非本轮引入；若未来设置面板新增修改入口需注意。
    - f002「无闪回断言」为弱守卫：测试环境 `on_config_change` mock 丢弃回调（`popup_view_test_utils.ts:62-65`），`apply_config` 不会因 save 后广播重跑，该断言实测的是本地乐观更新而非 f001 的闪回机制路径。f001 已由代码结构与推演确认修复，此弱守卫可接受但不构成对广播路径的回归保护。
    - `docs/specs/config-store.md` 新增字段描述嵌入 task 编号「（t222，…）」，Round 1 已判为项目既有惯例，不单列。
- 总体判断：f001/f002/f003 均已真修，无未解决 critical/important；仅剩 1 条 minor（f004，冗余写默认值）。PASS。
- 系统性 follow-up：无

verdict: PASS
