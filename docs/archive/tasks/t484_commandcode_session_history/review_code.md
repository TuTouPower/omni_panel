# Task review t484（reviewer_focus: 代码）

- task：`t484_commandcode_session_history`
- spec：`docs/tasks/t484_commandcode_session_history/spec.md`
- diff_anchor：`b5d4949f6125fdeed0a789b217983a76b6ba2b54`
- target：`git diff b5d4949f6125fdeed0a789b217983a76b6ba2b54`
- round：1

## Findings

本轮零 finding。

独立复核了数据过滤、字节游标、locator 隔离、订阅缓存、IPC/LocalAPI/Web 边界、resume
执行安全、公共 agent 枚举、颜色 token 和两面板映射。Command Code extractor 只接受
`type=message`、user/assistant 的 text block；user 额外要求 `meta.source=user`，工具与
thinking 块不会进入 HistoryMessage。增量游标保存合法消息计数及文件快照，半行/UTF-8
边界回退到行边界；截断或同尺寸重写返回替换标记，订阅缓存不会把旧消息拼到新文件。

locator 只在 linux/mac 使用 t483 的本机 projects 路径，并按项目目录下的精确 basename
匹配，不接受路径分隔符。IPC 与 LocalAPI resume 先验证本地平台和已定位 session，执行器
固定为 `spawn("cmd", ["--resume", session_id], { shell: false })`；renderer 的
Command Code 自定义设置不会改变固定模板，因此没有任意命令执行入口。Web 通过 LocalAPI
使用同一固定宿主路径，未被 clipboard 能力禁用。

TokenStats 的公共 source/agent schema、查询 union、AgentFilter、dashboard 图例、CSS
亮暗色 token、vendor mark/accent 和 session-history 映射均已形成闭环；未发现遗漏的
Command Code 生产 switch。生产 main/preload/renderer/Web 构建通过；CSS 优化器 warning
为仓库既有 generated utility warning。

## 结论

- extractor、locator、subscription 四处策略和两端入口符合 t484 spec。
- 固定 resume 模板与 `shell:false` 隔离满足安全边界；非字符串 IPC session id 也会在入口拒绝。
- SQLite native binding 缺失、pnpm 无 TTY、Markdown formatter 缺 `md_kx` 是环境门禁阻塞，未落在本 diff。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|Command Code extractor fixture 只保留 user/assistant text，并断言顺序和 timestamp。|
|AC-002|re_verified|追加消息增量测试只返回新增文本，并断言 `commandcode:1` id 延续。|
|AC-003|re_verified|first_user/last_user 测试过滤 tool source 后分别返回首末真人 user。|
|AC-004|re_verified|locator 测试命中精确 projects basename，missing 和 `../` session id 返回 null。|
|AC-005|re_verified|schema、TokenStatsView AgentFilter、chart-data/dashboard palette 与查询 union 均接入 commandcode。|
|AC-006|re_verified|panels wiring 测试断言 friendly/slug/abbrev/vendor/accent 与 `cmd --resume sid`。|
|AC-007|re_verified|subscription-service 真实 Command Code watcher 追加测试断言 `on_update` 增量推送。|
|AC-008|re_verified|独立测试覆盖半行多字节、非法 JSON、未知 block、同尺寸重写和畸形 timestamp。|
|AC-009|re_verified|resume/IPC/Web/SessionPane 测试断言固定模板、host 调用和无 clipboard Web 路径。|
|AC-010|re_verified|IPC commandcode subscribe、Web commandcode subscribe、watcher 更新和既有 messagesUpdated 桥测试均通过；LocalAPI 真实集成因 native SQLite 阻塞。|

coverage = 10 / 10

reviewed_scope: 606f3224c61cdee9

verdict: PASS
