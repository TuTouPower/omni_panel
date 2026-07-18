import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Segmented } from "../../../../../src/renderer/components/token-stats/Segmented";

describe("Segmented", () => {
    it("renders options and marks the selected value", () => {
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];
        render(<Segmented options={options} value="a" onChange={() => undefined} />);
        expect(screen.getByText("A")).toHaveClass("on");
        expect(screen.getByText("B")).not.toHaveClass("on");
    });

    it("calls onChange when a different option is clicked", () => {
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];
        const onChange = vi.fn();
        render(<Segmented options={options} value="a" onChange={onChange} />);
        fireEvent.click(screen.getByText("B"));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("does not call onChange for disabled options", () => {
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B", disabled: true },
        ];
        const onChange = vi.fn();
        render(<Segmented options={options} value="a" onChange={onChange} />);
        fireEvent.click(screen.getByText("B"));
        expect(onChange).not.toHaveBeenCalled();
    });
});
