import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AliasEditor } from "../../../../src/renderer/components/AliasEditor";

describe("AliasEditor", () => {
    it("renders the section label and existing entries", () => {
        render(
            <AliasEditor
                label="目录别名"
                itemLabel="目录"
                entries={[{ alias: "proj-x", values: ["/a", "/b"] }]}
                onChange={() => undefined}
            />,
        );
        expect(screen.getByText("目录别名")).toBeInTheDocument();
        expect(screen.getByDisplayValue("proj-x")).toBeInTheDocument();
        expect(screen.getByDisplayValue("/a, /b")).toBeInTheDocument();
    });

    it("adds an entry and notifies change", async () => {
        const onChange = vi.fn();
        render(<AliasEditor label="目录别名" itemLabel="目录" entries={[]} onChange={onChange} />);
        await userEvent.click(screen.getByRole("button", { name: "添加" }));
        expect(onChange).toHaveBeenCalledWith([{ alias: "", values: [] }]);
    });

    it("edits alias and values and notifies", async () => {
        const onChange = vi.fn();
        function Wrapper() {
            const [entries, setEntries] = useState([{ alias: "old", values: ["/a"] }]);
            return (
                <AliasEditor
                    label="目录别名"
                    itemLabel="目录"
                    entries={entries}
                    onChange={(n) => {
                        setEntries(n);
                        onChange(n);
                    }}
                />
            );
        }
        render(<Wrapper />);
        const input = screen.getByDisplayValue("old");
        await userEvent.clear(input);
        await userEvent.type(input, "new-name");
        expect(onChange).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ alias: "new-name" })]),
        );
    });

    it("deletes an entry", async () => {
        const onChange = vi.fn();
        render(
            <AliasEditor
                label="目录别名"
                itemLabel="目录"
                entries={[
                    { alias: "x", values: ["/a"] },
                    { alias: "y", values: ["/b"] },
                ]}
                onChange={onChange}
            />,
        );
        const dels = screen.getAllByRole("button", { name: "删除" });
        const first = dels[0];
        if (!first) throw new Error("expected delete button");
        await userEvent.click(first);
        expect(onChange).toHaveBeenCalledWith([{ alias: "y", values: ["/b"] }]);
    });
});
