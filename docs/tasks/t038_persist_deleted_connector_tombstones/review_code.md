# Task review t038（reviewer_focus: 代码）

- task：`t038_persist_deleted_connector_tombstones`
- spec：`docs\tasks\t038_persist_deleted_connector_tombstones\spec.md`
- diff_anchor：`0dc2833`
- target：`git diff 0dc2833 -- src/main/core/config/auto-seed.ts src/main/core/config/types.ts src/shared/types/config.ts src/main/index.ts src/renderer/views/SettingsView.tsx`
- round：1
- reviewed_at：2026-07-22 20:35 UTC+8

## Findings

### t038_code_f001 - tombstone append+dedup 逻辑在两处 onConfirm 逐字重复

- 严重度：minor
- 位置：`src/renderer/views/SettingsView.tsx:2188-2193` 与 `src/renderer/views/SettingsView.tsx:2217-2222`
- 问题：内置连接器删除确认（`deleteConfirmId` 分支）与 CPA 移除确认（`removeCpaConfirmId` 分支）的 tombstone 写入块完全相同——
    ```ts
    ...(manifest_id && {
        removedConnectorIds: [
            ...(config.removedConnectorIds ?? []),
            manifest_id,
        ].filter((id, idx, arr) => arr.indexOf(id) === idx),
    }),
    ```
    两个 `onConfirm` 的 `info = pluginInfos.find(...)` / `manifest_id = info?.metadata?.name` / `void save_config({...config, plugins: filter(...), <tombstone 块>})` 结构也一致，差异仅 id 变量名。若 tombstone 字段名、去重策略或写入路径变更，需要同步改两处。
- 建议：抽小 helper，例如
    ```ts
    function with_tombstone(config: AppConfiguration, manifest_id: string | undefined) {
        return manifest_id
            ? {
                  ...config,
                  removedConnectorIds: [...(config.removedConnectorIds ?? []), manifest_id].filter(
                      (id, idx, arr) => arr.indexOf(id) === idx,
                  ),
              }
            : config;
    }
    ```
    各 `onConfirm` 内 `plugins.filter(...)` 后调用 `with_tombstone({...config, plugins}, manifest_id)`。本项目 AGENTS.md 倾向"不为一次性代码做抽象"，2 处调用是否抽 helper 由 implementer 自行权衡；此处仅指出重复事实，不强制。

## 结论

- 前轮 finding 复核：本轮为 Round 1。
- 本轮新发现：1 条（minor）。
- 总体判断：规格实现层完整——schema/接口/auto_seed 跳过/index.ts 接线/SettingsView 双路径写入均落地，向后兼容（optional + `?? []`）、A10 精确匹配不变量守住、`metadata.name = manifest.id` 来源正确、tombstone 经 configStore merge 持久化链路通。唯一问题为两处删除确认的 tombstone 写入块逐字重复（minor，不阻断）。

verdict: FAIL

## Round 2 (2026-07-22 02:45 UTC+8)

### 前轮 finding 复核

- **t038_code_f001（minor）已修**：`src/renderer/views/SettingsView.tsx:808-820` 新增 `with_removed_connector` helper（`useCallback([], )`，无依赖纯函数），签名 `(base: AppConfiguration, manifest_id: string | undefined): AppConfiguration`。空 manifest_id 时 `return base`，非空时展开 base 并 append 去重——与原 inline 逻辑等价。
    - `deleteConfirmId` 分支（line 2194-2208）与 `removeCpaConfirmId` 分支（line 2219-2233）均改为：onConfirm 内先 `pluginInfos.find` 取 `info`，构造 `{...config, plugins: filter(...)}` 作为 base，再 `save_config(with_removed_connector(base, info?.metadata?.name))`。
    - 两处调用结构一致，原 verbatim 重复块（tombstone append + dedup）消除。差异仅在 id 变量名，符合预期。

### 本轮新发现

0 条。

扫描结论：

- 类型安全：`info?.metadata?.name` optional chaining 安全；`base.removedConnectorIds ?? []` 空数组兜底正确。
- helper 位置：`hide_account` 后、config-backed settings 前，就近紧邻两处使用点，合理。
- 圈复杂度：`with_removed_connector` CC=2，远低于阈值；两处 onConfirm CC 无显著上升。
- 死代码 / 命名：无残留，`with_removed_connector` 符合项目 snake_case 约定且语义准确。
- 文件体量（范围外提示，不进 finding）：`SettingsView.tsx` 2244 行已远超 important 阈值 800，但属既有架构债，本 task 净增 28 行，非本 task 引入，不阻断。

verdict: PASS
