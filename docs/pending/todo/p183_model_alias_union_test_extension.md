# p183 模型筛选 union 路径测试扩展（agent+model 组合/ready 断言/会话去重）

- 来源：t384 遗留（test reviewer F001/F002/F004）
- 内容：rollup ready 后 union 路径缺三项覆盖——agent+model 组合过滤、is_hour_rollup_ready() 断言、AC-002 跨 model 同 session 的 COUNT(DISTINCT session) 去重。当前 union 用例已覆盖 model 归并基本命中，扩展项属覆盖加强。
- 处理：未开
