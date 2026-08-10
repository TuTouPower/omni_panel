# d027 dirty + debounce 落盘合并机制（2026-08-08）

- 来源：s024
- 结论：高频全量写可改为「dirty 标记 + debounce flush」合并。仅当数据实际变化（set / delete 存在的 key）置 dirty 并 schedule 一次性 flush；delete 不存在的 key（内容未变）不置 dirty，零写盘；显式 flush 保证退出前落盘。单 miss 内多次 persist 合并为一次写盘。
- 证据：s024 原型（`docs/spikes/s024_index_debounce_persist/code/experiment.mjs`）：批量 N=50 persist → debounce 后 1 次写盘；未命中 delete 零写；显式 flush 后条目齐全；删+填两次 persist 一次写。
- 影响：引入 debounce flush 时，调用方不得依赖「写后立即 existsSync」语义；需退出路径显式 flush。适用于会话索引等高频全量写场景。
- 现状：有效
