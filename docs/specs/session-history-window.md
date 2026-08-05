# 会话历史窗口

需求：从会话明细表打开历史会话，窗口内分栏平铺多会话实时查看，消息可单选/多选/跨栏复制。主进程订阅 / watcher 服务与 SESSION_HISTORY_IPC 通道组见 `architecture.md` §4.4；本 spec 覆盖窗口 UI 行为与复制契约。

## 窗口形态（决策 3/14）

- route `history` 单窗口，默认 1400×860，首次居中不记忆位置；最多 6 栏。
- 分栏：1~2 会话单列整行，3~6 两列网格（3=2+1, 4=2×2, 5=2+2+1, 6=2×3）；栏内容区独立滚动。
- 栏头：agent + 标题 + 关闭 ×。顶部工具栏：清空全部（不弹确认）、全局复制（显示总选中数）、N/6 计数、「最近 6 条」按钮。

## 打开与定位

- `SESSION_HISTORY_OPEN` 幂等：未开窗口创建并经 URL `loc` query 带初始定位，已开则 `SESSION_HISTORY_FOCUS` 定位。
- **入口（t212）**：明细表单击行 / 勾选批量「打开历史」（传 `identity_key` = `source|env|session_id`）、popup TitleBar「会话历史」、代理面板 header「到会话历史」；纯跳转入口（无具体会话）调 `open("", "", "")` 只开/聚焦空窗。窗口内「用量面板」/「代理面板」返回跳转。
- 批量打开冷启动：创建窗口期连续定位由主进程缓冲，`did-finish-load` 后按序补发（不丢会话）。
- onFocus 事件打开会话栏；同一会话已开则滚动到该栏。
- 最近 6 条：`tokenStats.getSessions({ limit: 6 })`（跨 source，按 ended_at 降序）在窗口内批量打开；空位不足走超 6 模态腾位。
- 标题解析：open 后按 `getSessions({ source, env, search: session_id })` 精确 id 匹配取 title，失败回退 session_id。

## 超 6 会话（决策 4）

打开第 7 个弹模态框：列出当前 6 个会话（agent + 标题 + 打开时间），用户至少关闭 1 个新会话才入栏，可取消；无自动淘汰。容量检查用同步计数（React 19 批处理下 render-fresh ref 在批量 open 循环内会 stale，超 6 直接挂载）。

## 消息渲染与选择（决策 8/11/13）

- 仅显示主 transcript 的 user/assistant 文本；tool/system/thinking 不显示。
- 纯文本 + `<pre>` 保留换行缩进，零新依赖。时间戳显示到分钟、悬停显示完整时间；grok 无时间不渲染。
- hover checkbox 点选，跨栏选择；选中集按 `loc_key|message_id` 存 renderer，跨刷新保留。
- 栏头「已选 N 条 / 全选本栏 / 清除本栏」；复制按钮在顶部工具栏（全局，显示总选中数）。

## 复制输出（决策 9/10）

一次复制所有栏选中，从原始消息重新生成 Markdown（不取 DOM），按栏打开顺序分节：

```markdown
## 会话：fix login bug（claude-code · 2026-08-04）

**用户**

消息内容……

**Claude**

回复内容……

---

## 会话：refactor store（opencode · 2026-08-05）

……
```

- 节间 `---` 隔离；角色 `**用户**` / `**Agent 名**`（claude_code→Claude、opencode→OpenCode、kimi_code→Kimi、grok→Grok）。
- 节内消息按时间升序（timestamp null 排后）；节标题标题为 null 时回退 source slug + 日期。
- 复制后按钮变「已复制 ✓」1.5s 恢复。

## 长会话分页（决策 17）

- 初始加载最近 200 条；向上滚动加载更早（游标分页 + 并发锁 + 前置 scrollTop 锚定保持视口）。
- 新增消息追加尾部，不打断当前滚动位置（追加不补偿 scrollTop，前置才补偿）。

## 实时刷新（决策 5/6）

- 栏打开 subscribe、栏关/清空/窗口卸载 unsubscribe；窗口关闭注销全部订阅。
- `SESSION_HISTORY_MESSAGES_UPDATED` 推送按 loc 合并去重追加尾部。
- 5s 兜底 interval 对 ready 栏 query 尾部合并（函数式 setState 与推送交错安全）。

## 空态（决策 12）

源文件缺失（订阅/查询拒绝）栏显示「该会话的原始记录文件不存在或已删除」，不阻断其他栏。

## 硬约束

对会话源文件全程只读；「关闭会话」「清空全部」只作用于前端栏与主进程订阅/watcher 状态，绝不触碰磁盘文件。
