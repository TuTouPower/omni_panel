# p174 连续两次 config save 失败时回滚落到未确认中间值

- 现象：use-config 的 save 连续两次写盘失败（A、B 依次入队），A 失败回滚到 base（正确），B 失败回滚到 previous_B=A（A 是乐观中间值，未确认）——内存态=A，磁盘=base，不一致。
- 影响：renderer 配置保存双失败极端场景下内存态与磁盘漂移；需连续两次写盘失败才触发，现实罕见。
- 根因：use-config.ts save 回滚用 `if (config_ref.current === newConfig) { ... setConfig(previous) }`——previous 是本次 save 的乐观前值，非「最近一次确认」值。串行队列下后一个失败会回滚到前一个（已失败）的乐观值。已扫：update_config 同因（同机制）；无其它同类位点（renderer 仅 use-config.ts 有此乐观回滚模式，use-popup-ui-config.ts 为读+默认回退非保存回滚）。
- 测试缺口：已有单次失败回滚用例（save 与 update_config 各一，t356 AC-002）；缺 A/B 均 reject 的双失败用例，补测断言最终 config==base（而非 A）。
- 线索：t356 review_general.md f001。
- 处理：t390
- 核实：2026-08-15 问题仍存在，根因与现状一致。save()（src/renderer/hooks/use-config.ts:80-100）与 update_config()（:102-122）同构：`previous/current` 为调用时乐观值，串行 save_queue_ref 下先失败者回滚被跳过（config_ref 已是后值），后失败者回滚落到前一乐观值，终态内存=A、磁盘=base 漂移（trace 细节修正：A 回滚实际被跳过而非「回滚到 base」，终态结论不变）。同类位点扫描：update_config 同因成立；renderer 无其它 config_ref/setConfig 乐观回滚位点，已扫无其它同类。检索轴：config_ref.current = / setConfig( / save_queue_ref / .catch 回滚。
