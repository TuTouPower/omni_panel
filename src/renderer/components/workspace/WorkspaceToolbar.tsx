import { useState } from "react";
import { LAYOUT_OPTIONS, type LayoutCount } from "../../lib/workspace/slots";
import type { PaneView } from "./SessionPane";

interface WorkspaceToolbarProps {
    readonly layout: LayoutCount;
    readonly count: number;
    readonly total_selected: number;
    readonly view: PaneView;
    readonly on_view_change: (view: PaneView) => void;
    readonly on_layout_change: (layout: LayoutCount) => void;
    readonly on_recent: () => void;
    readonly on_clear: () => void;
    readonly on_copy: () => void;
}

/** t224 工作台工具条：最近会话 / 清空 / 居中布局切换器 / 视图下拉 / 复制 / 计数。 */
export function WorkspaceToolbar({
    layout,
    count,
    total_selected,
    view,
    on_view_change,
    on_layout_change,
    on_recent,
    on_clear,
    on_copy,
}: WorkspaceToolbarProps) {
    const [view_open, set_view_open] = useState(false);

    function toggle_view(patch: Partial<PaneView>): void {
        on_view_change({ ...view, ...patch });
    }

    return (
        <header className="workspace-toolbar">
            <div className="ws-toolbar-left">
                <button type="button" className="ws-tb-btn" onClick={on_recent}>
                    最近会话
                </button>
                <button type="button" className="ws-tb-btn" onClick={on_clear}>
                    清空
                </button>
                <div className="ws-view-wrap">
                    <button
                        type="button"
                        className="ws-tb-btn"
                        aria-haspopup="menu"
                        aria-expanded={view_open}
                        onClick={() => {
                            set_view_open((v) => !v);
                        }}
                    >
                        视图 ▾
                    </button>
                    {view_open && (
                        <>
                            <div
                                className="ws-view-overlay"
                                onClick={() => {
                                    set_view_open(false);
                                }}
                            />
                            <div className="ws-view-menu" role="menu" aria-label="视图选项">
                                <label className="ws-view-item">
                                    <input
                                        type="checkbox"
                                        checked={view.show_time}
                                        onChange={(e) => {
                                            toggle_view({ show_time: e.target.checked });
                                        }}
                                    />
                                    显示时间戳
                                </label>
                                <label className="ws-view-item">
                                    <input
                                        type="checkbox"
                                        checked={view.compact}
                                        onChange={(e) => {
                                            toggle_view({ compact: e.target.checked });
                                        }}
                                    />
                                    紧凑模式
                                </label>
                            </div>
                        </>
                    )}
                </div>
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
