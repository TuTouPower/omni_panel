# Spike report

## 问题

会话路径索引落盘批间合并采用何种机制：单 miss 内多次全量写如何合并？批量冷解析窗口如何显著减少写盘次数？未命中且内容不变是否可零写盘？异步落盘对 resolve 同步返回语义的影响与退出前保证。

## 成功判据

- 批量 persist N 冷会话，debounce 后写盘次数为 1（显著 < N）。
- 未命中且内容不变的 delete 不触发写盘。
- 显式 flush 后索引包含全部条目。
- 单 miss 内「删 + 填」两次 persist 合并为一次写盘。

## 尝试

- 独立原型脚本 `code/experiment.mjs`：dirty 标记 + `setTimeout` debounce（50ms）flush；`persist(key, value)` 仅当索引内容实际变化（set / delete 存在的 key）置 dirty；`flush()` 同步原子写。

## 证据

运行输出：

```
批量 N=50 persist 后立即写盘次数: 0（debounce 未到期）
debounce 到期后写盘次数: 1（显著 < N=50）
未命中 delete 后写盘次数: 1（不变）
显式 flush 后写盘次数: 2
单 miss 删+填合并写盘次数: 3（两次 persist 一次写）
```

## 结论

- 机制可行：dirty 标记 + debounce flush 满足批量窗口合并（N=50 → 1 次写）、未命中不变零写、显式 flush 保证持久性、单 miss 内合并。
- 异步语义：debounce 窗口内 resolve 同步返回后索引未必已落盘；需调用方不依赖「resolve 后立即 existsSync」的既有测试语义，改 flush 后断言或写盘计数断言。
- 退出前保证：需在退出路径显式 `flush()`（before-quit 已存在 flush 挂点）。

## 是否采纳

- 决定：是
- 理由：原型全场景符合 AC 1/2/3；原子写 + 回退扫描重建机制不变，数据安全不受影响。
- 后续 task：t264
