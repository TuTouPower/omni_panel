# Task review t357（reviewer_focus: 通用）

- task：`t357_connector_catalog_orphan`
- spec：`docs/tasks/t357_connector_catalog_orphan/spec.md`
- diff_anchor：`7f4d15fcab8d952fbd57c6d8d7e491c26663b248`
- target：`git diff 7f4d15fcab8d952fbd57c6d8d7e491c26663b248`
- round：1
- reviewed_at：2026-08-14 09:30 UTC+8

## Findings

### t357_gen_f001 - 清理在主进程被 stale-save 保护静默恢复，AC-001 未达成

- 严重度：critical
- 锚点：AC-001「createInstance 后任一步失败时，刚创建的实例被清理，不残留空账号」
- 位置：`src/renderer/hooks/use_connector_catalog.ts:88-93` 与 `src/main/ipc/config-ipc.ts:145-177`、`src/main/ipc/config-ipc.ts:366-372`
- 问题：清理走 `config.save({...latest.config, plugins: latest.config.plugins.filter(p => p.instanceId !== created.instanceId)})`，把创建实例从 plugins 数组里删掉再保存。但 `handleConfigSave` 有 stale-save 保护：任何「磁盘中存在但 incoming.plugins 缺失」的插件，只要其 manifestId 不在 `incoming.removedConnectorIds` 里，就会被重新保护回写（config-ipc.ts:145-177）。而 `createInstance` 已把该 manifestId 从 `removedConnectorIds` 墓碑清除（config-ipc.ts:366-372），`latest.config` 是创建后取的快照，其 `removedConnectorIds` 不含此 manifestId。因此清理 save 中 created 插件必落入保护分支被恢复：
  - `incomingPluginIds.has(plugin.instanceId)` 为 false（已 filter 掉）
  - `removedManifestIds.has(manifestId)` 为 false（墓碑已被 createInstance 清除）
  - → `protectedPlugins.push(plugin)`，`merged["plugins"] = [...incoming.plugins, ...protectedPlugins]`（config-ipc.ts:172）
  - 最终保存的 config 仍含 created 实例，且 `log.warn("Protected plugin ...")` 级别仅为告警，不报错。
  - 结果：对话框报失败，但下次打开设置仍能看到带默认参数的空账号——正是 spec 背景描述要消除的场景，清理成为静默空操作。
  - 路径覆盖：electron IPC（config-ipc.ts:667-677）与 web `/v1/config` POST（`src/main/core/local-api/server.ts:1499-1508`）共用同一 `handleConfigSave`，两路均受影响。
  - 对照：SettingsView 的正式删除路径 `with_removed_connector` 先把 manifestId 写入 `removedConnectorIds` 再 filter（`src/renderer/views/SettingsView.tsx:204-216`、`715-725`），正是为满足该保护；`tests/unit/ipc/config-ipc.test.ts:1087-1138`（保护语义）与 `1140-1180`（删除须靠 removedConnectorIds）两条既有测试直接验证了此行为。
- 建议：清理 payload 增加墓碑，镜像 `with_removed_connector`——`removedConnectorIds: [...(latest.config.removedConnectorIds ?? []), params.manifest_id]`（`params.manifest_id` 即创建所用 manifestId，实现侧已有）；或新增专用删除实例接口。同时补一个直达 `handleConfigSave` 的测试（复现「cleanup save 后 created 实例不残留」），hook 单测 mock 掉 `config.save` 无法触达该边界。

### t357_gen_f002 - 测试 fixture 空 plugins，核心断言为真空真，删掉清理逻辑仍绿

- 严重度：important
- 锚点：AC-001 测试可信；危险模式（恒真断言）最低 important
- 位置：`tests/unit/renderer/hooks/use_connector_catalog.test.ts:15-20`、`40-41`、`105-131`
- 问题：fixture `config.plugins = []`，`install_api` 的 `get_config` 返回 `{ config }`（空 plugins），`create_instance` 返回 `"real-instance"` 但从不把它写入 config。因此 `latest.config.plugins` 恒为空，两条新增 AC-001 测试断言 `saved.plugins.every(p => p.instanceId !== "real-instance")` 是空数组上的恒真式——即便把清理的 filter 整体删除，测试依旧通过（`[]` 的 every 恒 true，仅 `save_config` 被调一次仍满足）。测试未触达 AC-001 核心可观察行为「从含该实例的 config 中移除该实例」，也未验证「其余插件被保留」。
- 建议：让 fixture 的 config 真实包含 created 实例（如 `plugins: [{ instanceId: "real-instance", ... }]`），断言保存 payload 不再含 `real-instance` 且其它插件仍在；并补 f001 建议的 handler 级回归测试。

### t357_gen_f003 - 清理不回收 vault 中该 instanceId 的 secrets（孤儿 secrets）

- 严重度：minor
- 锚点：行为缺陷——saveSecrets 先成功、savePluginSettings/oauth 后失败时残留
- 位置：`src/renderer/hooks/use_connector_catalog.ts:88-93`；secrets 写入路径 `src/renderer/views/SettingsView.tsx:351-353` → `src/main/ipc/config-ipc.ts:236-240`
- 问题：`savePluginSettings` 先 `saveSecrets(created.instanceId, secrets)`（写 vault）再 `save_config`。若 secrets 已写盘、后续步骤抛错，清理只移除 plugin 条目，不调 `secretsStore.delete(keyFor(instanceId, key))`（`src/main/core/config/secrets-store.ts:19` 有 delete 能力但未用），vault 残留 `{createdInstanceId}:{secretName}` 孤儿键。注意：现有正式删除账号路径（SettingsView `ConfirmDelete`）同样不清 vault，属既有行为模式，非本 task 新增回归，故 minor；建议在实现修复 f001 时一并评估是否沿用该模式。
- 建议：清理时对 `params.secrets` 各键调删除接口（需补删除 secrets 的 IPC），或确认沿用既有「删除账号不清 secrets」约定并在 spec/注释说明。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（f001 critical、f002 important、f003 minor）
- 未进表的提示：
  - 旧测试「does not clear the temp instance when saving the real instance fails」（test.ts:93-103）与 AC-001 无冲突：该测试断言的是 `grok_logout` 未被调（temp instance=oauth_source_instance_id 不清），新逻辑下 savePluginSettings 失败时 logout 确实在 try 内未被执行，仍通过；AC-001 走 `config.save` 清理 created.instanceId，两者正交。
  - 清理基于 `latest.config`（savePluginSettings 前快照）不回丢其它插件字段：`latest.config` 是完整 config，filter 只动 plugins 数组。若 savePluginSettings 的 `config.save` 已成功写盘（后续 oauth 失败），保护逻辑会把 created 插件按磁盘态（含用户设置）恢复，此细节与 f001 同根，不再单列。
  - 清理 save 与 `get()` 之间若另有写入者，`saveIfBaseMatches` 冲突会致清理失败，已 `log.warn` 且不掩盖原错误——可接受。
- 总体判断：AC-001 的清理机制在主进程真实路径被 stale-save 保护静默抵消，规范核心行为未达成；测试因空 fixture 恒真断言无法暴露。存在未解决 critical，判 FAIL。
- 系统性 follow-up：修复方向与 `with_removed_connector`/`removedConnectorIds` 机制耦合，建议在 t357 修复 commit 内补齐，无需新 task。

verdict: FAIL

---

# Task review t357 Round 2（reviewer_focus: 通用）

- task：`t357_connector_catalog_orphan`
- spec：`docs/tasks/t357_connector_catalog_orphan/spec.md`
- diff_anchor：`7f4d15fcab8d952fbd57c6d8d7e491c26663b248`
- target：`git diff 7f4d15fcab8d952fbd57c6d8d7e491c26663b248`
- round：2
- reviewed_at：2026-08-14 01:30 UTC+8

## Findings

本轮无新 finding；f001-f003 复核见下。

## 结论

- 前轮 finding 复核（Round 2，以 diff 为准）：

  - **f001（critical）已消除**：清理 save 的 payload 现写回墓碑——`removedConnectorIds: Array.from(new Set([...(latest.config.removedConnectorIds ?? []), manifest_id]))`（`use_connector_catalog.ts:90-100`），镜像 SettingsView `with_removed_connector`「先写墓碑再 filter」语义（`SettingsView.tsx:205-216`、`715-725`）。核心路径核实通过：`createInstance` 建实例时 `executablePath = definition.executablePath`（`config-ipc.ts:355`，definition 按 `d.manifest.id === manifestId` 命中）；stale-save 保护对「磁盘有、incoming 无」的插件按 `d.executablePath === plugin.executablePath` 反查 definition 得 `manifest.id`（`config-ipc.ts:150-153`）——同一 definition，反查结果即创建所用 manifest_id，落入清理写入的墓碑内 → `removedManifestIds.has(manifestId)` 为 true → 跳过保护（`config-ipc.ts:154-156`），实例不被恢复。preload `config.save` → `CONFIG_SAVE` channel → `handleConfigSave`（`config-ipc.ts:667-677`），web `/v1/config` 共用同一 handler（`server.ts:1499-1508`），两路一致。机制由两部分测试合成覆盖：hook 测试断言 `saved.removedConnectorIds` 含 "grok"；既有 handler 测试分别验证「无墓碑则保护恢复」（`config-ipc.test.ts:1087-1138`）与「有墓碑则删除生效」（`config-ipc.test.ts:1140-1180`）。
  - **f002（important）已消除**：AC-001 首测 fixture 的 `get_config` 现返回含 `real-instance` 插件的 config（`use_connector_catalog.test.ts:108-124`），`saved.plugins.every(p => p.instanceId !== "real-instance")` 不再空集恒真——删掉清理 filter 该断言必失败。残余观察（非 blocking）：第二条 logout 失败路径测试仍用空 plugins fixture，其 `every` 断言空集恒真，但该测试独有贡献是「logout 失败也触发清理」（断言 `save_config` 被调一次），移除语义由首测覆盖，不构成缺口。
  - **f003（minor）未改，同意保留**：清理仍不回收 vault 中该 instanceId 的 secrets，与既有正式删除账号路径行为一致（SettingsView `ConfirmDelete` 同样不清 vault），属沿用既有约定而非本 task 回归；minor 可接受。
- 本轮新发现：0 条
- 未进表的提示：
  - 潜在边界：多个 manifest 共享同一 executablePath 时，保护反查 `.find` 可能命中非创建所用 definition，墓碑 mismatch 致实例被恢复——此为保护逻辑既有设计假设（executablePath 视为插件唯一标识，`config-ipc.ts:124` 甚至禁止修改），SettingsView 删除路径同等暴露，非本 task 引入回归，不判 blocking。
  - f001 曾建议补一条直达 `handleConfigSave` 的 cleanup-payload 回归测试；未补（`config-ipc.test.ts` 未改动），但机制两端各自有测试覆盖、合成已验证，无正确性缺口，仅提示。
- 总体判断：f001/f002 已真修并经测试触达，f003 为符合既有约定的 minor；无未解决 critical/important，判 PASS。
- 系统性 follow-up：无

verdict: PASS
