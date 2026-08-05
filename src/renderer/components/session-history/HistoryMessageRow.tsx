import type { HistoryMessageLike } from "../../../shared/types/ipc";
import { format_time_full, format_time_short } from "../../lib/session-history/markdown";

export interface HistoryMessageRowProps {
    readonly message: HistoryMessageLike;
    readonly selected: boolean;
    readonly onToggle: (id: string) => void;
}

/**
 * 单条消息行（t211 决策 8/11）：hover checkbox 点选，纯文本 + `<pre>` 保留换行缩进，
 * 时间戳显示到分钟、悬停显示完整时间。
 */
export function HistoryMessageRow({ message, selected, onToggle }: HistoryMessageRowProps) {
    return (
        <div className="history-msg-row">
            <input
                type="checkbox"
                className="history-msg-check"
                aria-label={`选择消息 ${message.text.slice(0, 24) || "(空)"}`}
                checked={selected}
                onChange={() => {
                    onToggle(message.id);
                }}
            />
            <div className="history-msg-body">
                <div className="history-msg-meta">
                    <span className="history-msg-role">
                        {message.role === "user" ? "用户" : "Agent"}
                    </span>
                    {message.timestamp !== null && (
                        <span
                            className="history-msg-time"
                            title={format_time_full(message.timestamp)}
                        >
                            {format_time_short(message.timestamp)}
                        </span>
                    )}
                </div>
                <pre className="history-msg-text">{message.text}</pre>
            </div>
        </div>
    );
}
