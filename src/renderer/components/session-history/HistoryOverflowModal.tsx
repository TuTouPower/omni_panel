import { useState } from "react";
import { agent_friendly, format_time_short } from "../../lib/session-history/markdown";
import type { HistoryColumnData } from "./HistoryColumn";

export interface HistoryOverflowModalProps {
    readonly columns: readonly HistoryColumnData[];
    /** 等待入栏的新会话数；用户须关闭至少这么多栏。 */
    readonly pending_count: number;
    readonly on_confirm: (close_indices: number[]) => void;
    readonly on_cancel: () => void;
}

/**
 * 超 6 会话处理模态框（t211 决策 4）：列出当前全部栏，用户至少关闭 pending_count 个
 * 后新会话才入栏；可取消。弹窗中被关闭栏的已选消息随之丢弃（前端状态）。
 */
export function HistoryOverflowModal({
    columns,
    pending_count,
    on_confirm,
    on_cancel,
}: HistoryOverflowModalProps) {
    const [close_set, setCloseSet] = useState<ReadonlySet<number>>(() => new Set());
    const enough = close_set.size >= pending_count;

    function toggle(i: number): void {
        const next = new Set(close_set);
        if (next.has(i)) {
            next.delete(i);
        } else {
            next.add(i);
        }
        setCloseSet(next);
    }

    return (
        <div className="history-modal-backdrop" role="dialog" aria-modal="true">
            <div className="history-modal">
                <h2 className="history-modal-title">已打开 6 个会话，需先关闭</h2>
                <p className="history-modal-hint">
                    当前打开 6 个会话；要打开 {pending_count} 个新会话，请先关闭至少 {pending_count}{" "}
                    个。
                </p>
                <ul className="history-modal-list">
                    {columns.map((col, i) => (
                        <li key={`${col.loc.source}|${col.loc.env}|${col.loc.session_id}`}>
                            <label className="history-modal-item">
                                <input
                                    type="checkbox"
                                    checked={close_set.has(i)}
                                    onChange={() => {
                                        toggle(i);
                                    }}
                                />
                                <span className="history-modal-agent">
                                    {agent_friendly(col.loc.source)}
                                </span>
                                <span className="history-modal-item-title">{col.title}</span>
                                <span className="history-modal-opened">
                                    {format_time_short(col.openedAt)} 打开
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
                <div className="history-modal-actions">
                    <button type="button" onClick={on_cancel}>
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={!enough}
                        onClick={() => {
                            on_confirm([...close_set]);
                        }}
                    >
                        关闭并打开新会话
                    </button>
                </div>
            </div>
        </div>
    );
}
