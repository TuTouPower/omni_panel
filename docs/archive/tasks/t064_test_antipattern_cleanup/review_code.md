# Task review t064（reviewer_focus: 代码）

- task：`t064_test_antipattern_cleanup`
- spec：`docs\tasks\t064_test_antipattern_cleanup/spec.md`
- diff_anchor：`8eaf189268a196a9c4678876668bfe9c955b2679`
- target：`git diff 8eaf189268a196a9c4678876668bfe9c955b2679`
- round：1
- reviewed_at：2026-07-23 21:30 UTC+8

## Findings

无。

## I18（deep_freeze export + import）评估

改动：

- `src/main/core/connector/runtime.ts:19` 将 `function deep_freeze` 改为 `export function deep_freeze`，函数体未变（CC ≈ 4，未达阈值）。
- `tests/unit/main/deep_freeze.test.ts:2` 删除本地重实现（原 line 3-14），改 `import { deep_freeze } from "../../../src/main/core/connector/runtime"`。6 个用例断言生产 `deep_freeze` 的真实副作用与返回值。

实现层判断：

- **AC I18「测试调生产入口」**：满足。生产 `deep_freeze` 改动将直接传导至测试失败。
- **export 影响面**：仓库内全量 `deep_freeze` 引用扫描（`src/` + `tests/`）显示，除本测试外**无其他文件 import** 该符号；`runtime.ts` 内部使用（`create_sandbox_context` line 34、递归调用 line 24）保持不变。export 仅扩大公开 API 表面，不引入循环依赖或破坏既有 import。
- **API 边界**：`deep_freeze` 是通用工具函数，理想位置应在 `shared/lib/`；放在 `connector/runtime.ts` 并 export 属设计取舍，非本 task 反模式范畴，不计 finding。
- **死代码 / 命名 / 控制流**：函数体未动，无新增死代码，命名一致，early-return 风格保持。

## I20（tray_menu 删重言式）评估

改动：`tests/unit/main/tray_menu.test.ts` 删除 3 个本地常量重言式用例（`has all 10 required menu item labels in Chinese/English`、`pause labels are distinct`）。保留 `IPC_CHANNELS` 用例（line 39-62）与 TrayMenu source `?raw` 双语 label 用例（line 64-81）。

实现层判断：

- 本改动仅删测试用例，**不触碰生产代码**，无实现层风险。
- 保留的 `?raw` 用例读取生产 `src/renderer/views/TrayMenu.tsx` 源码文本，断言源码包含 `ZH_LABELS`/`EN_LABELS` 每一项 —— 真正触碰生产 TrayMenu label。
- **AC I20「不再断言本地常量自身」**：满足（详见 test reviewer 报告 line 26-31）。

## 范围外提示（不进 finding 表）

- `tests/unit/scripts/task_py.test.ts:83` 将 `archive.tasks[0]?.status` 改为 `archive.tasks[0]?.["status"]`。`read_json` 返回类型为 `{ tasks: Record<string, unknown>[] }`（line 24-26），TS 严格模式下 `Record<string, unknown>` 不允许 `.status` 属性访问，索引访问为必要的类型修正。不在 I18-I23 反模式清单内，非本 task spec 范围；非危险模式。建议在 `task.md` 过程记录补充说明来源（推测为 typecheck 修复），或拆独立小 task 承接。

## 结论

- 前轮 finding 复核：不适用（Round 1）。
- 本轮新发现：0 条。
- 总体判断：I18 export 修改无副作用（无其他 import 受影响，函数体未变，测试真正调生产入口）；I20 仅删测试用例，实现层零影响；遗留项 I19/I21/I22/I23 均为基础设施层变更，与 spec「依赖与约束」一致。范围外的 `task_py.test.ts` 类型修正在结论段提示，不进 finding 表。

verdict: PASS
