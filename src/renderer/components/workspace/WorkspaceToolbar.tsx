import { LAYOUT_OPTIONS, type LayoutCount } from "../../lib/workspace/slots";

interface WorkspaceToolbarProps {
    readonly layout: LayoutCount;
    readonly count: number;
    readonly total_selected: number;
    readonly on_layout_change: (layout: LayoutCount) => void;
    readonly on_recent: () => void;
    readonly on_clear: () => void;
    readonly on_copy: () => void;
}

/** t224 工作台工具条：最近会话 / 清空 / 居中布局切换器 / 复制 / 计数。 */
export function WorkspaceToolbar({
    layout,
    count,
    total_selected,
    on_layout_change,
    on_recent,
    on_clear,
    on_copy,
}: WorkspaceToolbarProps) {
    return (
        <header className="workspace-toolbar">
            <div className="ws-toolbar-left">
                <button type="button" className="ws-tb-btn" onClick={on_recent}>
                    最近会话
                </button>
                <button type="button" className="ws-tb-btn" onClick={on_clear}>
                    清空
                </button>
            </div>
            <div className="ws-layout-switch">
                {LAYOUT_OPTIONS.map((n) => (
                    <button
                        type="button"
                        key={String(n)}
                        className={"ws-layout-btn" + (layout === n ? " on" : "")}
                        aria-label={`布局 ${String(n)}`}
                        onClick={() => {
                            on_layout_change(n);
                        }}
                    >
                        {String(n)}
                    </button>
                ))}
            </div>
            <div className="ws-toolbar-right">
                <button
                    type="button"
                    className="ws-tb-btn ws-copy"
                    disabled={total_selected === 0}
                    onClick={on_copy}
                >
                    复制 {String(total_selected)} 条
                </button>
                <span className="ws-count">
                    {String(count)}/{String(8)}
                </span>
            </div>
        </header>
    );
}
