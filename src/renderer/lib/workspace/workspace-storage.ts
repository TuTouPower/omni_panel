import type { SessionHistoryLoc } from "../../../shared/types/ipc";
import { tokenStatsSourceSchema } from "../../../shared/types/token-stats";
import { LAYOUT_OPTIONS, MAX_SLOTS, type LayoutCount } from "./slots";

/**
 * t329 工作台持久化：槽位（source/env/session_id + 顺序）与 布局/视图 开关。
 * 仅渲染进程 localStorage；不持久化消息内容/选择状态/大纲抽屉。
 * 读写失败一律静默回退：写入丢失仅影响重开恢复，读取失败回退默认值。
 */

const SLOTS_KEY = "workspace-slots";
const LAYOUT_KEY = "workspace-layout";

export interface WorkspaceLayoutPrefs {
    readonly layout: LayoutCount;
    readonly view: { readonly show_time: boolean; readonly compact: boolean };
}

/** 读取持久化槽位（固定 8 槽、含空洞，index 即槽位号）；无/损坏/空回退全空。 */
export function load_saved_slots(): readonly (SessionHistoryLoc | null)[] {
    try {
        const raw = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? "null") as unknown;
        if (!Array.isArray(raw)) return empty_loc_slots();
        const entries = raw as unknown[];
        const slots: (SessionHistoryLoc | null)[] = empty_loc_slots();
        for (let i = 0; i < entries.length && i < MAX_SLOTS; i += 1) {
            const entry = entries[i];
            slots[i] = is_loc(entry)
                ? {
                      source: entry.source,
                      env: entry.env,
                      session_id: entry.session_id,
                  }
                : null;
        }
        return slots;
    } catch {
        return empty_loc_slots();
    }
}

/** 写入槽位持久化（顺序即槽位顺序；全空槽即持久化清空）。 */
export function save_slots(slots: readonly (SessionHistoryLoc | null)[]): void {
    try {
        localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    } catch {
        // 写入失败忽略：仅持久化丢失，不影响工作台。
    }
}

/** 读取布局/视图开关；无/损坏回退 null（由调用方取默认值）。 */
export function load_saved_layout(): WorkspaceLayoutPrefs | null {
    try {
        const raw = JSON.parse(
            localStorage.getItem(LAYOUT_KEY) ?? "null",
        ) as Partial<WorkspaceLayoutPrefs> | null;
        if (!raw || typeof raw !== "object") return null;
        if (!is_layout_count(raw.layout) || !is_view(raw.view)) return null;
        return {
            layout: raw.layout,
            view: { show_time: raw.view.show_time, compact: raw.view.compact },
        };
    } catch {
        return null;
    }
}

/** 写入布局列数与视图开关。 */
export function save_layout(layout: LayoutCount, view: WorkspaceLayoutPrefs["view"]): void {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ layout, view }));
    } catch {
        // 写入失败忽略。
    }
}

/**
 * P6：工作台入口已下线，`WorkspaceView` 无挂载点，槽位/布局持久化无人读写——
 * 挂载会话外壳时清理一次，删用户 localStorage 残留孤儿键。幂等，失败静默。
 */
export function clear_saved_workspace(): void {
    try {
        localStorage.removeItem(SLOTS_KEY);
        localStorage.removeItem(LAYOUT_KEY);
    } catch {
        // 清理失败忽略：残留键无害。
    }
}

function empty_loc_slots(): (SessionHistoryLoc | null)[] {
    return Array.from({ length: MAX_SLOTS }, () => null);
}

// 合法 source 从 tokenStatsSourceSchema 派生，避免手写枚举与 schema 漂移。
const KNOWN_SOURCES: ReadonlySet<string> = new Set(tokenStatsSourceSchema.options);

function is_loc(x: unknown): x is SessionHistoryLoc {
    return (
        typeof x === "object" &&
        x !== null &&
        typeof (x as SessionHistoryLoc).source === "string" &&
        KNOWN_SOURCES.has((x as SessionHistoryLoc).source) &&
        typeof (x as SessionHistoryLoc).env === "string" &&
        typeof (x as SessionHistoryLoc).session_id === "string"
    );
}

function is_layout_count(x: unknown): x is LayoutCount {
    return typeof x === "number" && LAYOUT_OPTIONS.includes(x as LayoutCount);
}

function is_view(x: unknown): x is WorkspaceLayoutPrefs["view"] {
    return (
        typeof x === "object" &&
        x !== null &&
        typeof (x as WorkspaceLayoutPrefs["view"]).show_time === "boolean" &&
        typeof (x as WorkspaceLayoutPrefs["view"]).compact === "boolean"
    );
}
