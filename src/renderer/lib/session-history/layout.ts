/**
 * 会话历史窗口布局常量（t211/t224）。
 *
 * t224 起工作台为槽位模型（列数由 effective_columns 按布局档位 + 容器宽度计算），
 * 6 栏网格 grid_class 已随 SessionHistoryView 移除。
 */

/** 虚拟滚动分页页大小（决策 17：初始最近 200 条，向上每页 200）。 */
export const HISTORY_PAGE_SIZE = 200;
