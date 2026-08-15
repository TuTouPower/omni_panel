# 会话面板展示调整

## 背景

用户提出会话面板展示调整（p072/p073 + 消息单行折叠需求）：工作台会话面板头部元信息显示完整软件名文字、cwd 完整路径、字号层级与直觉相反；侧边栏槽位显示 provider 颜色条、底部添加按钮；消息列表完整渲染每条消息。需按用户语义调整。

t408 起：去掉「展开/收起」按钮，改为点击消息本体切换折叠；用户消息铺 `primary-container` 底色。

## 范围

- 会话面板（SessionPane）头部元信息：不再显示完整软件名文字（source 字符串），软件识别由 icon 徽标承担；目录（cwd）显示完整路径、不尾部省略；字号层级互换（标题小字号、元信息大字号）；元信息组成为模型、目录、轮次、token、日期，其中日期为最后一条消息的紧凑时间（当年 `MMDD HH:mm`，非当年 `YYMMDD HH:mm`）；宽度不足时 session id/标题先于 cwd 与时间截断。
- 侧边栏（SessionRail）：槽位不再显示 provider 颜色条；折叠后槽位正方形、icon 居中；折叠态添加会话按钮只保留加号；移除侧边栏底部添加会话按钮。
- 会话库（SessionLibrary）：字号层级互换（元信息大字号、标题小字号）。
- 消息列表：所有消息默认单行显示，超出一行内容折叠不可见；**无「展开/收起」按钮**；点击超行消息本体在完整内容与单行折叠间切换；不超行消息点击无折叠效果。用户消息（role=user）整行铺 `primary-container` 背景；Agent 消息无该底色。

## 非范围

- 不动左上角品牌区与右上角控制区。
- 不改变消息选择、多选、滚动跟随等既有行为；不改 Markdown 渲染与消息数据链路。
- 不改变元信息的数据采集口径；不改变侧边栏折叠/展开交互、槽位选择/关闭行为；不改动会话库数据与筛选逻辑。

## 验收标准

- [x] AC1：会话面板元信息行中不出现完整软件名文字，软件 icon 徽标保持显示。
- [x] AC2：元信息中的目录（cwd）显示完整路径，不出现尾部省略号截断；悬浮提示（title）仍可承载完整路径。
- [x] AC3：会话标题的字号小于元信息字号。
- [x] AC4：头部两行元信息——第一行 cwd 完整路径 · 紧凑时间 · session id；第二行模型 · 轮次 · tokens · 会话标题。日期为最后一条消息的紧凑时间：当年 `MMDD HH:mm`（如 `0817 23:25`），非当年 `YYMMDD HH:mm`（如 `250817 23:25`）；session id 允许尾部省略，行宽不足时 session id/标题先于 cwd 与时间被截断。
- [x] AC5：侧边栏槽位不再渲染 provider 颜色条。
- [x] AC6：侧边栏折叠后槽位为正方形且 icon 居中；折叠态添加会话按钮只显示「+」。
- [x] AC7：侧边栏底部不再存在「添加会话」按钮；展开态添加会话入口由折叠态加号承担。
- [x] AC8：会话库中元信息字号大于标题字号。
- [x] AC9：内容超出一行的消息默认只呈现第一行且**不显示**展开/收起按钮；不超行消息同样无按钮。点击超行消息本体在完整内容与单行折叠间切换；不超行消息点击无折叠变化。
- [x] AC10：各消息展开态互不影响；点击行首 checkbox 只改选中态不触发展开切换；消息文本拖选产生选区后松开不触发展开切换。
- [x] AC11：展开/折叠后消息选择状态保持，列表滚动位置不发生跳动错乱（虚拟列表测量行高）。
- [x] AC12：现有测试与 e2e 全部通过。
- [x] AC13：用户消息行背景为 `primary-container` token；Agent 消息行无该背景。

## 实现要点

- `pane.ts` 纯函数：`last_dir_segment`（目录末级，会话库卡片仍用）+ `format_precise_datetime`（年月日时分秒，会话库卡片仍用）+ `format_compact_datetime`（t407 面板头部紧凑时间，可注入 now）。
- `SessionPane`：元信息去 source 文字；cwd 直接展示完整路径且 `shrink-0`（无 truncate）；日期用 `format_compact_datetime(messages.at(-1)?.timestamp ?? openedAt)`；session id / 标题 `min-w-0 truncate`。
- `SessionRail`：去 rail-accent、折叠态空槽「+」/icon 居中、移除底部 rail-add 按钮。
- `PaneMessageRow`（t408）：默认单行折叠（single-line clamp）+ `content_overflows` 测量（scrollHeight>clientHeight，jsdom 退换行启发式）判定超行；**无展开按钮**；点击消息本体切换，交互子元素/文本选区/不超行时不切换。测量不依赖 expanded。用户消息 `bg-[var(--color-primary-container)]`。
- 字号互换：pane-title/meta、lib-card-title/summary。

## 测试覆盖

- `tests/unit/renderer/lib/workspace/pane.test.ts`：last_dir_segment（POSIX/Windows/尾随斜杠/根）+ format_precise_datetime + format_compact_datetime（当年/非当年/跨年边界）。
- `tests/unit/renderer/components/workspace/SessionPane.test.tsx`：元信息无 source 文字、完整 cwd、紧凑时间、空消息回退 openedAt、截断优先级类名。
- `tests/unit/renderer/components/workspace/SessionRail.test.tsx`：无 rail-accent、折叠态「+」、无底部添加按钮、展开态「+ 添加会话」。
- `tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx`：无展开按钮、点击本体切换、checkbox/拖选隔离、user 底色、选中态保持（mock 尺寸）。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + web e2e session_panel + `pnpm test:packaged`。
