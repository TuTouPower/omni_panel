# p175 config-debounce 失败合并 patch 时同键被并发新 patch 覆盖

- 现象：flush 失败把 patch 合并回 pending（Object.assign），若期间用户又 patch 同键，失败旧值覆盖新值——丢最新修改。
- 影响：config-debounce 高频偏好切换在写盘失败 + 同键快速再改时，最新值被旧失败值覆盖；需失败+并发改同键，罕见。
- 根因：config-debounce.ts flush_pending catch 里 `Object.assign(pending, patch)`——patch 是失败时的快照，assign 覆盖已存在的同键新值。正确应「只补缺失键」或按时间序。已扫：同因仅 config-debounce（renderer 其它 .catch 位点均不把快照合并回 pending 集合）。
- 测试缺口：已有失败合并重试与失败重排 timer 用例（t356 AC-003）；缺「失败后同键再 patch，断言最终保存用最新值」用例。
- 线索：t356 review_general.md f002。
- 处理：t391
- 核实：2026-08-15 问题仍存在，根因与现状一致。config-debounce.ts:62 `Object.assign(pending, patch)` 在 save 失败时把失败快照覆盖回 pending，若在途期间同键被 patch 新值则旧值盖新值，重试保存旧值丢最新修改。同类位点扫描：`Object.assign(pending, ...)` 全仓仅 config-debounce.ts 两处（:62 catch 为问题位点、:79 为正常 patch 合并），无其它 flush-pending 快照回并位点，「同因仅 config-debounce」成立，已扫无已确认同类。检索轴：Object.assign(pending / 失败重试合并回 pending。
