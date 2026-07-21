# Task review t040（reviewer_focus: 代码）

- task：`t040_show_failed_configured_accounts`
- spec：`docs\tasks\t040_show_failed_configured_accounts/spec.md`
- diff_anchor：`21911b4`
- target：`git diff 21911b4`
- round：1
- reviewed_at：2026-07-22 21:30 UTC+8

## Findings

### t040_code_f001 - `failedPlaceholdersByProvider` 值里的 `error` 字段是死数据

- 严重度：minor
- 位置：`src/renderer/lib/provider-usage.ts:189-192`、`229`、`280`
- 问题：Map 值类型声明为 `{ account: ProviderUsageAccount; error: string }[]`，push 时写入 `{ account: placeholder, error: snapshot.error }`。但唯一消费点（line 280）只解构 `account`：
    ```ts
    for (const { account } of failedPlaceholdersByProvider.get(provider) ?? []) {
    ```
    `error` 字段从不被读取，错误文案已经通过 `account.error` 流向 `buildAccountErrors`。Map 值里冗余存的 `error` 是死数据，误导读者以为别处会读它。
- 建议：Map 值类型改成 `ProviderUsageAccount[]`，push 直接 `list.push(placeholder)`。

### t040_code_f002 - 占位合成实际触达条件宽于注释与 spec 字面声明

- 严重度：minor
- 位置：`src/renderer/lib/provider-usage.ts:198-214`
- 问题：spec（docs/tasks/t040_show_failed_configured_accounts/spec.md:27）显式声明合成条件含 `(snapshot.items??[]).length===0`；line 207 注释也写「零 items：仅直连（非 gateway）failed connector 合成占位」。但实际控制流是：
    ```ts
    if (has_items && "updatedAt" in snapshot) { /* 处理 items */ continue; }
    // 落到此分支 = !has_items  OR  (has_items && !("updatedAt" in snapshot))
    if (snapshot.status === "failed" && connector.source !== "gateway" && ...) { /* 合成 */ }
    ```
    即 `failed` 快照同时带 items 且缺 `updatedAt` 时也会触发合成（既有单元测试 `does not synthesize when failed connector still has items` 因提供了 `updatedAt` 未覆盖此路径）。注释「零 items」与实际行为不符，后续维护者读注释易误判不变量。
- 备注：refresh-service 当前不会产出 `status:"failed"` 带 items 的快照（`refresh-service.ts:309-331`、`409-413` 均在 failed 时不写 items），故实际运行无差异；但代码层条件与注释/spec 字面不一致。
- 建议：任选其一——
    1. 在合成 `if` 里加 `!has_items &&` 严格对齐 spec；或
    2. 更新注释，声明此分支面向「无法处理真实 items 的 failed 直连 connector」更广语义，并补一条覆盖 items+缺 updatedAt 的测试钉住意图。

## 结论

- 本轮新发现：2 条（均 minor）
- 总体判断：核心链路（placeholder 合成、`account.error` → `buildAccountErrors` → ProviderAccountRow badge、CPA 不合成、真实账号不被覆盖）实现正确，spec AC 在代码层均被覆盖；两条 finding 都是代码质量层瑕疵，不影响功能与 AC 达成。

verdict: FAIL

## Round 2 (2026-07-22 03:25 UTC+8)

### 前轮 finding 复核

- **t040_code_f001（已修）**：Map 值类型已改为 `Map<UsageProvider, ProviderUsageAccount[]>`（`src/renderer/lib/provider-usage.ts:189`）；push 改为 `list.push(placeholder)` 直接放占位（line 229）；消费端 `for (const account of failedPlaceholdersByProvider.get(provider) ?? [])` 直接迭代账号（line 280）。`error` 字段下沉到 `ProviderUsageAccount.error`（line 41-42），由 `buildAccountErrors` line 370 `if (account.error)` 消费。原死数据路径彻底移除，类型层闭合。
- **t040_code_f002（已修）**：合成分支前置 `!has_items &&`（line 208），与 spec `items.length===0` 字面一致；注释同步更新为「严格对齐 spec」。`has_items` 由 `items.length > 0` 派生（line 195），`items` 经 `"items" in snapshot ? snapshot.items : []` 兜底（line 194），覆盖三种 snapshot（idle/loading/failed 无 items 字段）。

### 本轮新发现

- 0 条。

### 复核过程记录

- `pnpm typecheck` 通过（tsc --noEmit 无输出）。
- `pnpm test -- provider-usage`：54 tests passed。
- TS narrowing 复核：`snapshot.status === "failed"`（line 209）先将联合窄化到 failed 变体，后续 `snapshot.error`（line 226）访问类型安全；`"updatedAt" in snapshot` 运行时判定（line 222），failed 变体 `updatedAt?: string` 兜底为 `""`。
- 单元测试覆盖四象限：failed 直连+0 items 合成（正例）、gateway/CPA failed 不合成、failed+有 items 不合成、disabled 不合成，对齐 spec AC。
- smoke 测试 `tests/smoke/renderer-smoke.test.tsx` 同步翻转预期：从「显示空页」改为「显示采集失败 badge」，与新行为一致。

### 总体判断

两条 minor finding 均已真正修复，未引入新问题，spec AC 在代码层全覆盖。

verdict: PASS
