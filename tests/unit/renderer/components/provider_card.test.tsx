import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import type { ProviderUsageGroup } from "../../../../src/renderer/lib/provider-usage";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

function makeGroup(overrides: Partial<ProviderUsageGroup> = {}): ProviderUsageGroup {
    return {
        provider: "deepseek",
        label: "DeepSeek",
        accountCount: 1,
        status: "normal",
        updatedAt: "2026-06-02T10:00:00Z",
        windows: [
            {
                id: "w1",
                provider: "deepseek",
                source: "api_key",
                sourceInstanceId: "ds-1",
                connectorInstanceId: "ds-1",
                connectorDisplayName: "DeepSeek",
                accountId: "acc1",
                accountLabel: "Account 1",
                name: "Tokens",
                used: 5000,
                limit: 10000,
                displayStyle: "ratio",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
            },
        ],
        accounts: [
            {
                id: "acc1",
                sourceInstanceId: "ds-1",
                accountId: "acc1",
                accountLabel: "Account 1",
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
                windows: [
                    {
                        id: "w1",
                        provider: "deepseek",
                        source: "api_key",
                        sourceInstanceId: "ds-1",
                        connectorInstanceId: "ds-1",
                        connectorDisplayName: "DeepSeek",
                        accountId: "acc1",
                        accountLabel: "Account 1",
                        name: "Tokens",
                        used: 5000,
                        limit: 10000,
                        displayStyle: "ratio",
                        resetAt: null,
                        status: "normal",
                        updatedAt: "2026-06-02T10:00:00Z",
                    },
                ],
            },
        ],
        ...overrides,
    };
}

describe("ProviderCard", () => {
    beforeEach(() => {
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: vi.fn(),
                getState: vi.fn(),
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            config: {
                get: vi.fn().mockResolvedValue({ config: {}, hasSecrets: {} }),
                save: vi.fn().mockResolvedValue(undefined),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
            },
            popup: { report_content_height: vi.fn() },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("shows relative update time instead of status label", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        // Should show relative time like "刚刚" or "X 分钟前", not "正常"/"预警"
        expect(screen.queryByText("正常")).not.toBeInTheDocument();
        expect(screen.queryByText("预警")).not.toBeInTheDocument();
        // rel-time element should exist
        expect(document.querySelector(".rel-time")).toBeInTheDocument();
    });

    it("shows off-badge when disabled", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} disabled />);
        expect(screen.getByText("已关闭")).toBeInTheDocument();
        expect(screen.getByText("监控已关闭，不再刷新用量")).toBeInTheDocument();
    });

    it("shows enable action when disabled", () => {
        const onToggle = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup()}
                disabled
                onToggleDisable={onToggle}
            />,
        );
        fireEvent.click(screen.getByText("启用"));
        expect(onToggle).toHaveBeenCalledWith("deepseek");
    });

    it("shows edit/enable-disable/delete menu items", () => {
        const onToggle = vi.fn();
        const onDelete = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                group={makeGroup()}
                onToggleDisable={onToggle}
                onDelete={onDelete}
            />,
        );
        fireEvent.click(screen.getByLabelText("更多操作"));
        expect(screen.getByText("编辑")).toBeInTheDocument();
        expect(screen.getByText("关闭")).toBeInTheDocument();
        expect(screen.getByText("删除")).toBeInTheDocument();
    });

    it("does not render detail button", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        expect(screen.queryByLabelText(/详情/)).not.toBeInTheDocument();
    });

    it("shows count badge for multi-account providers", () => {
        const group = makeGroup({ accountCount: 3 });
        render(<ProviderCard provider="deepseek" group={group} expanded={false} />);
        expect(screen.getByText("3账号")).toBeInTheDocument();
    });

    it("shows L2 segmented control for multi-account when expanded", () => {
        const group = makeGroup({ accountCount: 3 });
        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );
        expect(screen.getByText("平均")).toBeInTheDocument();
        expect(screen.getByText("3账号")).toBeInTheDocument();
    });

    it("shows auth error with login action", () => {
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "unauthorized access" }}
            />,
        );
        expect(screen.getByText("凭证失效，请重新登录")).toBeInTheDocument();
        expect(screen.getByText("重新登录")).toBeInTheDocument();
    });

    it("shows network error with retry action", () => {
        const onRefresh = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "网络超时" }}
                onRefresh={onRefresh}
            />,
        );
        expect(screen.getByText("网络超时")).toBeInTheDocument();
        fireEvent.click(screen.getByText("重试"));
        expect(onRefresh).toHaveBeenCalledWith("deepseek");
    });

    it("applies dragging and drag-over CSS classes", () => {
        const { container } = render(
            <ProviderCard provider="deepseek" group={makeGroup()} dragging />,
        );
        expect(container.querySelector(".card.dragging")).toBeInTheDocument();
    });

    it("renders grip handle when onDragStart is provided", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} onDragStart={vi.fn()} />);
        expect(screen.getByTitle("拖动以调整顺序")).toBeInTheDocument();
    });
});
