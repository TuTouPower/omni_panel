import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { makeGroup, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - menu", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("does not show edit in provider menu (main panel edit removed)", () => {
        const group = makeGroup();
        render(<ProviderCard provider="deepseek" group={group} />);
        // More menu removed from main panel — button should not appear
        expect(screen.queryByLabelText("更多操作")).not.toBeInTheDocument();
    });

    it("hides provider menu when no disable handler", () => {
        const group = makeGroup();
        render(<ProviderCard provider="deepseek" group={group} />);
        expect(screen.queryByLabelText("更多操作")).not.toBeInTheDocument();
    });
});
