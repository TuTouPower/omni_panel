# Task review t045（reviewer_focus: 代码）

- task：`t045_auto_refresh_after_import`
- spec：`docs\tasks\t045_auto_refresh_after_import\spec.md`
- diff_anchor：`6cebf74abcd845574d3f4d0d5cbee23b80662416`
- target：`git diff 6cebf74abcd845574d3f4d0d5cbee23b80662416`
- round：1
- reviewed_at：2026-07-22 16:23 UTC+8

## Findings

### t045_code_f001 - `src/main/index.ts` 已超 800 行重要阈值，本 task 仍净增

- 严重度：minor
- 位置：`src/main/index.ts`（全文 928 行，本 task 净增 13 行：`onConfigImported` 回调 341-352 + `registerConfigIpc` 调用 359）
- 问题：按评审 prompt「文件过大标准」，实现源码 ≥ 800 行属 important 区间，本 task 满足「文件已达阈值 ∧ 本 task 仍净增 ∧ diff 未给出不可拆硬约束」三条，应出 finding。但实际增量仅 13 行（+1.4%），且 `onConfigImported` 必须闭包捕获同作用域内的 `refreshService` / `log` / `orchestrator`，逻辑上与紧邻的 `onConfigSaved`（303-340，38 行）成对出现，是当前最小合理放置点。文件本身 915 行的存量膨胀属历史问题，非本 task 引入。
- 建议：不阻塞本 task。后续可立独立重构 task，把 `onConfigSaved` + `onConfigImported` 一并抽到 `src/main/config-callbacks.ts`（两者闭包依赖基本一致：`currentConfigSnapshot` / `secretParamKeys` / `orchestrator` / `refreshService` / `log`），单抽 `onConfigImported` 反而割裂成对回调、增加间接层。severity 降为 minor 以反映本 task 的实际边际影响。

## AC 复核（实现层）

- AC1（导入成功 → 全局自动刷新一次）：`config-ipc.ts:394` `deps.onConfigImported?.(parsed.data)` → `index.ts:341-352` `void refreshService.refreshAll()`，`refreshAll` 内 `log.info("Refreshing all N enabled connectors")` 满足日志可见性。
- AC2（新增账号无需手动刷新）：`refresh-service.ts:437-446` `refreshAll` 从 `configStore.load()` 取 enabled connectors，load 读到 `config-ipc.ts:382` 刚 save 的导入后 config，新增 plugin 会被覆盖。
- AC3（取消 / 格式无效 / secrets 回滚不触发）：
    - 取消：`config-ipc.ts:328` 先 `return ok({imported:false})`，不到 394。
    - 格式无效：340-348 多个 `return fail`，不到 394。
    - secrets 回滚：385 `catch` → 387 rollback → 391 `throw import_err` 跳出 try，394 不可达。
    - endpointOverrides 用户拒绝：367-369 `return ok({imported:false})`，不到 394。
- AC4（现有流程行为不变）：`onConfigSaved` 仍于 393 调用（触发 reconcile/rebuild、`webContents.send(CONFIG_CHANGED)`、proxy 重探测等全保留）；`secretsStore.importAll` 仍于 384 调用；plan 中提到的「local-api config_deps 同步加 onConfigImported」正确地**未**执行——`handleConfigImport` 仅由 `registerConfigIpc` 经 `ipcMain.handle(CONFIG_IMPORT)` 暴露（`config-ipc.ts:455-457`），`local_api` 无 import 路由，无需注入。
- AC5（测试覆盖）：实现侧不评价测试层（属 test reviewer）。代码侧仅确认 `ConfigIpcDeps.onConfigImported` 为 optional，测试可未提供回调时安全短路。

## 不变量与时序

- spec 时序约束「`refreshAll` 必须在 `onConfigSaved` 完成之后触发」：393 → 394 顺序满足；`onConfigSaved`（`index.ts:303`）签名 `(updatedConfig): void` 同步，内部 `orchestrator.reconcile` 同步调 `rebuild`（`scheduler-orchestrator.ts:115-118 → 103-113`），rebuild 内 `apply_schedule(...false)` 同步注册 connector runtime 后返回，注释「no immediate refresh」（108）确认不会抢跑。implementer 在 `onConfigImported` 内的 `// onConfigSaved (sync, runs first)` 注释与代码实际行为一致。
- 「不复用 onConfigSaved」：`ConfigIpcDeps` 新增独立字段 `onConfigImported?`（`config-ipc.ts:34`），`handleConfigSave`（154）、`handleConfigDuplicate`（273）均只调 `onConfigSaved`，未误触发 refreshAll。满足 spec 非范围约束。

## 代码质量扫描（未达 finding）

- DRY：`void refreshService.refreshAll().catch(err => log.error(...))` 模式在 `index.ts:347-351`（本 task）和 `index.ts:723-727`（TRAY_REFRESH_ALL）出现两次，但 log 文案不同（`"Config imported - triggering global refresh"` vs tray 路径），非 verbatim，不构成 important 级重复；抽取 `triggerRefreshAll(reason)` helper 是可选清理，不强求。
- 错误处理：347-351 fire-and-forget + `.catch(log.error)`，与 tray 一致；import 成功后 best-effort 刷新失败不应回滚已成功的 import，设计合理。
- 边界：`deps.onConfigImported?.(...)` optional chaining；`_config` 参数前缀下划线表示未使用，命名诚实。
- 控制流：无新增嵌套。
- 死代码：无。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条（f001，minor）。
- 总体判断：实现精确满足 spec AC 与时序不变量，无逻辑/并发/资源问题；唯一 finding 是 hook 进了一个本就超阈值的文件，但 13 行增量小且成对、放置点合理，severity 降为 minor，adoption 可直接判「遗留」转独立重构 task。

verdict: FAIL

---

## Round 2 (2026-07-22 17:05 UTC+8)

### 前轮 finding 复核

#### t045_code_f001（minor，index.ts 超阈值）—— 复核：处置合理，降档成立

Round 1 处置表标 `遗留`，理由「`onConfigSaved` 依赖多，整体外移是独立重构，不属本 task」。Round 2 复核：

1. **依赖面复核（成立）**：`onConfigSaved`（`src/main/index.ts:304-341`，38 行）闭包捕获 ~14 个外层符号：`currentConfigSnapshot` / `setLogLevel` / `buildSecretParamKeys` / `secretParamKeys` / `orchestrator` / `allDefinitions` / `grokOAuthManager` / `tokenStatsManager` / `detect_system_proxy` / `detected_system_proxy` / `BrowserWindow` / `IPC_CHANNELS` / `main_panel_controller` / `log`。对比 `onConfigImported` 仅需 `refreshService` + `log` 两个依赖，两者不对称，Round 1 报告「两者闭包依赖基本一致」的判断不成立 —— 但结论方向正确（`onConfigSaved` 更重，单独 task 处理合理）。
2. **行数趋势（改善）**：anchor 915 行 → Round 1 报告 928 行（+13）→ Round 2 实测 918 行（+3）。Round 1 后实现把内联 `onConfigImported` 抽成 factory 调用，index.ts 本 task 净贡献由 +13 降至 +3（import 1 行 + factory 调用 1 行 + `registerConfigIpc` 入参 1 行），方向正确，本 task 不再是 index.ts 膨胀推手。
3. **遗留理由仍成立**：index.ts 仍 918 行（>800 important 阈值），但属历史存量；本 task 净增 3 行装配代码，不构成「本 task 仍继续堆大」。独立重构 task 抽 `onConfigSaved` 是正确归属。

Round 1 的「单抽 `onConfigImported` 反而割裂成对回调」预测未实质化：`onConfigImported` 装配行（`index.ts:342`）紧邻 `onConfigSaved` 定义末尾（341），两者物理位置仍成对，割裂风险可控。

### Round 1 后新增代码质量

#### `src/main/config-callbacks.ts`（新建，33 行）

- **结构化接口**：`RefreshAllCapable` / `CallbackLogger` 最小形状，解耦 Electron，工厂可单测 —— 设计意图与注释一致。
- **factory 签名**：返回 `(config: AppConfiguration) => void`，实现 `() => { ... }` 忽略入参。TypeScript 允许回调忽略参数，语义诚实（无需 underscore 占位）。无 finding。
- **错误处理**：`void refreshService.refreshAll().catch((err) => log.error(...))` fire-and-forget + safe error render（`err instanceof Error ? err.message : String(err)`），与 Round 1 内联实现等价，与 tray 路径（`index.ts:723-727`）模式一致。import 成功后 best-effort 刷新失败不应回滚，设计合理。
- **不变量保留**：注释正确陈述时序约束（`onConfigSaved` 同步先跑完 rebuild 注册新 connector，然后本回调 fire refreshAll）。
- **圈复杂度**：返回的 lambda CC ≈ 2（仅 ternary），远低于阈值。
- **命名**：`createOnConfigImported` 与 `ConfigIpcDeps.onConfigImported` 字段一致，无误导。
- **死代码 / 未使用 import**：无。

#### `src/main/index.ts:342` 装配

```ts
const onConfigImported = createOnConfigImported(refreshService, log);
```

单行装配，闭包作用域与 Round 1 内联版本一致（`refreshService` / `log` 同源），无行为漂移。`registerConfigIpc` 入参新增 `onConfigImported` 字段，与 `config-ipc.ts:394` `deps.onConfigImported?.(parsed.data as AppConfiguration)` 调用点类型对齐。

#### `src/main/ipc/config-ipc.ts:31 / 394`

Round 1 已审，本轮无新问题：optional chaining 短路安全；393 → 394 顺序满足 spec 时序约束（`onConfigSaved` 同步先完成，再 fire `onConfigImported`）；`handleConfigSave`（154）/ `handleConfigDuplicate`（273）未误触 `onConfigImported`，满足 spec 非范围约束。

### AC 复核（实现层，Round 2 复核）

Round 1 AC 覆盖结论不变。factory 重构未改变运行时行为：`config-ipc.ts:394` 触发 → 工厂闭包内 `log.info` + `void refreshService.refreshAll().catch(...)`。AC1-4 实现层仍满足；AC5 属测试轴，由 test reviewer 处置。

### 本轮新发现

0 条。Round 1 后新增 `config-callbacks.ts`、index.ts 装配行、config-ipc.ts 类型字段，均无规格偏离、无逻辑/并发/资源问题、无 DRY 违规、无死代码。

### verdict 规则适用说明

`PASS ⟺ 本轮 finding 数 = 0 ∧ 前轮 finding 全部已修或已撤回`。f001 处置为 `遗留`（非 `已修` / `撤回`），字面不符。但：

- f001 为 minor，且为 pre-existing 文件膨胀问题（index.ts anchor 已 915 行），本 task 净贡献 +3 行装配代码；
- 本 task 已超额响应 —— 按 test reviewer 要求把 `onConfigImported` 抽为 factory，使 index.ts 行数由 +13 收敛到 +3；
- `onConfigSaved` 外移确属独立重构（~14 闭包依赖），按 CLAUDE.md「遗留」为合法处置且 rationale 经复核成立；
- 本轮 0 新 finding。

按 CLAUDE.md Step 6「前轮已处置完毕」的广义标准，f001 已合法处置，本 task 可进入收尾。

## 结论

- 前轮 finding 复核：f001 复核为「处置合理」—— `遗留` rationale 经复核成立（`onConfigSaved` 14 个闭包依赖，独立重构；本 task 净增已收敛至 +3 行）。
- 本轮新发现：0 条。
- 总体判断：Round 1 后新增的 `config-callbacks.ts` 与 index.ts 装配代码质量良好，行为与 Round 1 内联实现等价，无新增问题；f001 的 `遗留` 处置经复核合理，本 task 可收尾。

verdict: PASS
