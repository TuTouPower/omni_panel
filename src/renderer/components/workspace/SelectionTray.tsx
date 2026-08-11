import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { agent_accent } from "../../lib/workspace/slots";
import { selection_store, type SelectedItem } from "../../lib/workspace/selection-store";
import { estimate_tokens, format_entries, type CopyFormat } from "../../lib/workspace/copy-format";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

const TRAY_MIN_H = 40;
const TRAY_MAX_H = 320;
const TRAY_CONTENT_H = 160;

/** 拖拽高度 clamp 到 [TRAY_MIN_H, TRAY_MAX_H]（f008）。 */
export function clamp_tray_height(base: number, delta: number): number {
    return Math.min(TRAY_MAX_H, Math.max(TRAY_MIN_H, base + delta));
}

function agent_abbrev(source: string): string {
    if (source === "claude_code") return "C";
    if (source === "opencode") return "OC";
    if (source === "kimi_code") return "K";
    if (source === "grok") return "G";
    return source.slice(0, 2).toUpperCase();
}

/** t226 底部摘选托盘：按会话分组 chip、三格式复制、可调高、空态细条。 */
export function SelectionTray() {
    const items = useSyncExternalStore(selection_store.subscribe, () => selection_store.all());
    const [format, set_format] = useState<CopyFormat>("markdown");
    const [height, set_height] = useState(TRAY_MIN_H);
    const [copied, set_copied] = useState(false);
    const drag_ref = useRef<{ start_y: number; start_h: number } | null>(null);

    const expanded = items.length > 0;
    const total_tokens = items.reduce((acc, i) => acc + estimate_tokens(i.message.text), 0);

    // 空态收成细条（TRAY_MIN_H）；首次有内容展开到默认内容高（f002）。
    const effective_height = expanded ? Math.max(height, TRAY_CONTENT_H) : TRAY_MIN_H;

    // 按会话分组（保持添加顺序）
    const groups = new Map<
        string,
        { title: string; loc: SelectedItem["loc"]; items: SelectedItem[] }
    >();
    for (const item of items) {
        const k = `${item.loc.source}|${item.loc.env}|${item.loc.session_id}`;
        const g = groups.get(k);
        if (g) {
            g.items.push(item);
        } else {
            groups.set(k, { title: item.session_title, loc: item.loc, items: [item] });
        }
    }

    function copy(): void {
        const text = format_entries(items, format);
        if (!text) return;
        void navigator.clipboard
            .writeText(text)
            .then(() => {
                set_copied(true);
                window.setTimeout(() => {
                    set_copied(false);
                }, 1500);
            })
            .catch(() => {
                // 失焦窗口剪贴板写可能被拒；忽略。
            });
    }

    function start_drag(e: React.MouseEvent): void {
        e.preventDefault();
        drag_ref.current = { start_y: e.clientY, start_h: height };
        const on_move = (ev: MouseEvent): void => {
            if (!drag_ref.current) return;
            const delta = drag_ref.current.start_y - ev.clientY;
            set_height(clamp_tray_height(drag_ref.current.start_h, delta));
        };
        const on_up = (): void => {
            drag_ref.current = null;
            window.removeEventListener("mousemove", on_move);
            window.removeEventListener("mouseup", on_up);
        };
        window.addEventListener("mousemove", on_move);
        window.addEventListener("mouseup", on_up);
    }

    return (
        <div
            className={cn(
                "selection-tray relative flex min-h-10 shrink-0 flex-col overflow-hidden border-t border-[var(--color-outline)] bg-[var(--color-surface-window)]",
                expanded && "expanded",
            )}
            style={{ height: effective_height }}
        >
            <div
                className="selection-tray-handle h-1.5 shrink-0 cursor-ns-resize bg-transparent hover:bg-[var(--color-primary-container)]"
                onMouseDown={start_drag}
            />
            {!expanded ? (
                <div className="selection-tray-collapsed px-3.5 py-2 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    摘选托盘（空）
                </div>
            ) : (
                <>
                    <div className="selection-tray-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
                        {[...groups.values()].map((g) => (
                            <div
                                className="selection-tray-group"
                                key={`${g.loc.source}|${g.loc.env}|${g.loc.session_id}`}
                            >
                                <div className="selection-tray-group-head mb-1 text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                                    {g.title || g.loc.session_id}
                                </div>
                                <div className="selection-tray-group-chips flex flex-wrap gap-1.5">
                                    {g.items.map((item) => (
                                        <div
                                            className="selection-chip inline-flex max-w-[320px] items-center gap-1.5 rounded-full border border-[var(--color-outline)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]"
                                            key={item.key}
                                            title={item.message.text}
                                            style={
                                                {
                                                    "--agent-accent": agent_accent(item.loc.source),
                                                } as CSSProperties
                                            }
                                        >
                                            <span className="selection-chip-agent flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--agent-accent)] text-[9px] font-bold text-[var(--color-on-primary)]">
                                                {agent_abbrev(item.loc.source)}
                                            </span>
                                            <span className="selection-chip-label shrink-0 font-bold tabular-nums text-[var(--color-on-surface-muted)]">
                                                {item.message.role === "user" ? "U" : "A"}
                                                {String(item.role_index)}
                                            </span>
                                            <span className="selection-chip-summary min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-on-surface)]">
                                                {item.message.text.slice(0, 40) || "(空)"}
                                            </span>
                                            <span className="selection-chip-tokens shrink-0 tabular-nums text-[var(--color-on-surface-muted)]">
                                                {String(estimate_tokens(item.message.text))}
                                            </span>
                                            <button
                                                type="button"
                                                className="selection-chip-remove flex h-4 w-4 shrink-0 items-center justify-center rounded text-[length:var(--text-body-sm)] leading-none text-[var(--color-on-surface-muted)] hover:bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] hover:text-[var(--color-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                                aria-label={`移除片段 ${item.key}`}
                                                onClick={() => {
                                                    selection_store.toggle(item);
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="selection-tray-footer flex shrink-0 items-center gap-2.5 border-t border-[var(--color-outline)] px-3 py-1.5">
                        <span className="selection-tray-count text-[length:var(--text-body-sm)] tabular-nums text-[var(--color-on-surface-variant)]">
                            {String(items.length)} 片段 · {String(total_tokens)} tokens
                        </span>
                        <Select
                            className="selection-tray-format w-auto min-w-[130px]"
                            aria-label="复制格式"
                            value={format}
                            onChange={(e) => {
                                set_format(e.target.value as CopyFormat);
                            }}
                        >
                            <option value="markdown">Markdown</option>
                            <option value="plain">纯文本</option>
                            <option value="grouped">按会话分组</option>
                        </Select>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="selection-tray-button"
                            onClick={copy}
                            disabled={items.length === 0}
                        >
                            {copied ? "已复制 ✓" : "复制"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="selection-tray-button selection-tray-clear"
                            aria-label="清空摘选"
                            onClick={() => {
                                selection_store.clear_all();
                            }}
                        >
                            清空
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
