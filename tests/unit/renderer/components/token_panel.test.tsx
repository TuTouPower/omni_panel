import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenPanel } from "../../../../src/renderer/components/TokenPanel";

describe("TokenPanel", () => {
    it("renders Total Tokens title", () => {
        render(<TokenPanel has_real_data={false} />);
        expect(screen.getByText("Total Tokens")).toBeInTheDocument();
    });

    it("shows no-data message when has_real_data is false", () => {
        render(<TokenPanel has_real_data={false} />);
        expect(screen.getByText("暂无历史数据")).toBeInTheDocument();
    });

    it("shows token value when has_real_data is true", () => {
        render(<TokenPanel has_real_data={true} total_tokens={12345} />);
        expect(screen.getByText("12,345")).toBeInTheDocument();
    });
});
