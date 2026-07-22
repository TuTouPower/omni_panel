# Task review t045（reviewer_focus: 测试）

- task：`t045_auto_refresh_after_import`
- spec：`docs\tasks\t045_auto_refresh_after_import\spec.md`
- diff_anchor：`6cebf74abcd845574d3f4d0d5cbee23b80662416`
- target：`git diff 6cebf74abcd845574d3f4d0d5cbee23b80662416`
- round：1
- reviewed_at：2026-07-22 15:10 UTC+8

## Findings

### t045_test_f001 - AC5 要求的集成测试缺失；onConfigImported → refreshAll 的 wiring 无任何测试覆盖

- 严重度：important
- 位置：`tests/unit/ipc/config-ipc.test.ts:550-658`（新增的全部 4 个 it 块）；缺失覆盖的 wiring 在 `src/main/index.ts:341-347`
- 问题：spec AC5 明确要求「**集成测试**覆盖『import 成功 → `refreshAll` 被调用一次』与『import 失败/取消 → 不调用』」。当前新增的 4 条测试全部位于 `tests/unit/ipc/`，且把 `onConfigImported` 作为一个 `vi.fn()` 传入 deps 后断言其被调用 / 不被调用。真正将 `onConfigImported` 连到 `refreshService.refreshAll()` 的实现（`src/main/index.ts` 中的 `onConfigImported` 闭包）没有任何测试触及。
    - 失败场景：有人在 `index.ts` 中把 `void refreshService.refreshAll().catch(...)` 误删 / 改成 `void 0` / 改条件分支未触发——4 条单元测试仍然全绿，但 AC1「所有 enabled connector 自动刷新一次」实际已破，AC5 也随之破。
    - 测试断言的对象（`vi.fn()`）只是边界 mock，不是 AC 要验证的真实副作用（`refreshService.refreshAll` 被调用一次）。这是「测 mock 不测 AC」的典型形态。
- 建议：在 `tests/integration/` 或更高层级补一条测试，不 mock `onConfigImported` 的实现，而是让 `index.ts` 中的真实闭包运行（可 mock `refreshService.refreshAll` 但保留调用链），断言 `refreshService.refreshAll` 在 import 成功路径被精确调用 1 次、在取消/格式无效/secrets 失败路径不被调用。或者重构 `onConfigImported` 实现为可独立注入的小模块，直接对它写测试断言调用了 `refreshAll`。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条。
- 范围外提示（不计入 finding）：AC2「新增账号无需手动刷新即在用量面板出现」属端到端 UI 行为，本 task 单元/集成层均未覆盖；`tests/integration/scheduler/refresh-service.test.ts:340` 仅测 `refreshAll` 自身只刷 enabled connector，不覆盖 import → rebuild → refreshAll 的完整时序。建议 adoption 阶段判定是否需 E2E 或显式标遗留。
- 总体判断：4 条新测试在 unit 层独立看是干净的（边界 mock 合理、无恒真/弱化/删断言等危险模式），但相对 spec AC5 明显欠一层——没有任何测试证明 `onConfigImported` 的实现真会调用 `refreshService.refreshAll()`。AC5 字面要求未满足。

verdict: FAIL

## Round 2 (2026-07-22 16:50 UTC+8)

### 前轮 finding 复核

- **t045_test_f001（important，wiring 无测试）→ 已修**：
    - 抽出 `createOnConfigImported` 工厂（`src/main/config-callbacks.ts:21-33`），把 wiring 核心逻辑（`void refreshService.refreshAll().catch(log.error)`）从 index.ts 内联闭包变为可独立测试的纯函数模块。
    - 新增 `tests/unit/main/config-callbacks.test.ts` 直接测真实工厂返回的 callback：
        - 成功路径：`expect(refreshAll).toHaveBeenCalledTimes(1)` + `expect(log.info).toHaveBeenCalledWith("Config imported - triggering global refresh")` + `expect(log.error).not.toHaveBeenCalled()`。
        - 错误路径：`mockRejectedValue(new Error("upstream 429"))` + `vi.waitFor(() => expect(log.error).toHaveBeenCalled())` + 断言 refreshAll 仍只调 1 次 + `expect(log.error.mock.calls[0]?.[0]).toContain("upstream 429")`。
    - 测试可信度核对：mock 只在边界（注入的 refreshService 和 log），未 mock 被测逻辑本身；异步时序用 `vi.waitFor` 正确等待 Promise rejection；无恒真/弱化/`.skip`/`@ts-ignore`/删 expect 等危险模式。
    - 修复未换成另一种弱化形式：断言强度足够（精确次数 + 精确参数 + 否定断言），`toContain` 仅用于错误信息子串匹配（合理场景）。
    - index.ts:342 装配行 `const onConfigImported = createOnConfigImported(refreshService, log);` 仍无直接测试，但：(1) 类型签名 `(config: AppConfiguration) => void` 与 `ConfigIpcDeps.onConfigImported?` 匹配，typecheck 可守住参数错配；(2) 与同文件 `onConfigSaved`（行 304）、`TRAY_REFRESH_ALL`（行 712-713）装配惯例一致——这是项目级约定，非本 task 引入。此局限可接受，不再单列 finding。

### AC5 覆盖链验证

两层测试互补覆盖完整链路：

| 链路段                                                         | 覆盖测试                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `handleConfigImport` 成功 → 调用 `deps.onConfigImported`       | `config-ipc.test.ts:550-575`（断言 `toHaveBeenCalledTimes(1)`）                |
| `handleConfigImport` 取消/格式无效/secrets 失败 → 不调用       | `config-ipc.test.ts:577-658`（3 个 it，断言 `not.toHaveBeenCalled()`）         |
| `onConfigImported` callback → 调用 `refreshService.refreshAll` | `config-callbacks.test.ts:5-15`（断言 `toHaveBeenCalledTimes(1)`）             |
| `refreshAll` rejection → 错误不逃逸                            | `config-callbacks.test.ts:17-27`（断言 `log.error` 被调 + refreshAll 仍 1 次） |

组合效果：import 成功 → refreshAll 调用 1 次；import 失败/取消 → refreshAll 不调用。AC5 字面要求（"集成测试"）由两层单元测试组合达成，符合 Round 1 finding 的修复建议。

### 本轮新发现

0 条。

### 总体判断

前轮 finding 已真正修复（工厂抽出 + 真实 wiring 断言），无换形式弱化，无新危险模式。index.ts 装配行靠 typecheck 守的同惯例局限可接受。

verdict: PASS
