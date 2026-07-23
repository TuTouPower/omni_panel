# Task review t064（reviewer_focus: 测试）

- task：`t064_test_antipattern_cleanup`
- spec：`docs\tasks\t064_test_antipattern_cleanup\spec.md`
- diff_anchor：`8eaf189268a196a9c4678876668bfe9c955b2679`
- target：`git diff 8eaf189268a196a9c4678876668bfe9c955b2679`
- round：1
- reviewed_at：2026-07-23 00:00 UTC+8

## Findings

无。

## I18（deep_freeze）评估

改动：`tests/unit/main/deep_freeze.test.ts:2` 删除本地重实现，改为 `import { deep_freeze } from "../../../src/main/core/connector/runtime"`；配套 `src/main/core/connector/runtime.ts:19` 由 `function` 改为 `export function`。

6 个用例（`deep_freeze.test.ts:5/11/19/26/36/41`）通过 `Object.isFrozen`、`toBe`、`toBeNull`、`toThrow` 断言生产 `deep_freeze` 的真实副作用与返回值；覆盖 flat / nested / 单循环 / 互循环 / identity / null / 原始类型。

- AC I18「测试调生产入口」：满足（`runtime.ts:19` export，测试 line 2 import）。
- 反模式扫描：无恒真、无弱化、无 mock、无 `.skip`；生产改了测试必失败。
- 断言期望行为（非重言式）：是。

## I20（tray_menu）评估

改动：`tests/unit/main/tray_menu.test.ts` 删除 3 个本地常量重言式用例（原 `has all 10 required menu item labels in Chinese/English`、`pause labels are distinct`）；保留 `IPC_CHANNELS` 用例（line 39-62）与 TrayMenu source `?raw` 双语 label 用例（line 64-81）。

- `tray IPC channels cover all actions`（line 39）：断言目标是从生产 `src/shared/types/ipc` 导入的 `IPC_CHANNELS`；`required_actions` 仅作参数化期望清单，`expect(tray_channels).toContain(...)` 验证生产常量包含每个期望动作 —— 合法。
- `TrayMenu component source contains all zh/en labels`（line 64/74）：通过 `import("../../../src/renderer/views/TrayMenu?raw")` 读取生产 `TrayMenu.tsx` 源码文本，断言源码包含 `ZH_LABELS`/`EN_LABELS` 每一项 —— 真正触碰生产 TrayMenu label，非断言常量自身。
- AC I20「不再断言本地常量自身」：满足。本地 `ZH_LABELS`/`EN_LABELS`（line 12-36）角色从「被断言对象」转为「期望清单」，断言目标是生产源码 —— 合法的参数化模式。
- 反模式扫描：无恒真、无弱化、无 `.skip`、无 mock。

## 遗留裁决合理性

| finding | 范围                                                              | 裁决                       | 合理性                                                                                         |
| ------- | ----------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| I19     | `observation_store_migration.test.ts:34-43` 手写 PRAGMA+ALTER     | 遗留（架构改/另立 spike）  | 需导入 `observation-store.ts:116-132` 迁移入口并重构测试夹具，超出"反模式整改"边界。合理。     |
| I21     | `tray_menu_actions.spec.ts:37-48`、`scheduler.spec.ts:37-47` 死等 | 遗留（real fixture）       | 断言真实刷新请求/spinner 状态需 Electron/Playwright 交互基础设施改造，非本 task 可承接。合理。 |
| I22     | `tests/smoke/setup.ts:17,205-219` 全局 mock                       | 遗留（CI/Vitest 配置重构） | setupFiles 拆分 renderer-only 或按套件加载属 Vitest 配置层重构。合理。                         |
| I23     | 4 文件 `test.skip(true,...)`                                      | 遗留（real fixture/CI）    | 取消 skip 需可复现 fixture 与 CI 环境支持，另立 spike。合理。                                  |

四项遗留均属基础设施层变更（迁移入口重构 / E2E 交互改造 / Vitest 配置 / CI fixture），超出单一反模式整改 task 边界，裁决合理且与 spec「依赖与约束」一致。

## 范围外提示（不进 finding 表）

- `tests/unit/scripts/task_py.test.ts:83` 将 `archive.tasks[0]?.status` 改为 `archive.tasks[0]?.["status"]`。推测为 TypeScript 对未知记录类型的索引签名访问修正。不在 I18-I23 反模式清单内，非本 task spec 范围；非危险模式。建议 task 收尾时核对：若为类型层修复应在 task.md 过程记录说明来源，或拆独立小 task 承接。

## 结论

- 前轮 finding 复核：不适用（Round 1）。
- 本轮新发现：0 条。
- 总体判断：I18/I20 修复后测试断言真实生产行为（生产 `deep_freeze` 副作用、生产 `TrayMenu.tsx` 源码、生产 `IPC_CHANNELS`），无恒真/弱化/mock/.skip 命中；I19/I21/I22/I23 遗留裁决合理，均属基础设施层另立 spike 范畴。

verdict: PASS
