import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { makeGroup, makePeriod, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - label map", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("applies account label maps to multi-account overview", () => {
        const rolling_a = makePeriod({
            id: "opencode-a-rolling",
            provider: "opencode_go",
            raw_label: "rolling",
            name: "滚动",
            used: 10,
            limit: 100,
            connectorInstanceId: "opencode-go-1",
            accountId: "workspace-a",
            accountLabel: "Workspace A",
        });
        const rolling_b = makePeriod({
            id: "opencode-b-rolling",
            provider: "opencode_go",
            raw_label: "rolling",
            name: "滚动",
            used: 20,
            limit: 100,
            connectorInstanceId: "opencode-go-2",
            accountId: "workspace-b",
            accountLabel: "Workspace B",
        });
        const group = makeGroup({
            provider: "opencode_go",
            label: "OpenCode Go",
            accountCount: 2,
            periods: [rolling_a, rolling_b],
            accounts: [
                {
                    id: "workspace-a",
                    sourceInstanceId: "workspace-a",
                    accountId: "workspace-a",
                    accountLabel: "Workspace A",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [rolling_a],
                },
                {
                    id: "workspace-b",
                    sourceInstanceId: "workspace-b",
                    accountId: "workspace-b",
                    accountLabel: "Workspace B",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [rolling_b],
                },
            ],
        });

        render(
            <ProviderCard
                provider="opencode_go"
                group={group}
                expanded
                l2Open
                onToggleExpand={vi.fn()}
                labelMap={{ rolling: "滚动" }}
                accountLabelMaps={{
                    "opencode-go-1": { rolling: "五小时" },
                    "opencode-go-2": { rolling: "本周" },
                }}
            />,
        );

        expect(screen.getByText("五小时")).toBeInTheDocument();
        expect(screen.getByText("本周")).toBeInTheDocument();
        expect(screen.queryByText("滚动")).not.toBeInTheDocument();
    });

    it("uses vendor label map for every account before account-specific maps", () => {
        const rolling_a = makePeriod({
            id: "opencode-a-rolling",
            provider: "opencode_go",
            raw_label: "rolling",
            name: "滚动",
            used: 10,
            limit: 100,
            connectorInstanceId: "opencode-go-1",
            accountId: "workspace-a",
            accountLabel: "Workspace A",
        });
        const rolling_b = makePeriod({
            id: "opencode-b-rolling",
            provider: "opencode_go",
            raw_label: "rolling",
            name: "滚动",
            used: 20,
            limit: 100,
            connectorInstanceId: "opencode-go-2",
            accountId: "workspace-b",
            accountLabel: "Workspace B",
        });
        const group = makeGroup({
            provider: "opencode_go",
            label: "OpenCode Go",
            accountCount: 2,
            periods: [rolling_a, rolling_b],
            accounts: [
                {
                    id: "workspace-a",
                    sourceInstanceId: "workspace-a",
                    accountId: "workspace-a",
                    accountLabel: "Workspace A",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [rolling_a],
                },
                {
                    id: "workspace-b",
                    sourceInstanceId: "workspace-b",
                    accountId: "workspace-b",
                    accountLabel: "Workspace B",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [rolling_b],
                },
            ],
        });

        render(
            <ProviderCard
                provider="opencode_go"
                group={group}
                expanded
                l2Open
                onToggleExpand={vi.fn()}
                labelMap={{ rolling: "滚动" }}
                accountLabelMaps={{
                    "opencode-go-1": { rolling: "账号 A" },
                    "opencode-go-2": { rolling: "账号 B" },
                }}
                providerLabelMaps={{ opencode_go: { rolling: "5 小时" } }}
            />,
        );

        fireEvent.click(screen.getByTitle("账号明细"));

        expect(screen.getAllByText("5 小时")).toHaveLength(2);
        expect(screen.queryByText("账号 A")).not.toBeInTheDocument();
        expect(screen.queryByText("账号 B")).not.toBeInTheDocument();
    });
});
