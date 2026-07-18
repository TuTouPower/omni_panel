# T6 Spec: 多账号间距（半行空隙）

## 问题

用量面板同一厂商下多账号卡片贴太紧，扫视困难。用户：「多账号之间空半行就算换行了」。

## 现状

- 用量面板账号列表：`ProviderAccountList` 对 `ProviderAccountRow` 无 wrapper gap，依赖 `CollapsibleCard`/`.card` 外边距。
- 外层 provider 卡片容器：`.scroll-inner { gap: 12px }`（厂商之间）。
- 设置页 `AccountRow` 另有列表间距，**主诉是用量面板**。

## 期望

- 同一 provider 下相邻账号卡之间增加约 **半行** 间距：约 `0.5em`～`8px` 额外 gap（具体取 `8px`，约等于半行 13–16px 字高的一半）。
- 折叠/展开动画不抖、不裁切。
- 单账号时无多余大空白（仅相邻之间 gap）。

## 范围

- **In**：用量面板 `ProviderAccountList` / 概览内多账号列表
- **Out（默认）**：设置页账号列表（除非实现时一并极小改动无风险）

## 验收

1. Claude 等多账号：卡与卡之间可见半行空白。
2. 折叠后间距仍一致。
3. 单账号视觉不松垮。

## 非目标

- 不改用量条内部 bar-row 间距。
