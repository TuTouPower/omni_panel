# p028 t191 dashboard rollup/session 相关子查询按分组重复 lookup

- 来源：t191_code_f005
- 内容：rollup 每个 `(source,env,model,directory,session_id)` 分组执行一次窗口内最新 title 子查询；session page 又对每个 session 各执行 title、directory 两个子查询。N 个 session 接近 2N+ 次索引 seek
- 处理：t201
