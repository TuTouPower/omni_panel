# p026 TokenStats 查询缓存键包含展示维度

- 来源：t190_code_f003
- 内容：`metric`、`xaxis`、部分 `gran` 只影响 renderer 派生展示，却进入底层查询缓存 key，导致相同数据依赖重复 IPC 查询并占用 LRU 条目
- 处理：t200
