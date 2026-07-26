import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { makeGroup, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - basic", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("shows relative update time instead of status label", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        // Should show relative time like "刚刚" or "X 分钟前", not "正常"/"预警"
        expect(screen.queryByText("正常")).not.toBeInTheDocument();
        expect(screen.queryByText("预警")).not.toBeInTheDocument();
        // rel-time element should exist
        expect(document.querySelector(".rel-time")).toBeInTheDocument();
    });

    it("shows stale badge without source badge or 观测 prefix", () => {
        const group = makeGroup({
            observedAt: 1748857740000,
            source: "poll",
            stale: true,
        });
        render(<ProviderCard provider="deepseek" group={group} />);

        expect(screen.queryByText("API_KEY")).not.toBeInTheDocument();
        expect(screen.queryByText(/观测/)).not.toBeInTheDocument();
        expect(document.querySelector(".source-badge")).not.toBeInTheDocument();
        expect(document.querySelector(".stale-badge")).toBeInTheDocument();
        expect(document.querySelector(".card.stale")).not.toBeInTheDocument();
    });

    it("does not render disabled card state", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        expect(screen.queryByText("已关闭")).not.toBeInTheDocument();
        expect(screen.queryByText("监控已关闭，不再刷新用量")).not.toBeInTheDocument();
    });

    it("shows enable-disable menu items without edit", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        // More menu removed from main panel — button should not appear
        expect(screen.queryByLabelText("更多操作")).not.toBeInTheDocument();
    });

    it("does not render detail button", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        expect(screen.queryByLabelText(/详情/)).not.toBeInTheDocument();
    });
});
