# Task review t095（reviewer_focus: 代码）

- task：`t095_user_custom_connector_support`
- spec：`docs\tasks\t095_user_custom_connector_support\spec.md`
- diff_anchor：`15a7e27b9e6c90701fbd5630a8739e7180819536`
- target：`git diff 15a7e27b9e6c90701fbd5630a8739e7180819536 -- src/ connectors/`
- round：1
- reviewed_at：2026-07-24 16:30 UTC+8

## Findings

### t095_code_f001 - 自定义 provider 默认排序到开头，违反 spec「order 末尾」

- 严重度：important
- 位置：`src/renderer/lib/provider-usage.ts:104-106`（`compare_providers`）
- 问题：spec `范围` 第 13 行明确写「`PROVIDER_LABELS` / `PROVIDER_ORDER`：对未知 provider 提供 fallback（label = provider 名、**order 末尾**）」。当前实现

    ```ts
    function compare_providers(a: string, b: string): number {
        return PROVIDER_ORDER.indexOf(a) - PROVIDER_ORDER.indexOf(b);
    }
    ```

    对未在 `PROVIDER_ORDER` 中的 provider（如用户新增的 `my_vendor`）返回 `-1`，`-1 < 任意合法 index`，导致未知 provider 在 `visible_providers_from_groups` 的 `[...providers].sort(compare_providers)` 中被排到**开头**，不是末尾。

    具体场景：新用户未保存 `providerOrder`，`PopupView` 的 `provider_order` 初始为 `[]`；`use_popup_derived.orderedProviders` 在 `provider_order.length === 0` 时直接返回 `visibleProviders`，此时若已启用一个自定义 connector（`my_vendor`）+ 内置 `claude`/`codex`，排序结果为 `["my_vendor", "claude", "codex"]`，自定义卡跑到了最前面。
    （仅当用户已保存过任意 providerOrder 时，`orderedProviders` 的 `remaining = visibleProviders.filter(p => !orderSet.has(p))` 分支才会把未知 provider 放到末尾，掩盖此 bug。）

- 建议：把 `compare_providers` 未命中时的权值改为「最大」而非 `-1`，例如：

    ```ts
    function rank(p: string): number {
        const i = PROVIDER_ORDER.indexOf(p);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }
    function compare_providers(a: string, b: string): number {
        return rank(a) - rank(b);
    }
    ```

### t095_code_f002 - `valid_providers` 过滤掉自定义 provider，拖拽顺序不持久化

- 严重度：minor
- 位置：`src/renderer/views/PopupView.tsx:107`（`valid_providers`），`:113` 与 `:206` 的 filter
- 问题：

    ```ts
    const valid_providers = useMemo(() => new Set(PROVIDER_ORDER), []);
    // ...
    const validated = order.filter((p): p is string => valid_providers.has(p));
    ```

    `PROVIDER_ORDER` 只列内置 provider。从 `config.providerOrder`（schema 已是 `z.array(z.string())`，后端可存任意 provider）加载时，自定义 provider 被 `valid_providers.has(p)` 过滤掉，永远进不了 `provider_order` state。结果：用户把自定义 provider 拖到位置 2 并保存，重启后该位置丢失——`orderedProviders` 的 `remaining` 分支把它强制回到末尾。
    这与 spec 范围「未知 provider 提供 fallback……order 末尾」配合 f001 看，属于 fallback 被过度加严：spec 要求是「默认末尾」，但当前实现是「无法保存非末尾位置」。

- 建议：把 `valid_providers` 改为「内置 + 当前可见 provider」并集，或直接去掉这层 filter（`config.providerOrder` 的 schema 已经是 `string[]`，不再需要客户端 enum 白名单）。

    ```ts
    const valid_providers = useMemo(
        () => new Set([...PROVIDER_ORDER, ...visibleProviders]),
        [visibleProviders],
    );
    ```

## 结论

- 本轮新发现：2 条
- 总体判断：schema/类型放开层落地正确（manifest loader、observation-mapping、IPC、renderer 标签 fallback、文档均覆盖 spec AC），但 `compare_providers` 未同步处理「未知 provider」分支，与 spec 明确的「order 末尾」语义相反；外加 `valid_providers` 白名单保留了 enum 时代的过滤，进一步限制自定义 provider 的排序持久化。两处都属于「schema 放开但聚合层未跟上」的一致性遗漏。

verdict: FAIL

## Round 2 (2026-07-24 17:05 UTC+8)

### 前轮 finding 复核

- **t095_code_f001（important）— 已修**。`src/renderer/lib/provider-usage.ts:104-111` 重写为

    ```ts
    function compare_providers(a: string, b: string): number {
        const rank = (p: string): number => {
            const idx = PROVIDER_ORDER.indexOf(p);
            return idx === -1 ? Number.POSITIVE_INFINITY : idx;
        };
        return rank(a) - rank(b);
    }
    ```

    未知 provider 的 -1 映射为 `+∞`，与已知 index [0..N-1] 比较时永远更大 → 排到末尾，符合 spec「未知 provider order 末尾」。两未知 provider 比较返回 `NaN`，按 ECMA-262 §23.1.3.30.1 SortCompare 规范等价于 `+0`，保留 `Set` 插入序，行为稳定可接受。

- **t095_code_f002（minor）— 已修**。`src/renderer/views/PopupView.tsx` 删除 `valid_providers = useMemo(...)`，`apply_config`（`:108-110`）改为 `const validated = [...order]`，`onConfigChange`（`:205`）改为 `synced_order_ref.current = [...config.providerOrder]`。白名单过滤全部移除，自定义 provider 拖拽位置可持久化。全仓 grep `valid_providers` 在 `src/` 下已无残留。

### 本轮新发现

#### t095_code_f003 - observation-mapping 模块 JSDoc 声称已删除的 provider validation

- 严重度：minor
- 位置：`src/main/core/scheduler/observation-mapping.ts:14-15`
- 问题：本 diff 在 `observation_to_metric_record` 中删除了 `usageProviderSchema.safeParse(obs.provider)` 过滤分支（含 `log.warn` 与 `return null`），但模块 JSDoc 未同步：
    > Deep module: one small interface (`observations_to_ready_state`) hides **provider validation**, field mapping, null-filtering, and updatedAt reduction.
    > 现在没有 provider validation，注释误导后续维护者，以为还有一道过滤拦住非法 provider。
- 建议：删除 JSDoc 中「provider validation,」字样，或改写为「field mapping, null-filtering, and updatedAt reduction」。

#### t095_code_f004 - plugin-metadata.supportedProviders schema 比 connectorProviderSchema 更宽

- 严重度：minor
- 位置：`src/shared/schemas/plugin-metadata.ts:52`
- 问题：同 task 内 `connectorProviderSchema = z.string().regex(/^[a-z][a-z0-9_]*$/)` 与 `usageItemSchema.provider = z.string().regex(/^[a-z][a-z0-9_]*$/)` 都强制 snake_case 不变量（spec AC「manifest provider 为任意 snake_case 字符串均被接受」），但 `supportedProviders` 放宽为 `z.array(z.string())`，接受空串、大写、连字符、Unicode 等违反 snake_case 不变量的值。原本是 `z.array(usageProviderSchema)`（比 manifest 更窄），改为 `z.string()` 后反向比 manifest 更宽，schema 间不再一致。
- 建议：改为 `z.array(connectorProviderSchema)`，与 manifest 同步约束。

## 结论（Round 2）

- 前轮 finding 复核：f001 已修，f002 已修。
- 本轮新发现：2 条（均 minor，均为文档/schema 一致性，非运行时 bug）。
- 总体判断：f001/f002 修复正确无回退；schema 放开层落地一致；本轮发现集中在「diff 删除 validation 后未同步相邻文档」与「schema 族内放宽幅度不一致」，均不阻塞核心 AC。

verdict: FAIL

## Round 3 (2026-07-24 07:40 UTC+8)

### 前轮 finding 复核

- **t095_code_f003（minor）— 已修**。`src/main/core/scheduler/observation-mapping.ts:14-16` JSDoc 重写为

    > field mapping, null-filtering, and updatedAt reduction. Provider is trusted
    > as-is from the manifest-declared value (t095 open namespace); no enum
    > re-filtering here.
    > 与实际代码一致（`usageProviderSchema.safeParse` 删除、`provider: obs.provider` 直通、`log`/`createLogger` import 也同步移除）。`log` 变量在文件内已无其他引用，无悬挂死代码。注释与实现同步，不再误导。

- **t095_code_f004（minor）— 已修**。`src/shared/schemas/plugin-metadata.ts:3,53` 改为 `import { connectorProviderSchema } from "./manifest"` + `supportedProviders: z.array(connectorProviderSchema).optional()`，与 `manifest.ts:80 provider: connectorProviderSchema` 同源同约束（`z.string().regex(/^[a-z][a-z0-9_]*$/)`）。snake_case 不变量在 manifest / plugin-output / plugin-metadata 三处 schema 族内一致，无放宽差。

### 本轮新发现

#### t095_code_f005 - `use_tab_navigation` 的 setActiveTab 类型签名退化为只剩字面量 "overview"

- 严重度：minor
- 位置：`src/renderer/hooks/use_tab_navigation.ts:8-12`
- 问题：本 task 把 provider 类型从 `UsageProvider` 枚举放开为 `string`，但该接口的 `setActiveTab` 联合类型只替换了一半：

    ```ts
    // 原始
    | (UsageProvider | "overview")
    | ((cur: UsageProvider | "overview") => UsageProvider | "overview")

    // 现状（diff 只删了 UsageProvider，未补 string）
    | (  "overview")
    | ((cur: string) => string)
    ```

    `UsageProvider` 被删除后，字面量联合退化为单个 `"overview"`，本应是 `string`。函数分支已正确放开为 `(cur: string) => string`，但直接值分支变成了只接受 `"overview"` 字面量，与同文件 `activeTab: string` / `orderedProviders: readonly string[]` 的放开方向相反。

    之所以 `pnpm typecheck` 不拦：PopupView 传入的 `setActiveTab` 是 `Dispatch<SetStateAction<string>>` = `(update: string | ((cur: string) => string)) => void`，参数逆变使实际函数能赋值给更窄的形参类型 `(update: "overview" | ((cur: string) => string)) => void`，类型检查被绕过。hook 内部只调用 `setActiveTab((cur) => ...)` 函数形式（L42-49），也不触发直接值分支的窄化。

    失败场景：任何后续开发者按此接口类型注释使用 hook，直接传 `setActiveTab("claude")` 这种字符串值会被 TypeScript 拒绝（`"claude"` 不能赋给 `"overview"`）。接口语义与 hook 名称「tab navigation」相悖。

- 建议：把 `| (  "overview")` 补回 `| string`，或直接用 `Dispatch<SetStateAction<string>>`：

    ```ts
    import type { Dispatch, SetStateAction } from "react";
    // ...
    setActiveTab: Dispatch<SetStateAction<string>>;
    ```

## 结论（Round 3）

- 前轮 finding 复核：f003 已修，f004 已修。
- 本轮新发现：1 条（minor，类型签名回归，运行时与 typecheck 均不拦）。
- 总体判断：R2 两处 schema/文档一致性 finding 正确修复无回退；全 diff 终检在 schema 放开层、IPC 类型层、renderer label/mark fallback 层均与 spec AC 对齐；唯一遗留是 `use_tab_navigation` 接口在类型放开时半完成（字面量分支未补 `string`），因函数参数逆变被 typecheck 掩盖，不影响运行时但接口语义错误。

verdict: FAIL

## Round 4 (2026-07-24 08:15 UTC+8)

### 前轮 finding 复核

- **t095_code_f005（minor）— 已修**。`src/renderer/hooks/use_tab_navigation.ts:8-12` `setActiveTab` 类型签名现为
    ```ts
    setActiveTab: (
        update:
            | string
            | ((cur: string) => string),
    ) => void;
    ```
    直接值分支已从字面量 `"overview"` 补全为 `string`，与同文件 `activeTab: string` / `orderedProviders: readonly string[]` / 函数分支 `(cur: string) => string` 完全对齐。L43 `tab_order: (string)[] = ["overview", ...orderedProviders]` 放开同步。接口语义与 hook 名称一致，未来调用方传 `setActiveTab("claude")` 等任意字符串值不再被 TypeScript 拒绝。修复彻底，无半完成残留。

### 本轮新发现

无。

### 全 diff 终检（用户加轮授权的终检范围）

- **schema 放开层**：`manifest.ts:12` `connectorProviderSchema = z.string().regex(/^[a-z][a-z0-9_]*$/)`；`plugin-output.ts:36` `usageItemSchema.provider` 同步为同一 regex；`plugin-metadata.ts:53` `supportedProviders: z.array(connectorProviderSchema).optional()`。三处 schema 族对 snake_case 不变量一致，满足 spec AC「manifest provider 为任意 snake_case 字符串均被接受」。
- **observation mapping**：`observation-mapping.ts:14-16` JDoc 已与实现同步（「Provider is trusted as-is… no enum re-filtering here」），L25-30 直接 `provider: obs.provider` 直通，`createLogger` / `usageProviderSchema` import 与 `log` 变量同步移除，无悬挂死代码。
- **聚合层 fallback**：`provider-usage.ts:104-111` `compare_providers` 未知 provider rank=+∞ 排末尾；`PROVIDER_LABELS: Record<string, string>` + `AccountRow.tsx:47` / `ProviderCard.tsx:101` / `SettingsView.tsx:1429` 均用 `?? provider` fallback；满足 spec AC「renderer 对未知 provider 显示 vendor mark fallback + provider 名作 label」。
- **PopupView 持久化**：`PopupView.tsx:104-110` `apply_config` 与 L202 `synced_order_ref.current = [...config.providerOrder]` 已移除 `valid_providers` 白名单过滤，自定义 provider 拖拽位置可持久化。
- **类型放开**：`use_dnd_handlers.ts:112` / `use_popup_derived.ts:103` 冗余 `activeTab as string` cast 已清理；`PopupView` state 全量改为 `string` / `Set<string>`。
- **残留 `as UsageProvider` cast**（`connector-ipc.ts:43` CPA monitor 过滤、`account-overrides.ts` 六处 `provider_key`、`SettingsView.tsx` / `AddAccountDialog.tsx` 内置 META 映射、`common-services.ts` `AddServiceId`）：
    - `connector-ipc.ts:43` 是 CPA gateway 的 `monitor_*` 参数解析（固定四个内置 provider，spec AC 不要求 CPA 支持自定义 provider），`safeParse` 过滤合理保留。
    - `account-overrides.ts` 的 cast 冗余但 `AccountOverrides` 已是 `Record<string, ...>`（`config.ts:21-24`），运行时索引对任意 string 正常，对自定义 provider override 读写无影响。
    - `AddAccountDialog` META / `common-services` `AddServiceId` 是内置 provider 专用映射，自定义 provider 走 `?? { fallback }` 或 undefined 兜底；session connector 的 auth_method 标签精度属于 web panel UI 细节，spec 明确「非范围」（spec 22 行）。
    - 以上均为 pre-existing 渐进迁移风格 cast，非本 task 引入，运行时无失败场景，不构成本轮 finding。

### 残留 risk 提示（不进 finding 表，仅供 adoption 参考）

- 后续若进一步清理 `as UsageProvider` cast（如 `account-overrides.ts` 改 `provider_key: string = provider`），可彻底完成类型放开迁移；当前对 t095 AC 无影响。

## 结论（Round 4）

- 前轮 finding 复核：f005 已修。
- 本轮新发现：0 条。
- 总体判断：R1/R2/R3 全部 finding 真修无回退；schema 放开、IPC/配置类型迁移、renderer label/mark fallback、PopupView 持久化、observation-mapping JSDoc 均落地并满足 spec 全部 AC；残留 `as UsageProvider` cast 为 pre-existing 渐进迁移风格，对运行时和 AC 无影响。

verdict: PASS
