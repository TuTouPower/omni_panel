# Task review t407（reviewer_focus: 通用）

- task：`t407_session_pane_head_cwd_time`
- spec：`docs/tasks/t407_session_pane_head_cwd_time/spec.md`
- diff_anchor：`ede5702d78abe1f578334eeffebea12dd4125f4e`
- target：`git diff ede5702d78abe1f578334eeffebea12dd4125f4e`
- round：1
- reviewed_at：2026-08-16 03:40 UTC+8

reviewed_scope: 88ea91a28fc04b7b

## Findings

### t407_gen_f001 - 组件测试断言依赖真实年份，2027-01-01 起确定性变红

- 严重度：important
- 锚点：AC-002 / AC-006——时间格式化随年份切换分支，而组件测试把「当年分支」断言写死，跨年运行即失败，测试套件变红
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:99-102`（`getByText(/0807 09:08/)`）、`tests/unit/renderer/components/workspace/SessionPane.test.tsx:112-115`（`getByText(/0102 03:04/)`）、`tests/unit/renderer/components/workspace/SessionPane.test.tsx:389-396`（`toContain("0807 09:08")`）、`tests/unit/renderer/components/workspace/SessionPane.test.tsx:420-421`（`toBe("0817 23:25")`）
- 问题：被测组件 `SessionPane.tsx:165` 调用 `format_compact_datetime(last_message_time(column))`，`now` 取默认值 `Date.now()`（`src/renderer/lib/workspace/pane.ts:22`）。组件测试用 2026 年消息时间戳断言 `MMDD HH:mm` 输出，未注入固定 now，vitest 配置（`vitest.config.mts:19-20`）只固定 TZ 不固定时钟，测试文件内亦无 `setSystemTime`/`useFakeTimers`。复现路径：系统时钟到 2027-01-01 后运行同一测试，2026 年的时间戳走非当年分支渲染 `260807 09:08` 等，四处断言全部失败，AC-006「现有测试套件不红」被打破。注释里「测试年=2026 时」也自认了该依赖。纯函数测试（`pane.test.ts` 注入固定 now）无此问题。
- 建议：最小修复——组件测试 `beforeEach` 加 `vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0))`（afterEach `vi.useRealTimers()`），或断言改为按当前年份动态计算期望值；与 `pane.test.ts` 的注入 now 策略对齐。

### t407_gen_f002 - 上游 spec AC4 措辞仍声称「依次呈现模型、目录、轮次、token、日期」，与实际两行布局顺序不符

- 严重度：minor
- 锚点：AC-005 关联文档一致性——本 diff 已触碰该行（`五项`→`等项`）但保留了过时排序表述
- 位置：`docs/specs/session-pane-display-adjust.md` AC4 行（diff 第 23-26 行上下文）
- 问题：实际头部第一行为 目录→时间→session id，第二行为 模型→轮次→tokens→标题（`src/renderer/components/workspace/SessionPane.tsx:150-196`），AC4 的「元信息依次呈现模型、目录、轮次、token、日期」自 t324 两行重排后即不成立，本次修订未一并校正。
- 建议：finalization 时将 AC4 排序表述改为与实际两行布局一致，或删除排序承诺只保留格式语义；属文档措辞，不阻断。

## 结论

- 本轮新发现：2 条（important 1 / minor 1）
- 未进表的提示：极端窄列下完整 cwd 不换行溢出由 `.conversation-pane` 的 `overflow-hidden` 裁剪——spec 上下文区风险段已声明接受该观感，不出 finding；`last_dir_segment` / `format_precise_datetime` 仍被 `SessionCard.tsx:79,87` 使用，无死代码。
- 总体判断：实现本体（cwd 完整展示、紧凑时间当年/跨年分支、截断优先级、上游 spec AC2/AC4 修订）均符合契约且全量单测当前绿（274 files / 3277 tests passed），但组件测试存在确定性跨年变红缺陷，须修复后复审。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——`SessionPane.tsx:154-157` cwd 直渲完整路径且无 `truncate`；新增测试断言 `textContent` 全等长路径且无 truncate 类，复跑通过。
- AC-002：`re_verified`——`pane.ts:22-31` 当年分支输出 `MMDD HH:mm` 无年份无秒；`pane.test.ts` 注入固定 now 断言通过；组件断言当前绿但依赖真实年份（见 f001）。
- AC-003：`re_verified`——非当年分支 `YY` 由 `String(year).slice(-2)` 拼接 `MMDD HH:mm`；单测覆盖 2025 与跨年边界（12-31/01-01）均通过。
- AC-004：`re_verified`——cwd/时间 `shrink-0`（`SessionPane.tsx:154,164`），session id 与标题 `min-w-0 truncate`（`:170,191`）；新增类名断言测试通过。
- AC-005：`re_verified`——`docs/specs/session-pane-display-adjust.md` AC2/AC4 已改写为完整 cwd 与紧凑时间新语义，旧「目录只显示末级」表述已移除（实现要点中保留的 `format_precise_datetime` 明确归属 SessionCard，非 AC 表述）。
- AC-006：`re_verified`——reviewer 实跑 `pnpm test`：274 files / 3277 tests passed / 0 failed（含本 task 新增与改写用例）；但该结论仅在真实年份为 2026 时成立（见 f001）。

coverage = 6 / 6

verdict: FAIL

---

# Task review t407（reviewer_focus: 通用）— Round 2

- task：`t407_session_pane_head_cwd_time`
- spec：`docs/tasks/t407_session_pane_head_cwd_time/spec.md`
- diff_anchor：`ede5702d78abe1f578334eeffebea12dd4125f4e`
- target：`git diff ede5702d78abe1f578334eeffebea12dd4125f4e`
- round：2
- reviewed_at：2026-08-16 03:43 UTC+8

reviewed_scope: cc0178b11fcc819a

## Findings

无新增 finding。

## 结论

- 前轮 finding 复核：
  - `t407_gen_f001`：已消除。`SessionPane.test.tsx` 增加 `pin_system_year_2026()`（`vi.useFakeTimers` + `setSystemTime(2026-08-16)`），四处紧凑时间断言前调用；文件级 `afterEach` 调 `vi.useRealTimers()`，不影响 `waitFor` 剪贴板用例。断言不再依赖宿主真实年份。
  - `t407_gen_f002`：已消除。`docs/specs/session-pane-display-adjust.md` AC4 改为两行布局真实顺序（cwd·时间·session id / 模型·轮次·tokens·标题）+ 紧凑时间语义。
- 本轮新发现：0 条
- 未进表的提示：Round 1 关于窄列 cwd 溢出的观察仍成立且属有意不测；无新提示
- 总体判断：AC-001~006 实现与测试/文档一致；无未解决 critical/important
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——cwd 直渲 `slot_meta.cwd` + `shrink-0` 无 truncate；组件测试全路径 `textContent` 断言通过
- AC-002：`re_verified`——`format_compact_datetime` 当年分支 + 组件测试在固定 2026 时钟下断言 `MMDD HH:mm`
- AC-003：`re_verified`——纯函数单测非当年与 12-31/01-01 跨年边界通过
- AC-004：`re_verified`——cwd/time shrink-0；session id/title min-w-0 truncate；类名断言用例通过
- AC-005：`re_verified`——上游 AC2/AC4 新语义与两行布局措辞已写入
- AC-006：`re_verified`——`SessionPane.test.tsx` + `pane.test.ts` 44 用例通过

coverage = 6 / 6

verdict: PASS
