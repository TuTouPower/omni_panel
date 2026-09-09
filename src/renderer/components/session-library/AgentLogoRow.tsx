import type { CSSProperties } from "react";
import { agent_accent, vendor_id_for_source } from "../../lib/workspace/slots";
import { agent_friendly } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";
import { VendorMark } from "../Icon";

interface AgentLogoRowProps {
    /** 当前选中的 source 列表；空 = 全部。 */
    readonly agents: readonly string[];
    /** [source, 会话数]，已按数量降序（数量仅用于排序，不展示）。 */
    readonly counts: readonly [string, number][];
    readonly on_change: (next: string[]) => void;
}

/**
 * 会话库 agent 筛选：纯 logo 方块行（对齐 demo）——无「全部」按钮、无数量
 * 角标；未选中半透明，选中亮出 agent  accent 色边与底色。空选择 = 全部。
 */
export function AgentLogoRow({ agents, counts, on_change }: AgentLogoRowProps) {
    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="library-agent-row">
            {counts.map(([source]) => {
                const name = agent_friendly(source);
                const active = agents.includes(source);
                const accent = agent_accent(source);
                return (
                    <button
                        key={source}
                        type="button"
                        aria-label={name}
                        aria-pressed={active}
                        title={name}
                        data-testid={`library-agent-logo-${source}`}
                        className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-[8px] border transition-feedback",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                            active ? "" : "opacity-45 hover:opacity-90",
                        )}
                        style={
                            {
                                "--agent-accent": accent,
                                background: active
                                    ? `color-mix(in srgb, ${accent} 18%, transparent)`
                                    : `color-mix(in srgb, ${accent} 7%, transparent)`,
                                borderColor: active ? accent : "transparent",
                            } as CSSProperties
                        }
                        onClick={() => {
                            on_change(
                                active ? agents.filter((a) => a !== source) : [...agents, source],
                            );
                        }}
                    >
                        <span className="text-[var(--agent-accent)]">
                            <VendorMark id={vendor_id_for_source(source)} size={18} />
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
