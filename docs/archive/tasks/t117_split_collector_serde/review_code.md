# Task review t117（reviewer_focus: 代码）

- task：`t117_split_collector_serde`
- spec：`docs/tasks/t117_split_collector_serde/spec.md`
- diff_anchor：`be9dbb3447dd211b95969533da1b0c645721c9e4`
- target：`git diff be9dbb3447dd211b95969533da1b0c645721c9e4`
- round：1
- reviewed_at：2026-07-26 03:35 UTC+8

## 评审依据

- 仓库根：`D:/Dev/Code/omni_usage`（与 task 所属一致）。
- diff 范围：`src/main/core/token-stats/scan-state.ts`（新建，181 行）、`src/main/core/token-stats/collector.ts`（517→399 行）、`docs/tasks_index.json`、`docs/tasks/t117_split_collector_serde/task.md`。
- 对照基线：`git show be9dbb3447dd211b95969533da1b0c645721c9e4:src/main/core/token-stats/collector.ts` 的内联 serde 段（原 90–252 行）。
- 验证命令：`pnpm typecheck`（0 错误）、`pnpm test`（1739/1739 pass，含 `collector-state.test.ts` 7 用例）、`pnpm exec prettier --check` t117 两文件（clean）、`node node_modules/eslint/bin/eslint.js` t117 两文件（exit 0）。

## 规格合规(实现层)

|AC|状态|证据|
|---|---|---|
|`collector.ts` 行数 < 400（或接近）|满足|`wc -l`：399 行。|
|`pnpm test` 全绿（collector-state 7 用例不回归）|满足|1739 pass，`collector-state.test.ts` 全绿。|
|`pnpm typecheck` 0 新增错误|满足|tsc --noEmit 无输出。|
|serde 行为不变（load 损坏/缺失回退、save round-trip）|满足|逐字迁移，见下「不变量核对」。|

不变量核对（与 anchor 版逐行比对）：

1. `serialize_bucket` / `deserialize_bucket` / `serialize_state`：函数体逐字迁移，仅参数化为 `maps: ScanStateMaps`。`daily` Map↔Record 转换、`records` 字段删除/重置为 `[]`、mtime 保留 float 的注释一并迁移。
2. `save_state`：`if (!state_path) return` 守卫保留；`writeJsonAtomic` 调用一致；异常路径 `on_warn('save_state failed: ' + msg)` 经 collector wrapper 还原为 `forward_log("warn", "collector", ...)`。
3. `load_state`：
    - 空 path 守卫 → 读文件失败静默 return（不 clear）→ 成功读取后才 clear 4 个 map → JSON.parse 失败 `on_warn('load_state: corrupt state file, ignoring')` return → 类型守卫 `typeof parsed !== "object" || parsed === null` → 字段还原 try/catch → catch 中再次 clear 全部 map + `on_warn('load_state: failed to restore, ignoring: ' + msg)`。
    - 与 anchor 行为一致；「先读后 clear」语义保留（文件缺失时不会清空已有状态）。
4. `fs.promises.readFile` → scan-state.ts 中改为 `import { promises as fs } from "node:fs"` + `fs.readFile`，等价。
5. wrapper 签名：
    - `serialize_state()` 无参 → 内部打包 4 个模块级 map 成 `ScanStateMaps` 传入。
    - `save_state(state_path)` / `load_state(state_path)` 单参 → 与原签名一致，测试 `collector-state.test.ts:37-39` 导入无需改动。
    - wrapper 仅做参数打包与 `(msg) => forward_log("warn", "collector", msg)` 回调注入，无逻辑分叉、无参数变换、无防御性拷贝。传参顺序与 `ScanStateMaps` 字段一致（`scan-state.ts:31-37`）。

技术决策落地：

- 「`save_state`/`load_state` 接收可选 `on_warn` 回调」：实现为 `on_warn: ScanStateWarn`（必填），collector 调用处传 `forward_log` 适配。scan-state.ts 不反向依赖 collector.ts 的 `forward_log`，无循环。✓
- 「`SerializedScanState`/`SerializedScanBucket` 类型 + 5 个函数迁移」：全部导出，`SerializedScanState` 被 collector.ts 以 `import type` 复用；`SerializedScanBucket` 在 scan-state.ts 内部消费；`ScanStateMaps`/`ScanStateWarn` 为新增支持类型，无外部消费者但有命名意图（未来 store/reader 复用）。无死代码。

不偏航 / 不自由发挥：

- diff 仅触及 spec 列出的两个源文件 + task 簿籍。无顺手改进、无额外抽象、无 YAGNI 设施。

## 代码质量

- **DRY**：原内联 serde 整段被单一权威实现替代；collector 仅保留薄 wrapper。无新引入的重复块。
- **控制流**：迁移后函数嵌套层级与 anchor 一致；wrapper 为单语句转发，复杂度近 1。`load_state` 的 try/catch 嵌套深度保留原样（最深 3 层），未额外加深。
- **错误处理**：`save_state` catch 不吞没（转发 `on_warn`）；`load_state` 读取/解析/还原三阶段失败均按「清空 + 警告」或「静默 fallback」处置，与 anchor 等价，未引入新 swallowed error。
- **边界条件**：空 path、缺失文件、坏 JSON、非对象 parsed、字段类型不匹配（`typeof v.offset === "number"` 等）五条路径保留。`daily_raw && typeof daily_raw === "object"` 的 falsy 守卫保留。
- **命名**：`scan_serialize`/`scan_save`/`scan_load` 别名清晰表达「scan-state 模块的对应函数」，无误导。
- **separation of concerns**：scan-state.ts 仅持 serde + I/O，不引用 collector 的模块级状态或 `forward_log`；collector.ts 仅持状态 + 调度，serde 委托。职责切分干净。
- **文件膨胀**：`scan-state.ts` 181 行（新建）远低于源码 400 minor / 800 important 阈值；`collector.ts` 净减 118 行至 399，正好落入 spec 期望（< 400）。无 finding。
- **死代码**：原 collector.ts 因 serde 迁出而无用的 `import { writeJsonAtomic } from "../storage/write-json"` 已删除；`import * as fs from "node:fs"` 仍被 `default_lister` 的 `fs.readdirSync` 使用（`collector.ts:161`），保留正确。scan-state.ts 所有导出均有消费者或在公共 API surface 上。

## 实现正确性

- **逻辑 bug**：迁移未改条件分支，无新引入的逻辑反转。
- **空值处理**：`parsed === null` / `entry.facts ?? {}` / `bucket.mtimes ?? {}` 守卫保留。
- **异常路径**：见上「错误处理」。
- **并发时序**：collector.ts 模块级 map 仍由 collector 单线程调度器顺序访问；scan-state.ts 函数接收同一 map 引用，调用方（`save_state`/`load_state`）仍为 collector 顺序调用点，无新并发面。
- **资源泄漏**：`fs.readFile` 无 fd 句柄持有；`writeJsonAtomic` 自管临时文件。无泄漏引入。

## Findings

无。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：serde 逻辑逐字迁移至 `scan-state.ts`，wrapper 保持旧签名，行为不变；所有 AC 满足，typecheck/test/lint/prettier 全绿，无文件膨胀、无死代码、无循环依赖。

verdict: PASS
