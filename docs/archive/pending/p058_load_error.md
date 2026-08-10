# p058 会话库 load_error 空态误报与中途分页失败无提示

- 来源：t227 code reviewer round 3（f013 minor，f012 修复残余）
- 内容：`SessionLibrary.tsx` 的 `load_error` 唯一渲染点是被 `visible_sessions.length === 0` 门控的空态分支。两个残余缺口：① 中途分页失败时部分数据照常展示且无「加载中断」标识；② `load_error=true` 且筛选匹配 0 条时，空态误报「会话列表加载失败」并隐藏「清除筛选」按钮。候选修法：空态文案区分「加载失败（all 为空）」与「无匹配（all 非空）」；中途失败时列表上方加一行提示。
- 处理：t234
