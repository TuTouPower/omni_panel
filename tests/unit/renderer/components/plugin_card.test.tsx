import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PluginCard } from "../../../../src/renderer/components/PluginCard";
import type { PluginInfo } from "../../../../src/shared/types/ipc";

function makePlugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
    return {
        instanceId: "test-plugin",
        stateId: "test-plugin",
        name: "TestPlugin",
        displayName: "Test Plugin",
        enabled: true,
        metadata: null,
        snapshot: { status: "idle" },
        ...overrides,
    };
}

describe("PluginCard", () => {
    // --- default rendering ---

    it("renders plugin display name", () => {
        render(<PluginCard plugin={makePlugin()} />);
        expect(screen.getByText("Test Plugin")).toBeInTheDocument();
    });

    // --- idle state ---

    it("shows skeleton bars in idle state", () => {
        const { container } = render(
            <PluginCard plugin={makePlugin({ snapshot: { status: "idle" } })} />,
        );
        expect(container.querySelector(".skeleton-bars")).toBeInTheDocument();
    });

    // --- loading state ---

    it("shows skeleton bars in loading state", () => {
        const { container } = render(
            <PluginCard plugin={makePlugin({ snapshot: { status: "loading" } })} />,
        );
        expect(container.querySelector(".skeleton-bars")).toBeInTheDocument();
    });

    // --- ready state ---

    it("renders usage bars in ready state", () => {
        render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "tokens",
                                name: "Tokens",
                                used: 3000,
                                limit: 10000,
                                displayStyle: "ratio",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        expect(screen.getAllByText("Tokens").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("3000 / 10000 (30%)")).toBeInTheDocument();
    });

    // --- failed state ---

    it("shows error message and retry text in failed state", () => {
        render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: { status: "failed", error: "网络错误" },
                })}
            />,
        );
        expect(screen.getByText("网络错误")).toBeInTheDocument();
        expect(screen.getByText("重试")).toBeInTheDocument();
    });

    it("applies alert class when in failed state", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: { status: "failed", error: "err" },
                })}
            />,
        );
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("alert");
    });

    // --- danger threshold >=85% ---

    it("applies danger class when usage >= 85%", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "tokens",
                                name: "Tokens",
                                used: 8500,
                                limit: 10000,
                                displayStyle: "ratio",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        const bar = container.querySelector(".ub-bar");
        expect(bar?.getAttribute("data-tone")).toBe("danger");
    });

    it("does NOT apply danger class when usage < 85%", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "tokens",
                                name: "Tokens",
                                used: 50,
                                limit: 100,
                                displayStyle: "ratio",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        const bar = container.querySelector(".ub-bar");
        expect(bar?.getAttribute("data-tone")).toBeNull();
    });

    it("applies warn tone when usage is 65-84%", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "tokens",
                                name: "Tokens",
                                used: 70,
                                limit: 100,
                                displayStyle: "ratio",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        const bar = container.querySelector(".ub-bar");
        expect(bar?.getAttribute("data-tone")).toBe("warn");
    });

    it("applies danger at exactly 85%", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "u",
                                name: "U",
                                used: 17,
                                limit: 20,
                                displayStyle: "percent",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        const bar = container.querySelector(".ub-bar");
        expect(bar?.getAttribute("data-tone")).toBe("danger");
    });

    // --- disabled state ---

    it("shows disabled badge and off message when plugin disabled", () => {
        render(<PluginCard plugin={makePlugin({ enabled: false })} />);
        expect(screen.getByText("已关闭")).toBeInTheDocument();
        expect(screen.getByText("监控已关闭，不再刷新用量")).toBeInTheDocument();
    });

    it("applies disabled class on card when plugin disabled", () => {
        const { container } = render(<PluginCard plugin={makePlugin({ enabled: false })} />);
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("disabled");
    });

    // --- collapsed state ---

    it("hides content when collapsed", () => {
        const { container } = render(
            <PluginCard
                plugin={makePlugin({ snapshot: { status: "loading" } })}
                collapsed={true}
            />,
        );
        // skeleton-bars should not be in DOM when collapsed
        expect(container.querySelector(".skeleton-bars")).not.toBeInTheDocument();
    });

    // --- menu toggle ---

    it("toggles context menu on more button click", async () => {
        const user = userEvent.setup();
        const { container } = render(<PluginCard plugin={makePlugin()} />);
        // menu is initially closed
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
        // click the more button (title="更多")
        const moreBtn = container.querySelector('[title="更多"]');
        expect(moreBtn).not.toBeNull();
        if (!moreBtn) return;
        await user.click(moreBtn);
        expect(screen.getByText("编辑")).toBeInTheDocument();
        expect(screen.getByText("删除")).toBeInTheDocument();
    });

    // --- percent display style ---

    it("shows percent format when displayStyle is percent", () => {
        render(
            <PluginCard
                plugin={makePlugin({
                    snapshot: {
                        status: "ready",
                        items: [
                            {
                                id: "p",
                                name: "Percent",
                                used: 50,
                                limit: 100,
                                displayStyle: "percent",
                                status: "normal",
                            },
                        ],
                        updatedAt: "2026-05-30T00:00:00Z",
                    },
                })}
            />,
        );
        expect(screen.getByText("50%")).toBeInTheDocument();
    });

    // --- onToggleCollapse callback ---

    it("calls onToggleCollapse when collapse button clicked", async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        const { container } = render(
            <PluginCard plugin={makePlugin()} onToggleCollapse={onToggle} />,
        );
        const collapseBtn = container.querySelector(".card-collapse");
        expect(collapseBtn).not.toBeNull();
        if (!collapseBtn) return;
        await user.click(collapseBtn);
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
