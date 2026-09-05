# d053 原生 select 三种手势的 DOM 事件形态（Chromium 实测）

- 来源：t454 task（临时 e2e probe，已删；d052 的补充）
- 结论：键盘改值 = keydown→input→change，无 click/mousedown；Esc = 仅 keyup，无 blur/change（无关闭信号）；外部点击 = mousedown（他处）→blur+focusout→mouseup→click（失焦可靠）。同值键盘重选（方向键来回+回车）经中间值 change 可达，唯纯同值无任何信号。
- 证据：Chromium 真机 probe 日志（focus/arrowdown/enter-pick/escape/blur-away 五段，事件双记为 select+document 冒泡）。
- 影响：select 触发浮层的开关设计：开以下拉 mousedown 区分两次 click（d052）；放弃动作用 blur 收场；Esc/纯键盘同值不做承诺。
- 现状：有效
