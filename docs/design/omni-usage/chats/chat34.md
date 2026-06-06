# 用量条宽度

_Started 2026-06-06 12:07 UTC_

---

## User

用量条现在多宽 几像素

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: list_files]_

_[tool: grep]_

用量条（`.track`）的**粗细是 6px**（`height: 6px`，圆角 99px）。

至于**长度**则不是固定像素——它是行内唯一的弹性列（grid 模板里的 `minmax(0, 1fr)`），会吸收所有剩余宽度。一行的结构是：

`名称(--lbl-w) · 用量条(1fr) · 数值(66px) · 时间(74px)`

所以面板默认宽 482px 时，用量条大约占 200px 出头；把窗口右边缘拖宽时，多出来的宽度全部喂给用量条这一列，其他列宽度不变。

你是想调它的**粗细（6px）**还是**最小/固定长度**？告诉我目标值我就改。

## User

改成 4

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

顺手把加载骨架条也从 6px 改到 4px 保持一致：用量条粗细已从 6px 改成 **4px**（加载骨架条也一并改了，保持一致）。

