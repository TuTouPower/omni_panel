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
                className={"tab pinned" + (activeTab === "overview" ? " active" : "")}
                data-tab="overview"
                onClick={() => {
                    onChange("overview");
                }}
            >
                <span className="tab-ic">
                    <VendorMark id="overview" size={22} color="var(--blue)" />
                </span>
                <span className="tab-lbl">总览</span>
            </button>
            <div className="tabs" ref={scrollRef}>
                {tabs.map((provider) => {
                    const isDragging = draggingProvider === provider;
                    const isOver = overProvider === provider && !isDragging;
                    return (
                        <button
                            key={provider}
                            className={
                                "tab" +
                                (activeTab === provider ? " active" : "") +
                                (isDragging ? " dragging" : "") +
                                (isOver ? " drag-over" : "")
                            }
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
                                className="tab-ic"
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
                            <span className="tab-lbl">{PROVIDER_LABELS[provider]}</span>
                        </button>
                    );
                })}
            </div>
            <div className="tabs-fade right" />
        </>
    );
}
