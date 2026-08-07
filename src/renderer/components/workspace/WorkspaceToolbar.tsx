import { useState } from "react";
import {
    LAYOUT_OPTIONS,
    layout_choices_for_count,
    type LayoutCount,
} from "../../lib/workspace/slots";
import type { PaneView } from "./SessionPane";

interface WorkspaceToolbarProps {
    readonly layout: LayoutCount;
    readonly count: number;
    readonly view: PaneView;
    readonly on_view_change: (view: PaneView) => void;
    readonly on_layout_change: (layout: LayoutCount) => void;
    readonly on_recent: () => void;
    readonly on_clear: () => void;
}

/** t224 工作台工具条：最近会话 / 清空 / 视图下拉 / 居中布局切换器 / 计数。 */
export function WorkspaceToolbar({
    layout,
    count,
    view,
    on_view_change,
    on_layout_change,
    on_recent,
    on_clear,
}: WorkspaceToolbarProps) {
    const [view_open, set_view_open] = useState(false);
    const base_layout_choices = layout_choices_for_count(count);
    const layout_choices =
        count === 0 || base_layout_choices.some((choice) => choice.columns === layout)
            ? base_layout_choices
            : [
                  ...base_layout_choices,
                  {
                      columns: layout,
                      rows: Math.ceil(count / layout),
                  },
              ];

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
                                {layout_choices.length > 0 && (
                                    <div
                                        className="ws-layout-choices"
                                        role="group"
                                        aria-label="会话排布"
                                    >
                                        <div className="ws-layout-choices-title">会话排布</div>
                                        {layout_choices.map((choice) => (
                                            <button
                                                type="button"
                                                key={`${String(choice.columns)}x${String(choice.rows)}`}
                                                className="ws-layout-choice"
                                                aria-pressed={layout === choice.columns}
                                                onClick={() => {
                                                    on_layout_change(choice.columns);
                                                }}
                                            >
                                                {String(choice.columns)} 列 × {String(choice.rows)}{" "}
                                                行
                                            </button>
                                        ))}
                                    </div>
                                )}
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
                <span className="ws-count">
                    {String(count)}/{String(8)}
                </span>
            </div>
        </header>
    );
}
