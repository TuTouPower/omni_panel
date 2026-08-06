import { useRef, useState, useSyncExternalStore } from "react";
import { selection_store, type SelectedItem } from "../../lib/workspace/selection-store";
import { estimate_tokens, format_entries, type CopyFormat } from "../../lib/workspace/copy-format";

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
            className={"selection-tray" + (expanded ? " expanded" : "")}
            style={{ height: effective_height }}
        >
            <div className="tray-drag-handle" onMouseDown={start_drag} />
            {!expanded ? (
                <div className="tray-collapsed">摘选托盘（空）</div>
            ) : (
                <>
                    <div className="tray-scroll">
                        {[...groups.values()].map((g) => (
                            <div
                                className="tray-group"
                                key={`${g.loc.source}|${g.loc.env}|${g.loc.session_id}`}
                            >
                                <div className="tray-group-head">{g.title || g.loc.session_id}</div>
                                <div className="tray-group-chips">
                                    {g.items.map((item) => (
                                        <div
                                            className="tray-chip"
                                            key={item.key}
                                            title={item.message.text}
                                        >
                                            <span className="tray-chip-agent">
                                                {agent_abbrev(item.loc.source)}
                                            </span>
                                            <span className="tray-chip-label">
                                                {item.message.role === "user" ? "U" : "A"}
                                                {String(item.role_index)}
                                            </span>
                                            <span className="tray-chip-summary">
                                                {item.message.text.slice(0, 40) || "(空)"}
                                            </span>
                                            <span className="tray-chip-tokens">
                                                {String(estimate_tokens(item.message.text))}
                                            </span>
                                            <button
                                                type="button"
                                                className="tray-chip-remove"
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
                    <div className="tray-foot">
                        <span className="tray-count">
                            {String(items.length)} 片段 · {String(total_tokens)} tokens
                        </span>
                        <div className="tray-format-wrap">
                            <select
                                className="tray-format"
                                aria-label="复制格式"
                                value={format}
                                onChange={(e) => {
                                    set_format(e.target.value as CopyFormat);
                                }}
                            >
                                <option value="markdown">Markdown</option>
                                <option value="plain">纯文本</option>
                                <option value="grouped">按会话分组</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            className="tray-btn"
                            onClick={copy}
                            disabled={items.length === 0}
                        >
                            {copied ? "已复制 ✓" : "复制"}
                        </button>
                        <button
                            type="button"
                            className="tray-btn tray-btn-clear"
                            aria-label="清空摘选"
                            onClick={() => {
                                selection_store.clear_all();
                            }}
                        >
                            清空
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
