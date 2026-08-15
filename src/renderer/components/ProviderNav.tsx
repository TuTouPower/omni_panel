import { useRef } from "react";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { VendorMark } from "./Icon";

export interface ProviderNavProps {
    activeTab: string;
    visibleProviders: string[];
    /** Rendered tab order. Falls back to visibleProviders when absent. */
    orderedProviders?: readonly string[] | undefined;
    onChange: (tab: string) => void;
    draggingProvider?: string | null | undefined;
    overProvider?: string | null | undefined;
    onDragStart?: ((provider: string) => void) | undefined;
    onDragEnter?: ((provider: string) => void) | undefined;
    onDragOver?: ((provider: string, clientX: number, rect: DOMRect) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
}

const TAB_BASE =
    "relative flex w-[62px] shrink-0 cursor-pointer flex-col items-center gap-1 " +
    "rounded-t-md border-0 bg-transparent px-0 pb-3 pt-[9px] " +
    "text-[var(--color-on-surface-variant)] transition-feedback " +
    "hover:bg-[var(--color-surface-raised)] focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]";

const TAB_ACTIVE =
    "bg-[var(--color-primary-container)] text-[var(--color-accent)] " +
    "after:absolute after:inset-x-3 after:bottom-0 after:h-[2.5px] after:rounded-full " +
    "after:bg-[var(--color-accent)] after:content-['']";

const TAB_LBL = "max-w-full truncate text-[length:var(--text-label-md)] font-[550]";

export function ProviderNav({
    activeTab,
    visibleProviders,
    orderedProviders,
    onChange,
    draggingProvider,
    overProvider,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragEnd,
}: ProviderNavProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const tabs = orderedProviders ?? visibleProviders;
    const draggable = onDragStart !== undefined;

    return (
        <>
            <button
                className={TAB_BASE + (activeTab === "overview" ? ` ${TAB_ACTIVE}` : "")}
                data-active={activeTab === "overview"}
                data-tab="overview"
                onClick={() => {
                    onChange("overview");
                }}
            >
                <span
                    className="flex h-[26px] w-[26px] items-center justify-center"
                    data-testid="tab-icon"
                >
                    <VendorMark id="overview" size={22} color="var(--color-accent)" />
                </span>
                <span
                    className={TAB_LBL + (activeTab === "overview" ? " font-semibold" : "")}
                    data-testid="tab-label"
                >
                    总览
                </span>
            </button>
            <div
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 pl-2 pr-3 [scrollbar-width:none] [scroll-behavior:smooth] [&::-webkit-scrollbar]:hidden"
                data-testid="popup-tabs"
                ref={scrollRef}
            >
                {tabs.map((provider) => {
                    const isDragging = draggingProvider === provider;
                    const isOver = overProvider === provider && !isDragging;
                    const isActive = activeTab === provider;
                    return (
                        <button
                            key={provider}
                            className={
                                TAB_BASE +
                                (isActive ? ` ${TAB_ACTIVE}` : "") +
                                (isDragging ? " opacity-45" : "") +
                                (isOver
                                    ? " -outline-offset-2 outline outline-dashed outline-[1.5px] outline-[var(--color-accent)]"
                                    : "")
                            }
                            data-active={isActive}
                            data-tab={provider}
                            onClick={() => {
                                if (draggingRef.current) {
                                    draggingRef.current = false;
                                    return;
                                }
                                onChange(provider);
                            }}
                            onDragEnter={() => {
                                onDragEnter?.(provider);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                onDragOver?.(
                                    provider,
                                    e.clientX,
                                    e.currentTarget.getBoundingClientRect(),
                                );
                            }}
                        >
                            <span
                                className="flex h-[26px] w-[26px] items-center justify-center"
                                data-testid="tab-icon"
                                draggable={draggable}
                                onDragStart={() => {
                                    draggingRef.current = true;
                                    onDragStart?.(provider);
                                }}
                                onDragEnd={() => {
                                    onDragEnd?.();
                                    // dragEnd 后浏览器可能派发 click，用延迟清理标记抑制误切换。
                                    window.setTimeout(() => {
                                        draggingRef.current = false;
                                    }, 0);
                                }}
                            >
                                <VendorMark id={provider} size={22} />
                            </span>
                            <span
                                className={TAB_LBL + (isActive ? " font-semibold" : "")}
                                data-testid="tab-label"
                            >
                                {PROVIDER_LABELS[provider]}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="pointer-events-none absolute bottom-0 right-0 top-[2px] w-[26px] bg-[linear-gradient(90deg,transparent,var(--color-surface-window)_70%)]" />
        </>
    );
}
