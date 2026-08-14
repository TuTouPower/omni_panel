# p174 连续两次 config save 失败时回滚落到未确认中间值

- 现象：use-config 的 save 连续两次写盘失败（A、B 依次入队），A 失败回滚到 base（正确），B 失败回滚到 previous_B=A（A 是乐观中间值，未确认）——内存态=A，磁盘=base，不一致。
- 影响：renderer 配置保存双失败极端场景下内存态与磁盘漂移；需连续两次写盘失败才触发，现实罕见。
- 根因：use-config.ts save 回滚用 `if (config_ref.current === newConfig) { ... setConfig(previous) }`——previous 是本次 save 的乐观前值，非「最近一次确认」值。串行队列下后一个失败会回滚到前一个（已失败）的乐观值。已扫：update_config 同因（同机制）。
- 测试缺口：无双失败用例；补 A/B 均 reject 断言最终 config==base（而非 A）。
- 线索：t356 review_general.md f001。
- 处理：未开
