import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProviderOverview } from "../../../../src/renderer/components/ProviderOverview";
import type {
    ProviderUsageGroup,
    ProviderUsagePeriod,
} from "../../../../src/renderer/lib/provider-usage";

function period(overrides: Partial<ProviderUsagePeriod> = {}): ProviderUsagePeriod {
    return {
        id: "opencode-rolling",
        provider: "opencode_go",
        source: "session",
        sourceInstanceId: "workspace-1",
        connectorInstanceId: "opencode-go-1",
        connectorDisplayName: "OpenCode Go",
        accountId: "workspace-1",
        accountLabel: "OpenCode",
        raw_label: "rolling",
        name: "滚动",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        resetAt: null,
        status: "normal",
        updatedAt: "2026-01-01T12:00:00Z",
        observedAt: 1735689600000,
        stale: false,
        ...overrides,
    };
}

function group(): ProviderUsageGroup {
    const rolling = period();
    return {
        provider: "opencode_go",
        label: "OpenCode Go",
        accountCount: 1,
        status: "normal",
        updatedAt: "2026-01-01T12:00:00Z",
        observedAt: 1735689600000,
        source: "session",
        stale: false,
        periods: [rolling],
        accounts: [
            {
                id: "workspace-1",
                sourceInstanceId: "workspace-1",
                accountId: "workspace-1",
                accountLabel: "OpenCode",
                status: "normal",
                updatedAt: "2026-01-01T12:00:00Z",
                observedAt: 1735689600000,
                stale: false,
                periods: [rolling],
            },
        ],
    };
}

describe("ProviderOverview", () => {
    it("uses account label maps keyed by connector instance id", () => {
        render(
            <ProviderOverview
                groups={[group()]}
                visibleProviders={["opencode_go"]}
                providerErrors={new Map()}
                onRefreshProvider={vi.fn()}
                accountLabelMaps={{ "opencode-go-1": { rolling: "五小时" } }}
            />,
        );

        expect(screen.getByText("五小时")).toBeInTheDocument();
        expect(screen.queryByText("滚动")).not.toBeInTheDocument();
    });
});
