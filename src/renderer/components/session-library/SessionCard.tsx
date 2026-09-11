import { memo, useState, type CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import {
    format_compact_datetime,
    format_precise_datetime,
    last_dir_segment,
} from "../../lib/workspace/pane";
import { agent_accent, vendor_id_for_source } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Icon, VendorMark } from "../Icon";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { format_tokens, session_tokens } from "./session-library-utils";

interface CardProps {
    readonly s: TokenStatsSession;
    /** 末条用户消息摘要（对齐 demo lastTalk；空串时尚未加载或无 user 消息）。 */
    readonly summary: string;
    readonly selected: boolean;
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
    /** 复制会话 ID 成功后提示（复用 SessionLibrary 的 show_toast）。 */
    readonly show_toast?: ((message: string) => void) | undefined;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/** 会话 ID 短串（前 8 位，对齐 demo shortId）。 */
function short_id(id: string): string {
    return id.slice(0, 8);
}

/**
 * 会话 ID chip（对齐 demo IdChip）：显示短 id，点击复制完整 id，
 * 成功后短暂变「已复制」。阻止冒泡，避免触发卡片勾选。
 */
export function IdChip({
    id,
    on_copied,
}: {
    readonly id: string;
    readonly on_copied?: ((message: string) => void) | undefined;
}) {
    const [copied, set_copied] = useState(false);
    return (
        <button
            type="button"
            data-testid="library-card-id-chip"
            title={`点击复制完整会话 ID\n${id}`}
            className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xs px-2 py-1 font-code-md text-[length:var(--text-label-md)] transition-feedback",
                copied
                    ? "bg-[var(--color-primary-container)] text-[var(--color-success)]"
                    : "bg-[var(--color-surface-raised)] text-[var(--color-on-surface-muted)] hover:text-[var(--color-primary)]",
            )}
            onClick={(e) => {
                e.stopPropagation();
                // web 非安全上下文（HTTP）无 clipboard API，同步 TypeError 需前置守卫。
                if (typeof navigator.clipboard === "undefined") return;
                void navigator.clipboard
                    .writeText(id)
                    .then(() => {
                        set_copied(true);
                        on_copied?.("已复制");
                        window.setTimeout(() => {
                            set_copied(false);
                        }, 1400);
                    })
                    .catch(() => {
                        // 忽略剪贴板拒绝。
                    });
            }}
        >
            <Icon name={copied ? "check" : "clipboard"} size={copied ? 11 : 10} />
            {copied ? "已复制" : short_id(id)}
        </button>
    );
}

/**
 * 会话库网格卡片（对齐 demo SessionCard）：
 * 行1 logo + 首条→末条消息时间区间 + hover 浮现勾选框（选中态常显）；
 * 行2 目录末级 · tokens · 轮次 + IdChip（复制会话 ID）；
 * 行3 末条用户消息（单行截断）。无独立标题行。
 */
export const SessionCard = memo(function SessionCard({
    s,
    summary,
    selected,
    on_toggle,
    on_preview,
    on_open,
    show_toast,
    onRender,
}: CardProps) {
    onRender?.();

    return (
        <Card
            className={cn(
                "group relative flex min-w-0 flex-col overflow-hidden p-0 transition-shadow hover:shadow-card",
                selected && "ring-1 ring-[var(--agent-accent)]",
            )}
            data-testid="library-card"
            data-session-id={s.id}
            style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
        >
            <div
                className="h-0.5 shrink-0 bg-[var(--agent-accent)]"
                data-testid="library-card-accent"
            />
            <div className="min-w-0 p-3">
                {/* 行1：logo + 时间区间 + hover 勾选框 */}
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]"
                        data-testid="library-card-badge"
                    >
                        <VendorMark id={vendor_id_for_source(s.source)} size={20} />
                    </span>
                    <span
                        className="min-w-0 flex-1 truncate whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                        data-testid="library-card-time-range"
                        title={`${format_precise_datetime(s.started_at)} → ${format_precise_datetime(s.ended_at)}`}
                    >
                        {format_compact_datetime(s.started_at)}
                        {" → "}
                        {format_compact_datetime(s.ended_at)}
                    </span>
                    <span
                        className={cn(
                            "ml-auto shrink-0 transition-opacity",
                            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                    >
                        <Checkbox
                            variant="select"
                            accent="agent"
                            boxSize="lg"
                            checked={selected}
                            aria-label={`会话 ${s.id}`}
                            onClick={() => {
                                on_toggle(s);
                            }}
                        />
                    </span>
                </div>
                {/* 行2：目录末级 · tokens · 轮次 + IdChip */}
                <div
                    className="mt-2 flex min-w-0 items-center gap-1 whitespace-nowrap text-[length:var(--text-label-md)]"
                    data-testid="library-card-meta"
                >
                    {s.directory ? (
                        <span
                            className="min-w-0 shrink truncate text-[var(--color-on-surface-variant)]"
                            style={{ maxWidth: "12ch" }}
                            data-testid="library-card-cwd"
                            title={s.directory}
                        >
                            {last_dir_segment(s.directory)}
                        </span>
                    ) : null}
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--color-on-surface)]">
                        {format_tokens(session_tokens(s))} tokens
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--color-on-surface-variant)]">
                        {String(s.calls)} 轮
                    </span>
                    <span className="min-w-1 flex-1" />
                    <IdChip id={s.id} on_copied={show_toast} />
                </div>
                {/* 行3：末条用户消息（单行截断） */}
                <p
                    className="mt-2 min-h-[1em] truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                    title={summary}
                    data-testid="library-card-summary"
                >
                    {summary}
                </p>
            </div>
            <div className="flex gap-2 px-3 pb-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        on_open(s);
                    }}
                >
                    单独打开
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label="预览"
                    onClick={() => {
                        on_preview(s);
                    }}
                >
                    预览
                </Button>
            </div>
        </Card>
    );
});
