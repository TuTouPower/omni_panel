import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

    it("renders time range buttons for today, week, month", () => {
        render(<TokenPanel has_real_data={false} />);
        expect(screen.getByText("今天")).toBeInTheDocument();
        expect(screen.getByText("最近一周")).toBeInTheDocument();
        expect(screen.getByText("最近一月")).toBeInTheDocument();
    });

    it("switches range on button click", () => {
        render(<TokenPanel has_real_data={false} />);
        const week_btn = screen.getByText("最近一周");
        fireEvent.click(week_btn);
        // The "on" class indicates the active button
        expect(week_btn.className).toContain("on");
    });
});
