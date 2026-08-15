import { useState } from "react";
import { layout_choices_for_count, type LayoutCount } from "../../lib/workspace/slots";
import { Button } from "../ui/Button";
import { Menu, MenuItem } from "../ui/Menu";
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

/** 工作台三按钮：最近会话 / 清空 / 视图下拉。t323 渲染于顶栏刷新按钮左侧；t421 菜单走 ui/Menu。 */
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
        <div className="flex items-center gap-2" data-testid="session-toolbar">
            <Button variant="secondary" size="sm" onClick={on_recent}>
                最近会话
            </Button>
            <Button variant="secondary" size="sm" onClick={on_clear}>
                清空
            </Button>
            <div className="relative">
                <Button
                    variant="secondary"
                    size="sm"
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
                            className="fixed inset-0 z-[var(--z-menu)]"
                            onClick={() => {
                                set_view_open(false);
                            }}
                        />
                        <Menu
                            className="absolute right-0 top-[calc(100%+6px)] z-[calc(var(--z-menu)+1)] min-w-[170px]"
                            data-testid="session-view-menu"
                            role="menu"
                            aria-label="视图选项"
                        >
                            <MenuItem
                                role="menuitemcheckbox"
                                aria-label="显示时间戳"
                                aria-checked={view.show_time}
                                onSelect={() => {
                                    toggle_view({ show_time: !view.show_time });
                                }}
                            >
                                <span className="inline-flex w-4 justify-center" aria-hidden>
                                    {view.show_time ? "✓" : ""}
                                </span>
                                显示时间戳
                            </MenuItem>
                            <MenuItem
                                role="menuitemcheckbox"
                                aria-label="紧凑模式"
                                aria-checked={view.compact}
                                onSelect={() => {
                                    toggle_view({ compact: !view.compact });
                                }}
                            >
                                <span className="inline-flex w-4 justify-center" aria-hidden>
                                    {view.compact ? "✓" : ""}
                                </span>
                                紧凑模式
                            </MenuItem>
                            {layout_choices.length > 0 && (
                                <div
                                    className="mt-1 flex flex-col gap-1 border-t border-[var(--color-hairline)] pt-1"
                                    role="group"
                                    aria-label="会话排布"
                                >
                                    <div className="px-2.5 py-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                        会话排布
                                    </div>
                                    {layout_choices.map((choice) => (
                                        <MenuItem
                                            key={`${String(choice.columns)}x${String(choice.rows)}`}
                                            aria-pressed={layout === choice.columns}
                                            {...(layout === choice.columns
                                                ? {
                                                      className:
                                                          "bg-[var(--color-surface-raised)] text-[var(--color-on-surface)]",
                                                  }
                                                : {})}
                                            onSelect={() => {
                                                on_layout_change(choice.columns);
                                            }}
                                        >
                                            {String(choice.columns)} 列 × {String(choice.rows)} 行
                                        </MenuItem>
                                    ))}
                                </div>
                            )}
                        </Menu>
                    </>
                )}
            </div>
        </div>
    );
}
