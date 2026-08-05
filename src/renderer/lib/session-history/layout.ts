/**
 * 会话历史窗口布局纯函数（t211）。
 *
 * 决策 3 分栏规则：1~2 会话纵向整行（单列），3~6 两列网格（3=2+1, 4=2×2,
 * 5=2+2+1, 6=2×3）；栏内容区独立滚动。
 */

/** 按当前栏数返回网格 CSS class。 */
export function grid_class(count: number): string {
    return count <= 2 ? "history-grid single" : "history-grid";
}

/** 虚拟滚动分页页大小（决策 17：初始最近 200 条，向上每页 200）。 */
export const HISTORY_PAGE_SIZE = 200;
