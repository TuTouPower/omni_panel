# 会话面板展示调整

## 背景

用户提出会话面板展示调整（p072/p073 + 消息单行折叠需求）：工作台会话面板头部元信息显示完整软件名文字、cwd 完整路径、字号层级与直觉相反；侧边栏槽位显示 provider 颜色条、底部添加按钮；消息列表完整渲染每条消息。需按用户语义调整。

## 范围

- 会话面板（SessionPane）头部元信息：不再显示完整软件名文字（source 字符串），软件识别由 icon 徽标承担；目录只显示最后一级目录名；字号层级互换（标题小字号、元信息大字号）；元信息组成为模型、目录、轮次、token、日期，其中日期显示最后一条消息的精确时间（含年月日时分秒）。
- 侧边栏（SessionRail）：槽位不再显示 provider 颜色条；折叠后槽位正方形、icon 居中；折叠态添加会话按钮只保留加号；移除侧边栏底部添加会话按钮。
- 会话库（SessionLibrary）：字号层级互换（元信息大字号、标题小字号）。
- 消息列表：所有消息默认单行显示，超出一行内容折叠不可见；超行消息显示展开按钮，点击展开显示完整内容，再次点击恢复单行折叠；不超行消息不显示展开按钮。

## 非范围

- 不动左上角品牌区与右上角控制区。
- 不改变消息选择、多选、滚动跟随等既有行为；不改 Markdown 渲染与消息数据链路。
- 不改变元信息的数据采集口径；不改变侧边栏折叠/展开交互、槽位选择/关闭行为；不改动会话库数据与筛选逻辑。

## 验收标准

- [x] AC1：会话面板元信息行中不出现完整软件名文字，软件 icon 徽标保持显示。
- [x] AC2：元信息中的目录只显示最后一级目录名，悬浮提示（title）保留完整路径。
- [x] AC3：会话标题的字号小于元信息字号。
- [x] AC4：元信息依次呈现模型、目录、轮次、token、日期五项；日期为最后一条消息的精确时间。
- [x] AC5：侧边栏槽位不再渲染 provider 颜色条。
- [x] AC6：侧边栏折叠后槽位为正方形且 icon 居中；折叠态添加会话按钮只显示「+」。
- [x] AC7：侧边栏底部不再存在「添加会话」按钮；展开态添加会话入口由折叠态加号承担。
- [x] AC8：会话库中元信息字号大于标题字号。
- [x] AC9：内容超出一行的消息默认只呈现第一行且显示展开按钮；不超行消息不显示按钮。
- [x] AC10：点击展开按钮完整显示；再次点击恢复单行折叠；各消息状态互不影响。
- [x] AC11：展开/折叠后消息选择状态保持，列表滚动位置不发生跳动错乱（虚拟列表测量行高）。
- [x] AC12：现有测试与 e2e 全部通过。

## 实现要点

- `pane.ts` 纯函数：`last_dir_segment`（目录末级，Windows/POSIX/尾随斜杠）+ `format_precise_datetime`（年月日时分秒）。
- `SessionPane`：元信息去 source 文字、目录取末级 + title 完整路径、日期改 `messages.at(-1)?.timestamp`（无消息回退 openedAt）。
- `SessionRail`：去 rail-accent、折叠态空槽「+」/icon 居中、移除底部 rail-add 按钮。
- `PaneMessageRow`：默认单行折叠（single-line clamp）+ `content_overflows` 测量（scrollHeight>clientHeight，jsdom 退换行启发式）判定超行显示展开按钮；点击切换。测量不依赖 expanded（防展开后误判按钮消失）。
- 字号互换：pane-title/meta、lib-card-title/summary。

## 测试覆盖

- `tests/unit/renderer/lib/workspace/pane.test.ts`：last_dir_segment（POSIX/Windows/尾随斜杠/根）+ format_precise_datetime。
- `tests/unit/renderer/components/workspace/SessionPane.test.tsx`：元信息无 source 文字、最后消息时间、空消息回退 openedAt。
- `tests/unit/renderer/components/workspace/SessionRail.test.tsx`：无 rail-accent、折叠态「+」、无底部添加按钮、展开态「+ 添加会话」。
- `tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx`：超行/单行按钮有无、折叠→展开→收起、选中态保持（mock 尺寸）。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + web e2e session_panel + `pnpm test:packaged`。
