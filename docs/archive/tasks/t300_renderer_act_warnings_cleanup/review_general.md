# Task review t300（reviewer_focus: 通用）

- task：`t300_renderer_act_warnings_cleanup`
- spec：`docs/tasks/t300_renderer_act_warnings_cleanup/spec.md`
- diff_anchor：`db4f25c5c15cab206dc8dc83ae7e9e29b8b0dc3c`
- target：`git diff db4f25c5c15cab206dc8dc83ae7e9e29b8b0dc3c`
- round：1
- reviewed_at：2026-08-11 04:59 UTC+8

## Findings

零 finding（clean review，禁止凑数）。逐项核验均通过：

- **断言未删减/未弱化（AC-002）**：4 个文件 `it(` 与 `expect(` 计数与 base 完全一致（39/89、28/55、7/26、29/51）；将 base 与 current 的 `expect(...)` 行集合逐一 diff 对比，结果全部 IDENTICAL——无删 expect、无 toBe→toContain/toBeTruthy 类改写、无 `.skip`/`.only` 新增。
- **flush 位置正确**：全部 12 处 `await act(async () => { await Promise.resolve(); })` 均在 render 之后、断言之前（renderForm helper、renderWebLoginForm helper、renderSettings helper 各 1 处；settings_form 裸 render「label map loading」1 处；cpa rerender「partial failure and disconnected」1 处；SessionShell 7 处；settings_view_general「hides window controls in web mode」1 处）。
- **helper async 化无遗漏**：renderForm/renderWebLoginForm/renderSettings 全部调用点均 `await`，无残留同步调用；`act` 均已 import。
- **范围守界**：diff 仅含 4 个测试文件 + task.md，未动生产源码（非范围「生产组件逻辑调整」未触碰）。
- **全量复验（AC-001/AC-003）**：`pnpm test` 全量 2857 passed（253 文件通过，9 skipped），stderr grep `not wrapped in act` = 0，且全量输出无任何 `console.error`；4 个涉及文件单文件运行 103 用例全绿、0 警告；SessionLibrary.test.tsx 独立运行 33 用例全绿、0 警告（task.md 根因所述 SessionLibrary(25) 警告经 SessionShell.test.tsx 挂载表面化，已由该文件 flush 覆盖）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无前轮。
- 本轮新发现：0 条。
- 未进表的提示：
    - task.md 验证记录「0 act 警告、2857 passed」与实测一致，diff_anchor 与 review 目标一致。
    - 范围外观察（base 已存在，diff 未触及，不进 finding 表）：settings_form.test.tsx 与 cpa_connector_settings.test.tsx 存在条件跳过型守卫 `if (!call) return;` / `if (!claude_btn) return;` / `if (!last_btn) return;`（settings_form 当前行 265/291/358/450/621/673，cpa 369/522/561/575，均可在 base 同现），对象取不到时静默通过而不断言；SessionShell.test.tsx 有 6 处 `toBeTruthy()` 弱断言（57-59/75/83/110，base 已存在）。均非本 task 引入，按「范围外问题仅提示」处理。
- 总体判断：diff 为测试 await/act/flush 机械改造，断言零改动，AC-001/002/003 全部实测达成，无未解决 critical/important。
- 系统性 follow-up：建议建「renderer 测试断言硬化」task，清理条件跳过守卫与 `toBeTruthy()` 弱断言；标题 `renderer 测试断言硬化`，slug `renderer_test_assertion_hardening`。

verdict: PASS

reviewed_scope: 948ff99f1a361604
