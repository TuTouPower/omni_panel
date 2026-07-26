# Task review t121（reviewer_focus: 代码）

- task：`t121_add_account_manifest_catalog`
- spec：`docs\tasks\t121_add_account_manifest_catalog/spec.md`
- diff_anchor：`931bfa135fe683235745ee9070a1d1891995acce`
- target：`git diff 931bfa135fe683235745ee9070a1d1891995acce -- src/ tests/smoke/setup.ts`
- round：2
- reviewed_at：2026-07-26 11:06 UTC+8

## Round 2 Findings

（本轮无新 finding。）

## 前轮 finding 复核

- **t121_code_f001**（important，已修）：`src/renderer/views/SettingsView.tsx:1012` 现为 `parameterValues: { ...plugin.parameterValues, ...nonSecrets }`，合并语义替代原整体替换。createInstance 写入的 manifest 非 secret 默认值（cpa 的 `monitor_claude/kimi/codex/antigravity` 等）在后续 savePluginSettings 调用中保留，仅被表单提交的同名字段覆盖。AC4「参数与密钥正确落盘」恢复成立。修复有效。
- **t121_code_f002**（minor，已修）：`src/renderer/components/AddAccountDialog.tsx:84-89` 改为两阶段查找，先 `catalog.find(c => c.manifest_id === vendor_id)`，未中再 `catalog.find(c => c.supported_providers.includes(vendor_id))`。claude/kimi/codex/antigravity 这些 cpa 监控目标 vendor 不再会误命中 cpa entry。修复有效。
- **t121_code_f003**（minor，已修）：`src/main/ipc/connector-ipc.ts:147` 删除 `?? { name: def.manifest.id }` 兜底，改用 `metadata_from_definition(def) as PluginMetadata`。注释说明 `def 非 null 时无 null 路径`。死代码清除。修复有效。
- **t121_code_f004**（minor，已修）：`src/renderer/components/AddAccountDialog.tsx:79-101` 新增 `ResolvedVendor` 接口，`find_vendor` 显式返回 `{ connector, manifest_id }`。handle_save（`:197`）与 handle_form_save（`:246`）改用 `selected_manifest_id` 而非 `metadata.name`。隐式契约消除。修复有效。
- **t121_code_f005**（important，遗留）：SettingsView.tsx 现 2347 行，仍超 important 阈值 800；本 task 在其中净增约 32 行（catalog state、useEffect、onAddAccount 重写）。task.md Round 1 处置表已标 `遗留` 并说明「本 task 不拆，收尾报告记拆分计划」。按本 task 范围属可接受遗留，不重新升级为本轮 finding。

## 本轮新发现验证

### metadata_from_definition 新增 `param.type !== "secret"` 过滤（task 提示要求复核）

- 位置：`src/main/ipc/connector-ipc.ts:61`
- 改动：`...(param.type !== "secret" && param.default !== undefined && { defaultValue: param.default })`（原为 `...(param.default !== undefined && { defaultValue: param.default })`）
- 影响面分析：
    - `metadata_from_definition` 被两处使用：`handleConnectorList`（`:110`，`config.plugins` 既有路径）和 `handleConnectorCatalog`（`:147`，t121 新增路径）。两路径共享同一过滤逻辑。
    - 全量扫描 16 个 manifest（`connectors/*/manifest.json`）：所有 manifest 中 `type: "secret"` 的参数 **均无 `default` 字段**（即原本就不触发 `defaultValue` 输出）。净效果：此过滤对 `connector:list` 既有行为**无行为变化**，对 `connector:catalog` 是预防性过滤。
    - spec 第 50 行不变量「密钥不得在 catalog 通道中传输；catalog 只含 manifest 元数据」得到加固：即使未来某 manifest 给 secret 参数加 default，也不会经 catalog 泄漏。
    - `SettingsForm.tsx:330, 380` 中 `defaultValue={values[param.name] ?? param.defaultValue ?? ""}` 仅用于非 secret 参数的 input 初值（secret 走 `secret_values` 分支，`:196-200`），无回归风险。
- 结论：改动安全，无新 finding。

### 其它扫描

- `handleConfigCreateInstance`（`config-ipc.ts:294-337`）参数过滤与 auto-seed（`auto-seed.ts:64-68`）一致：`param.type !== "secret" && param.default !== undefined`。两处对齐，无偏差。
- `find_vendor` 兜底 plugin_infos 分支（`:90-95`）保留 `metadata?.name` 作为 manifest_id 来源，是 legacy 路径（无 catalog 时的兜底），契约仍在，但仅当 catalog 未命中时触发。可接受。
- `catalog_entry_to_connector`（`:62-77`）构造的 pseudo ConnectorInfo 中 `name: entry.metadata.name ?? entry.manifest_id`，`metadata.name` 由 `metadata_from_definition` 设为 `definition.manifest.id`（`connector-ipc.ts:54`），与 manifest_id 一致；`?? entry.manifest_id` 是防御兜底，无副作用。
- AddAccountDialog `handle_save` / `handle_form_save` 仍无 try/catch（`:185-240, 242-254`），createInstance 失败 throw 跨 React 事件边界未捕获，dialog 卡 saving=false 不关闭。但这是 Round 1 已知范围外问题（duplicate 路径同样问题，非 t121 引入），不进本轮 finding。
- `tests/smoke/setup.ts:117, 146` 中 catalog/createInstance mock 返回 `[]`/`undefined`，与既有 duplicate mock 风格一致；属 test reviewer 范围。

## 结论

- 前轮 finding 复核：5 条全部已修或按既定遗留处置（f001-f004 已修，f005 遗留）。
- 本轮新发现：0 条。
- 总体判断：t121 主路径（catalog -> find_vendor -> createInstance -> 清墓碑 -> 合并 parameterValues 落盘）功能正确，spec AC1-AC6 应能通过；Round 1 四项已修 finding 修复到位，无修复引入的新问题。

verdict: PASS
