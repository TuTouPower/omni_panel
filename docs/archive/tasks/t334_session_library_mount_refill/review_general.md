# Task review t334（reviewer_focus: 通用）

- task：`t334_session_library_mount_refill`
- spec：`docs/tasks/t334_session_library_mount_refill/spec.md`
- diff_anchor：`2575ef77ce8ce5a1af5b2e07dc9be73cdf3af466`
- target：`git diff 2575ef77ce8ce5a1af5b2e07dc9be73cdf3af466`
- round：1
- reviewed_at：2026-08-13 01:20 UTC+8

## Findings

### t334_gen_f001 - AC-001 测试未覆盖「补满中途溢出即停」终止分支

- 严重度：minor
- 锚点：AC-001（覆盖不足，非阻塞——spec 可测试性声明「至溢出或数据尽」任一即可）
- 位置：`tests/e2e/web/session_library_mount_refill.spec.ts:58-73`
- 问题：AC-001/003 用例用 3 页 × 50（末页短页）数据 + 1920×4000 大视口，断言卡片数 110 与 offsets `[0,50,100]`。此数据量在该视口下不溢出（实测 6 列网格、~19 行、高度远小于 4000px），循环终止走的是「has_more=false 数据尽」分支。补满循环的另一个终止条件——「加载一页后已溢出则停」——在循环中途未被该用例隔离验证：若循环错误地在溢出后仍继续请求（或提前一页停），此用例会因 has_more=false 或数值断言恰好放过。
- 建议：补一个 case，用小视口 + 中数据（如 1280×800 + 200 条）使补满在加载第 2 页后恰好溢出，断言停止于 `[0,50]` 且卡片数 50 后不再增长。仅建议扩展，非阻断。

### t334_gen_f002 - ResizeObserver 回调闭包陈旧竞态（理论，低置信度）

- 严重度：minor
- 锚点：行为缺陷，失败场景为「陈旧 offset 重复请求」，实际被多层守卫兜底，未观测到
- 位置：`src/renderer/components/session-library/SessionList.tsx:78-82`
- 问题：observer 回调捕获当次 render 的 `on_scroll_to_bottom`（即 `load_more`，其闭包内含 `all.length` 作为 offset）。若旧 observer 回调恰在「新一页 inflight 已释放（.finally）之后、React 提交新 render（effect cleanup disconnect 旧 observer、重建新 observer）之前」的渲染步骤投递，会以陈旧 `all.length` 计算 offset 发起重复请求。缓解：effect cleanup 的 `disconnect()` 在 commit 期同步执行，ResizeObserver 回调只在 render 步骤投递，陈旧回调几乎不可能越过 disconnect；`load_more` 的 inflight 守卫再兜一层；AC-003 e2e 以精确断言 `[0,50,100]` 验证了无重复。置信度低，未复现。
- 建议（可选）：effect 内用 `useRef` 保存最新 `on_scroll_to_bottom`，observer 回调读 ref 而非闭包，彻底消除陈旧引用；同时去掉 `eslint-disable exhaustive-deps` 的隐患面。

## 结论

- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 内容搜索模式（`search && search_content`）下，`load_more` 走同步 visible 递增路径；补满循环在超大视口会把已取回的全部内容匹配逐页 reveal（数据已在内存，无网络开销，终止于 `content_sessions.length` 上限）。与 AC-001「全部会话加载完」语义一致，判为符合意图的边界行为，非缺陷。
    - AC-002 用例滚动触底仅 `el.scrollTop = el.scrollHeight`，未按 t328 `scroll_container_to_bottom` 模式补 `dispatchEvent(new Event("scroll"))`。Chromium 对程序化 scrollTop 赋值会触发原生 scroll 事件（复验两次均通过）；且若事件不触发，末断言 `[0,50]` 会红（无假绿风险）。仅稳健性一致性问题，不进 finding。
    - `SessionList.tsx:83-86` 依赖 `sessions.length` 与 `view_mode`，`on_scroll_to_bottom` 未入依赖（exhaustive-deps 抑制）。因 `sessions.length` 变化与 `load_more` 身份变化强相关（`all.length`/`visible` 驱动两者），闭包新鲜度在实践中成立；已并入 f002 讨论。
- 总体判断：实现正确，AC-001/002/003 均已实现并被 e2e 验证；无未解决 critical/important，仅 2 条 minor 建议项。PASS。
- 系统性 follow-up：无

### AC 复验方式

- **AC-001**（re_verified）：独立重跑 `MOCK_FIXTURE=synthetic npx playwright test --config=playwright.config.ts --project=web session_library_mount_refill`，AC-001/003 用例通过（754ms），断言 110 卡片 + offsets `[0,50,100]`；代码核对补满循环终止条件（`el.clientHeight > 0 && el.scrollHeight <= el.clientHeight` + 父 `load_more` has_more 守卫）。
- **AC-002**（re_verified）：同上重跑，AC-002 用例通过（596ms），断言挂载后 offsets `[0]`、滚动后 `[0,50]`。
- **AC-003**（re_verified）：AC-001/003 用例精确断言 `[0,50,100]` 无并发/重复；代码核对 `load_more` inflight 守卫（`load_more_inflight_ref.current` 同步置位）。

coverage = 3 / 3

- 附加复验：`tsc --noEmit` 0 错误；`SessionLibrary.test.tsx` + `SessionCard.test.tsx` 50 单测通过（jsdom 下 `clientHeight=0` 跳过补满、`ResizeObserver` undefined 不建 observer 的守卫成立）；既有 `session_library_infinite_scroll` + `session_library_grid_squash` + `session_panel` 15 条 e2e 通过，无回归。

reviewed_scope: e5404b7fa471c53a

verdict: PASS

## Round 2 (2026-08-13 01:22 UTC+8)

### 前轮 finding 复核（以 diff 与代码/测试为准）

- **f001**（minor，已修复）：新增 `tests/e2e/web/session_library_mount_refill.spec.ts:98-123` case「AC-001 f001: 中等视口补满至中途溢出即停（非数据尽）」——200 条数据（未数据尽）、1280×2100 视口，断言 offsets `[0,50]` 且 `sh > ch`，隔离了补满循环「加载一页后已溢出则停」的终止分支（区别于数据尽终止）。独立重跑 3 次均稳定通过。`toContain('"offsets":[0,50]')` 是精确数组匹配（`[0,50,100]` / `[0,50,50]` 均不命中），能区分「溢出后仍继续请求第 3 页」的 bug；末断言 `sh>ch` 确认停在溢出态。
- **f002**（minor，已修复）：`src/renderer/components/session-library/SessionList.tsx:69-70` `on_scroll_ref` 每次 render 同步刷新 `current`；ResizeObserver 回调（:84 `() => maybe_refill()`）经 `maybe_refill`（:79）读 `on_scroll_ref.current()`，回调投递时拿到的始终是最新 `on_scroll_to_bottom`（即父 `load_more`，其 `offset=all.length` 新鲜）。陈旧闭包引用彻底消除。effect 依赖 `[sessions.length, view_mode]`，补满循环仍受父 `load_more` 的 `load_more_inflight_ref` 同步守卫（`SessionLibrary.tsx:160/171`）与 `request_seq_ref`（:173/178）双重保护，AC-003 无并发/无限请求不变。

### 本轮新发现

### t334_gen_f003 - 新增「中途溢出即停」用例断言存在窄瞬态假绿窗口与布局耦合（低置信度）

- 严重度：minor
- 锚点：AC-001 覆盖增强用例的断言稳健性（非阻断）
- 位置：`tests/e2e/web/session_library_mount_refill.spec.ts:109-122`
- 问题：`expect.poll(...).toContain('"offsets":[0,50]')` 在首个匹配快照即成功返回。若实现错误地在溢出后仍继续加载（f001 想防的 bug），offsets 由 `[0,50]` 快速过渡到 `[0,50,100]`；poll 若恰在瞬态 `[0,50]` 快照上成功，随后的 `sh>ch` 断言（:122）在页面 3 加载后仍成立（sh 更大）→ 假绿漏报。窗口窄（mocked 网络微任务 + React commit + ResizeObserver 跨帧），正确实现下 offsets 稳定停在 `[0,50]`，实测 3 次稳定无此问题。另该 case 依赖布局假设（注释自述 50 条 sh≈1800 < ch 2100、100 条 sh≈3600），卡片高度/字体变化会导致用例假红（非假绿，自验证，但环境敏感）。
- 建议：poll 成功后追加短暂 settle 期再断言 offsets 仍为 `[0,50]` 且卡片数停在 100（而非快照一次即收）；或改「等待 `sh>ch` 稳定后再断言卡片数不再增长」。

### 结论

- 前轮 finding 复核：f001 已修复（新 case 隔离中途溢出终止分支，实测稳定）；f002 已修复（`on_scroll_ref` 最新-ref 模式正确消除陈旧闭包，父 inflight/seq 守卫未受影响）。
- 本轮新发现：1 条（minor，低置信度）
- 未进表的提示：引入 `on_scroll_ref` 后 effect 内已无可疑未入依赖变量（仅 refs + `sessions.length` + `view_mode`），`:89` 的 `eslint-disable-next-line react-hooks/exhaustive-deps` 大概率已失效成空操作——无害，风格级，不进 finding。
- 总体判断：两处 minor 均实质修复，无新 blocker；仅新增用例的停止断言存在窄瞬态假绿与布局耦合的 minor 建议项。PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- **AC-001**（re_verified）：新增中途溢出 case（1280×2100 + 200 条）独立重跑 3 次均绿，隔离「溢出即停」分支；原大视口 case 仍覆盖「数据尽终止」，两终止分支均已覆盖。
- **AC-002**（re_verified）：原 case 重跑通过（挂载 offsets `[0]` → 滚动触底后 `[0,50]`），f002 改动未触及滚动触底路径。
- **AC-003**（re_verified）：`load_more_inflight_ref` 同步守卫（`SessionLibrary.tsx:160/171`）与 `request_seq_ref` 未变；AC-001/003 case 精确断言 `[0,50,100]` 验证无并发重复。

coverage = 3 / 3

reviewed_scope: f97dc0025f7ad3e7

verdict: PASS
