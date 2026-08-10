import { useState } from "react";
import { layout_choices_for_count, type LayoutCount } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
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

/** 工作台工具条：最近会话 / 清空 / 视图下拉。 */
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
        <header className="history-toolbar flex shrink-0 items-center gap-2 border-b border-[var(--color-hairline)] px-3 py-2">
            <div className="history-toolbar-actions flex shrink-0 items-center gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="history-toolbar-button"
                    onClick={on_recent}
                >
                    最近会话
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    className="history-toolbar-button"
                    onClick={on_clear}
                >
                    清空
                </Button>
                <div className="history-view-wrap relative">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="history-toolbar-button"
                        aria-haspopup="menu"
                        aria-expanded={view_open}
                        onClick={() => {
                            set_view_open((v) => !v);
                        }}
                    >
                        视图 ▾
                    </Button>
                    {view_open && (
                        <>
                            <div
                                className="history-view-overlay fixed inset-0 z-[var(--z-menu)]"
                                onClick={() => {
                                    set_view_open(false);
                                }}
                            />
                            <div
                                className="history-view-menu glass-menu absolute left-0 top-[calc(100%+6px)] z-[calc(var(--z-menu)+1)] flex min-w-[170px] flex-col gap-0.5 rounded-lg border border-[var(--color-outline)] p-1"
                                role="menu"
                                aria-label="视图选项"
                            >
                                <label className="history-view-item flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]">
                                    <Checkbox
                                        checked={view.show_time}
                                        onChange={(e) => {
                                            toggle_view({ show_time: e.target.checked });
                                        }}
                                    />
                                    显示时间戳
                                </label>
                                <label className="history-view-item flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]">
                                    <Checkbox
                                        checked={view.compact}
                                        onChange={(e) => {
                                            toggle_view({ compact: e.target.checked });
                                        }}
                                    />
                                    紧凑模式
                                </label>
                                {layout_choices.length > 0 && (
                                    <div
                                        className="history-layout-choices mt-1 flex flex-col gap-0.5 border-t border-[var(--color-hairline)] pt-1"
                                        role="group"
                                        aria-label="会话排布"
                                    >
                                        <div className="history-layout-title px-2.5 py-1 text-label-md text-[var(--color-on-surface-muted)]">
                                            会话排布
                                        </div>
                                        {layout_choices.map((choice) => (
                                            <button
                                                type="button"
                                                key={`${String(choice.columns)}x${String(choice.rows)}`}
                                                className={cn(
                                                    "history-layout-choice w-full rounded-md px-2.5 py-1.5 text-left text-body-sm text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                                    layout === choice.columns &&
                                                        "bg-[var(--color-surface-raised)] text-[var(--color-on-surface)]",
                                                )}
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
        </header>
    );
}
