// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useRef, useState } from "react";
import type { UsageProvider } from "../../../../src/shared/schemas/plugin-output";
import { use_tab_navigation } from "../../../../src/renderer/hooks/use_tab_navigation";

interface HarnessProps {
    ordered: UsageProvider[];
    initial: UsageProvider | "overview";
}

function Harness({ ordered, initial }: HarnessProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [tab, setTab] = useState<UsageProvider | "overview">(initial);
    use_tab_navigation({
        tabsRef: ref,
        activeTab: tab,
        orderedProviders: ordered,
        setActiveTab: setTab,
    });
    return (
        <div ref={ref} data-testid="tabs">
            <div data-tab="overview" data-active={tab === "overview"} />
            {ordered.map((p) => (
                <div key={p} data-tab={p} data-active={tab === p} />
            ))}
        </div>
    );
}

afterEach(() => {
    vi.useRealTimers();
});

describe("use_tab_navigation", () => {
    it("wheel down steps active tab forward", () => {
        vi.useFakeTimers();
        const { container } = render(<Harness ordered={["claude", "codex"]} initial="overview" />);
        const tabs = container.querySelector('[data-testid="tabs"]');
        if (!tabs) throw new Error("tabs element missing");
        // overview(0) → claude(1)
        act(() => {
            fireEvent.wheel(tabs, { deltaY: 100 });
        });
        expect(container.querySelector('[data-tab="claude"]')?.getAttribute("data-active")).toBe(
            "true",
        );
    });

    it("wheel up wraps from first to last", () => {
        vi.useFakeTimers();
        const { container } = render(<Harness ordered={["claude", "codex"]} initial="overview" />);
        const tabs = container.querySelector('[data-testid="tabs"]');
        if (!tabs) throw new Error("tabs element missing");
        // overview(0), dir -1 → ((-1 % 3) + 3) % 3 = 2 → codex
        act(() => {
            fireEvent.wheel(tabs, { deltaY: -100 });
        });
        expect(container.querySelector('[data-tab="codex"]')?.getAttribute("data-active")).toBe(
            "true",
        );
    });

    it("throttles repeated wheel within 200ms", () => {
        vi.useFakeTimers();
        const { container } = render(<Harness ordered={["claude", "codex"]} initial="overview" />);
        const tabs = container.querySelector('[data-testid="tabs"]');
        if (!tabs) throw new Error("tabs element missing");
        act(() => {
            fireEvent.wheel(tabs, { deltaY: 100 });
        });
        // overview → claude
        expect(container.querySelector('[data-tab="claude"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        // 2nd wheel 100ms later (< 200ms) → ignored, still claude (not codex)
        act(() => {
            vi.advanceTimersByTime(100);
            fireEvent.wheel(tabs, { deltaY: 100 });
        });
        expect(container.querySelector('[data-tab="claude"]')?.getAttribute("data-active")).toBe(
            "true",
        );
        expect(container.querySelector('[data-tab="codex"]')?.getAttribute("data-active")).toBe(
            "false",
        );
    });

    it("horizontal deltaX drives navigation when |deltaX| > |deltaY|", () => {
        vi.useFakeTimers();
        const { container } = render(<Harness ordered={["claude", "codex"]} initial="overview" />);
        const tabs = container.querySelector('[data-testid="tabs"]');
        if (!tabs) throw new Error("tabs element missing");
        act(() => {
            fireEvent.wheel(tabs, { deltaX: 120, deltaY: 0 });
        });
        expect(container.querySelector('[data-tab="claude"]')?.getAttribute("data-active")).toBe(
            "true",
        );
    });
});
