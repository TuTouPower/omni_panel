# 代码审阅报告 2026-06-07

## 一、大文件（超过 500 行）

| 文件                                  | 行数 |
| ------------------------------------- | ---- |
| `src/renderer/views/SettingsView.tsx` | 2092 |
| `src/renderer/views/PopupView.tsx`    | 917  |
| `src/main/index.ts`                   | 752  |

---

## 二、潜在运行时 Bug

### 严重

1. **`SettingsView.tsx` AccountDialog 缺少 required props** — `AccountDialog` 内渲染 `<CpaConnectorSettings />` 但没传 `enabled` 和 `onToggleEnabled`。点启用开关会 crash：`TypeError: onToggleEnabled is not a function`。

2. **`use-config.ts:76` save queue 被 reject 毒化** — `update_config` 的 Promise chain 没有 `.catch(() => undefined)`，不像 `save()` 在 line 66 有。一次保存失败后，所有后续 `update_config` 都不会执行。

3. **`main/index.ts:372` getMetadataEndpoints 闭包过时** — 闭包捕获初始 `currentConfig`，但 `onConfigSaved` 只更新 `currentConfigSnapshot`，不更新 `currentConfig`。新增/导入的插件实例刷新时找不到 metadata endpoints。

4. **`PopupView.tsx:204` 拖拽排序竞态** — 快速拖拽会并发多个 `config.get().then(... config.save())` 链，旧的 provider order 可能覆盖新的。失败也被静默吞掉。

5. **`PopupView.tsx:344,381` disable/delete 无 await 无 catch** — `toggle_disable_provider` 和 `delete_provider` 的 config 读写链没有 await 也没有 catch，失败变成 unhandled rejection，UI 假装操作成功但实际没持久化。

### 中等

6. **`CpaConnectorSettings.tsx:117` effect 依赖不完整** — `useEffect` 只依赖 `connector.instanceId`，但读取了 `config`、`hasSecrets` 等。同 instanceId 下配置变更不会刷新表单，保存可能用旧数据覆盖新数据。

7. **`SettingsView.tsx:1087,1104` setTimeout 未清理** — `handleExport`/`handleImport` 用 `setTimeout` 设 `dataMsg`，组件卸载后回调仍执行。

---

## 三、重复代码（可抽取）

### 1. IPC logging wrapper

`config-ipc.ts` 和 `plugin-ipc.ts` 各写一套 `logged<T>()` 函数，开发模式日志+计时+错误警告完全一样。`event-ipc.ts`、`log-ipc.ts` 也重复类似结构。

可抽 `createLoggedIpcHandler()`。

### 2. Preload 事件订阅样板

`preload/index.ts` 里 `onStateChange`、`onConfigChange`、`onThemeChange`、`onSettingsNavigate` 等都是同一个 `ipcRenderer.on/removeListener` 模式。

可抽 `subscribeIpc<T>(channel, callback)`。

### 3. 刷新间隔 label/value 映射

`CpaConnectorSettings.tsx` 和 `SettingsView.tsx` 各自写了 `60→1分钟/300→5分钟/...` 的三元表达式和反向 map，重复 6 处。

可抽 `REFRESH_INTERVAL_OPTIONS` 常量 + `secondsToLabel()`/`labelToSeconds()`。

### 4. 账户 override 操作

`PopupView.tsx` 的 hide/disable/restore 和 `SettingsView.tsx` 的 restore 都手动操作 `config.accountOverrides` 的 `disabled[provider]`/`hidden[provider]`。

可抽 `addAccountOverride()`/`removeAccountOverride()`。

### 5. 异步表单保存模式

`SettingsForm.tsx` 和 `CpaConnectorSettings.tsx` 的 submit handler 都是：guard saving → 拆 secrets/nonSecrets → 先 saveSecrets 再 saveConfig → 设 error → finally reset saving。

可抽 `useAsyncSave()` hook。

### 6. Set toggle 操作

两处都有 `prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }`。

可抽 `toggleSetValue()`。

### 7. ResizeObserver 测量

`use-popup-height-report.ts` 和 `TrayMenu.tsx` 都是 ResizeObserver + report + cleanup。

可抽 `useResizeObserverReport()` hook。

### 8. 原子 JSON 文件写入

`config-store.ts`、`cache-store.ts`、`secrets-store.ts` 都是 ensureDir → stringify → write tmp → rename。

可抽 `writeJsonAtomic()`。

### 9. 深度对象遍历

`config_redaction.ts`、`config-store.ts`（sortKeys）、`logger.ts`（serialize_meta）都递归遍历 object/array。

可抽 `mapPlainObjectDeep()`。

### 10. 尺寸验证

`popup-ipc.ts` 和 `main/index.ts` 都验证 `{ width, height }` payload 的 number/isFinite。

可抽 `parseSizeReport()`。

---

## 四、死代码（不必要的 export）

zod 子 schema 被 `export` 但外部无导入，不影响运行，可去掉 export 减少公共 API 面：

### `src/main/core/config/types.ts`

- `appLanguageSchema`
- `pluginConfigurationSchema`
- `proxyConfigurationSchema`
- `mainPanelModeSchema`
- `floatingHeightModeSchema`
- `usageBarColorSchemeSchema`
- `usageBarStyleSchema`
- `usageLabelMapSchema`
- `floatingBoundsSchema`

### `src/shared/schemas/plugin-output.ts`

- `usageDisplayStyleSchema`
- `usageStatusSchema`
- `usageColorSchema`
- `usageItemSchema`
- `pluginChartSegmentSchema`
- `pluginChartBucketSchema`
- `pluginChartSchema`

### `src/shared/schemas/plugin-metadata.ts`

- `pluginParameterTypeSchema`
- `pluginParameterOptionSchema`
- `pluginParameterMetadataSchema`
- `pluginEndpointsSchema`

### 其他

- `src/main/core/popup/popup-height-controller.ts`: `HEIGHT_REPORT_DEBOUNCE_PX`
- `src/main/ipc/config-ipc.ts`: `handleConfigDuplicate`（函数被用，export 多余）
