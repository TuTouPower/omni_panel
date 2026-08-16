# p183 模型筛选 union 路径测试扩展（agent+model 组合/ready 断言/会话去重）

- 来源：t384 遗留（test reviewer F001/F002/F004）
- 内容：rollup ready 后 union 路径测试扩展。2026-08-16 现状核实（explore 只读核查）：原列 is_hour_rollup_ready() 断言缺口已不成立——union 用例 token-stats-store.test.ts:2300 内即含 :2305 `expect(store.is_hour_rollup_ready()).toBe(true)`，另有 :2442/:2492/:2496/:2254 多处。仍缺两项：① rollup ready 后 union 路径的 agent+model 组合过滤（records 路径已有，:2590；union 用例 :2300/:2644 均 agent=all 仅 model）；② 跨 model 同 session 的 COUNT(DISTINCT session) 去重断言（:2644 数据已构成同 session 跨 model 命中，但只断言 current.calls=2，无 sessions 去重断言）。当前 union 用例已覆盖 model 归并基本命中，扩展项属覆盖加强。
- 处理：t429
