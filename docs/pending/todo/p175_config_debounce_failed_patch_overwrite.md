# p175 config-debounce 失败合并 patch 时同键被并发新 patch 覆盖

- 现象：flush 失败把 patch 合并回 pending（Object.assign），若期间用户又 patch 同键，失败旧值覆盖新值——丢最新修改。
- 影响：config-debounce 高频偏好切换在写盘失败 + 同键快速再改时，最新值被旧失败值覆盖；需失败+并发改同键，罕见。
- 根因：config-debounce.ts flush_pending catch 里 `Object.assign(pending, patch)`——patch 是失败时的快照，assign 覆盖已存在的同键新值。正确应「只补缺失键」或按时间序。
- 测试缺口：失败后同键再 patch，断言最终保存用最新值。
- 线索：t356 review_general.md f002。
- 处理：未开
