# Task review t356（reviewer_focus: 通用）

- task：`t356_renderer_save_rollback`
- spec：`docs/tasks/t356_renderer_save_rollback/spec.md`
- diff_anchor：`b6a4f2b8fade3c276ff752cad0dbcdb420165d2e`
- target：`git diff b6a4f2b8fade3c276ff752cad0dbcdb420165d2e`
- round：1
- reviewed_at：2026-08-14 01:20 UTC+8

## 验证基线

- `git rev-parse --show-toplevel` = `/home/karon/karson_ubuntu/omni_panel_t356`，与 task_dir 同仓。
- diff 仅触及 5 个源文件 + 6 个测试文件 + task.md front matter（由 task.py 更新），无偏航、无新增 YAGNI。
- 实测：`vitest run` 相关 5 文件 96 passed（use_config 7 / config-debounce 7 / label_map_dialog 19 / add_account_dialog 23 / settings_form 40）；`tsc --noEmit` 通过；`eslint`（变更文件，--max-warnings=0）通过。

## Findings

### t356_gen_f001 - use-config 连续双失败回滚落到未确认中间值（AC-002 窄缺口）

- 严重度：minor
- 锚点：AC-002「乐观更新在写盘失败后回滚到上一已确认状态，内存态与磁盘一致」，双重叠失败场景不满足
- 位置：`src/renderer/hooks/use-config.ts:82-98`（save）、`:103-121`（update_config）
- 问题：`previous`/`current` 捕获的是 save/update_config 调用时刻的 `config_ref.current`，不保证是「上一已确认」值。串行队列 + 引用比较守卫只防「较新乐观更新被误回滚」，防不住连续双失败：
  1. 已确认 C0；save(A) 乐观置 A（previous_A=C0）；save(B) 乐观置 B（previous_B=A），两 save 均未落盘；
  2. A 写盘失败 → 守卫 `config_ref.current === A`？当前为 B，跳过（:88）；
  3. B 写盘失败 → 守卫 `config_ref.current === B`？是 → 回滚到 previous_B=A（:89-90）。
  结果内存态 = A（从未确认），磁盘 = C0，AC-002 内存/磁盘一致性被破坏。update_config 同构（:112-114 回滚到 current=update1 的乐观值）。
  可达路径：SettingsView `void save_config`（hide/restore account、AppearanceSection 开关，`SettingsView.tsx:183/:199`）可快速连发两次且连续写盘失败。
- 建议：单独维护「最后确认」引用（成功 save 后更新），回滚目标取该引用而非调用时刻的 `previous`；或回滚时沿队列取上一已确认值。单失败路径不受影响。

### t356_gen_f002 - config-debounce 失败合并回 pending 的合并方向在相同键上丢失更新

- 严重度：minor
- 锚点：AC-003「失败不丢 patch（合并回 pending 重试）」在「失败 patch 与并发新 patch 同键」时丢新值
- 位置：`src/renderer/lib/config-debounce.ts:62`
- 问题：`Object.assign(pending, patch)` 以失败快照 `patch`（旧值）为源、覆盖 `pending`。若保存在途时用户对同键再 patch 新值（pending.X=v2），保存 X=v1 失败后 pending.X 被覆回 v1，最新用户修改丢失；重试落盘 v1，UI 乐观显示 v2 但磁盘 v1。不同键不受影响（仅同键优先级错误）。
- 建议：合并方向反转为新值优先，如 `Object.assign(patch, pending); pending = patch;` 或仅把失败 patch 中 pending 缺失的键补入。

### t356_gen_f003 - 新增 use_config save 回滚测试 setConfig 未包 act

- 严重度：minor
- 锚点：测试可信——断言依赖 React 同步刷新的时序脆弱性
- 位置：`tests/unit/renderer/hooks/use_config.test.ts:192-211`
- 问题：save 用例直接在 act 外调用 `result.current.save(failed)`，运行产生两次「An update to TestComponent inside a test was not wrapped in act(...)」警告（save() 入口乐观 setConfig 与回滚 setConfig 均在 act 外触发）。`expect(result.current.config).toEqual(base_config)` 读取的提交态依赖 React 同步 flush，环境敏感。update_config 用例（:213-228）已用 `await act(async ...)` 包裹，save 用例未包。
- 建议：将 `save(failed)` 及断言纳入 `await act(async () => { ... })`。

### t356_gen_f004 - scope「统一包装返回已消化 rejection 的保存函数供 void 调用点」未落地（预存）

- 严重度：minor
- 锚点：范围首条承诺的「已消化 rejection 包装」未交付；AC 未覆盖，非门禁
- 位置：`src/renderer/views/SettingsView.tsx:183/:199`（`void save_config(...)`）
- 问题：`save_config` await `save(payload)`（t356 使 save 返回 reject 的 p，调用方可观测），`void save_config(...)` 丢弃 → 写盘失败时 save_config 自身 promise 产生 unhandled rejection，且无用户可见错误（仅靠 AC-002 回滚使 UI 恢复，静默）。该行为 t356 前即存在（旧 save 同样返回 p），非本任务回归，但范围首条「统一包装…供所有 void save_config 调用点」并未实现——toggle 类调用点仍无消化。CpaLabelMapDialog 经 `await on_save_config(...)` 走 LabelMapDialog.handle_save 已能显示错误（AC-001 覆盖），仅 SettingsView 直接 void 调用点保留此态。
- 建议：为 void 调用点提供内部已吞 rejection 的包装（或 save_config 内 catch 落日志），是否提升为后续 task 由用户裁定。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：4 条（全部 minor，非 blocking）
- 未进表的提示：config-debounce.ts:60 注释「有限重试」与实际每次失败重排 timer 的无限重试不符，属注释口径问题，未单列；不做 blocking。
- 总体判断：AC-001/002/003/004 均实现并有测试触达可观察行为（错误文案可见、回滚到 base_config、flush reject 可观测、AC-004 阶段文案全链路），实测 96 测试通过 + typecheck + lint 通过。f001 为 AC-002 双失败窄缺口、f002 为 config-debounce 同键合并优先级、f003 为测试 act 包裹、f004 为范围承诺未落地（预存），均 minor，不阻断合入。
- 系统性 follow-up：建议后续 task 处理 f001（rollback 目标改为独立 last-confirmed 引用）与 f002（合并方向新值优先）；f004 是否立项由用户裁定。

verdict: PASS
