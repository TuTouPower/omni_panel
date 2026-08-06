import type { HistoryMessageLike, SessionHistoryLoc } from "../../../shared/types/ipc";

/** t226 摘选选择 store：模块级单例，跨页签（工作台/会话库）共享。 */

export interface SelectedItem {
    readonly key: string;
    readonly loc: SessionHistoryLoc;
    readonly message: HistoryMessageLike;
    readonly role_index: number;
    readonly session_title: string;
}

function item_key(loc: SessionHistoryLoc, message_id: string): string {
    return `${loc.source}|${loc.env}|${loc.session_id}|${message_id}`;
}

function loc_key(loc: SessionHistoryLoc): string {
    return `${loc.source}|${loc.env}|${loc.session_id}`;
}

let items: SelectedItem[] = [];
const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) fn();
}

export const selection_store = {
    has(loc: SessionHistoryLoc, message_id: string): boolean {
        return items.some((i) => i.key === item_key(loc, message_id));
    },

    all(): readonly SelectedItem[] {
        return items;
    },

    count(): number {
        return items.length;
    },

    /** 点选切换：已选则移除，未选则追加（保持添加顺序）。 */
    toggle(item: SelectedItem): void {
        items = items.some((i) => i.key === item.key)
            ? items.filter((i) => i.key !== item.key)
            : [...items, item];
        notify();
    },

    /** Shift 连选：整体替换某会话的已选集合（调用方先计算锚点到当前的范围内消息）。 */
    set_session(loc: SessionHistoryLoc, session_items: readonly SelectedItem[]): void {
        const lk = loc_key(loc);
        const others = items.filter((i) => loc_key(i.loc) !== lk);
        items = [...others, ...session_items];
        notify();
    },

    clear_session(loc: SessionHistoryLoc): void {
        const lk = loc_key(loc);
        items = items.filter((i) => loc_key(i.loc) !== lk);
        notify();
    },

    clear_all(): void {
        items = [];
        notify();
    },

    // 对象属性箭头函数（非方法）：解构传给 useSyncExternalStore 时无 this 绑定问题。
    subscribe: (fn: () => void): (() => void) => {
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    },
};

/** 测试辅助：清空状态与监听器。 */
export function reset_selection_store(): void {
    items = [];
    listeners.clear();
}
