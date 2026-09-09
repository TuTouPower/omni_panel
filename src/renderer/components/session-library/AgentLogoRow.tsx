import type { CSSProperties } from "react";
import { agent_accent, vendor_id_for_source } from "../../lib/workspace/slots";
import { agent_friendly } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";
import { VendorMark } from "../Icon";

interface AgentLogoRowProps {
    /** 当前选中的 source 列表；空 = 全部。 */
    readonly agents: readonly string[];
    /** [source, 会话数]，已按数量降序。 */
    readonly counts: readonly [string, number][];
    readonly on_change: (next: string[]) => void;
}

/**
 * 会话库 agent 筛选：logo 行替代文字 chips。首枚「全部」清除选择；各来源按钮
 * 用 VendorMark logo + 数量角标，title 给「名称 + 会话数」。多选语义与旧 chips 一致。
 */
export function AgentLogoRow({ agents, counts, on_change }: AgentLogoRowProps) {
    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="library-agent-row">
            <button
                type="button"
                aria-pressed={agents.length === 0}
                data-testid="library-agent-all"
                className={cn(
                    "rounded-md border px-2 py-1 text-[length:var(--text-label-md)] transition-feedback",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                    agents.length === 0
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-container)] text-[var(--color-primary)]"
                        : "border-[var(--color-outline)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]",
                )}
                onClick={() => {
                    on_change([]);
                }}
            >
                全部
            </button>
            {counts.map(([source, count]) => {
                const name = agent_friendly(source);
                const active = agents.includes(source);
                return (
                    <button
                        key={source}
                        type="button"
                        aria-label={name}
                        aria-pressed={active}
                        title={`${name} ${String(count)} 个会话`}
                        data-testid={`library-agent-logo-${source}`}
                        className={cn(
                            "relative flex h-8 w-8 items-center justify-center rounded-md border transition-feedback",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                            active
                                ? "border-[var(--color-primary)] bg-[var(--color-primary-container)]"
                                : "border-[var(--color-outline)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]",
                        )}
                        style={{ "--agent-accent": agent_accent(source) } as CSSProperties}
                        onClick={() => {
                            on_change(
                                active ? agents.filter((a) => a !== source) : [...agents, source],
                            );
                        }}
                    >
                        <span className="text-[var(--agent-accent)]">
                            <VendorMark id={vendor_id_for_source(source)} size={18} />
                        </span>
                        <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--color-surface-raised)] px-1 font-code-md text-[length:10px] leading-3 tabular-nums text-[var(--color-on-surface-muted)]">
                            {String(count)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
