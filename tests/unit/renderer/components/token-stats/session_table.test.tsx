import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionTable } from "../../../../../src/renderer/components/token-stats/SessionTable";
import type { SessionRow } from "../../../../../src/renderer/lib/token-stats/types";

function row(overrides: Partial<SessionRow>): SessionRow {
    return {
        session_id: "s1",
        title: "session",
        slug: null,
        directory: "D:/p",
        agent: "claude-code",
        version: null,
        sub: false,
        models: ["m"],
        calls: 1,
        tokens: 2,
        cacheRate: 0,
        lastTs: Date.now() - 1000,
        ...overrides,
    };
}

describe("SessionTable agent chip", () => {
    it("labels claude-code / opencode / kimi-code / grok rows with the right tool name", () => {
        render(
            <SessionTable
                rows={[
                    row({ session_id: "s1", agent: "claude-code" }),
                    row({ session_id: "s2", agent: "opencode" }),
                    row({ session_id: "s3", agent: "kimi-code" }),
                    row({ session_id: "s4", agent: "grok" }),
                ]}
                theme="dark"
                modelColors={new Map([["m", "#fff"]])}
            />,
        );

        expect(screen.getByText("Claude Code")).toBeInTheDocument();
        expect(screen.getByText("OpenCode")).toBeInTheDocument();
        expect(screen.getByText("Kimi Code")).toBeInTheDocument();
        expect(screen.getByText("Grok")).toBeInTheDocument();
    });
});

describe("SessionTable session-history open", () => {
    function rows(): SessionRow[] {
        return [
            row({ session_id: "s1", identity_key: "claude_code|win|s1", title: "Alpha" }),
            row({ session_id: "s2", identity_key: "opencode|win|s2", title: "Beta" }),
        ];
    }

    it("renders a per-row checkbox and an open-history button disabled until ≥1 checked", () => {
        const on_open_selected = vi.fn();
        render(
            <SessionTable
                rows={rows()}
                theme="dark"
                modelColors={new Map()}
                onOpenSelected={on_open_selected}
            />,
        );

        expect(screen.getAllByRole("checkbox")).toHaveLength(2);
        const btn = screen.getByRole("button", { name: /打开历史/ });
        expect(btn).toBeDisabled();

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);
        expect(btn).toBeEnabled();
    });

    it("batch-opens checked sessions via onOpenSelected in row order", () => {
        const on_open_selected = vi.fn();
        render(
            <SessionTable
                rows={rows()}
                theme="dark"
                modelColors={new Map()}
                onOpenSelected={on_open_selected}
            />,
        );

        const boxes = screen.getAllByRole("checkbox");
        fireEvent.click(boxes[0] as HTMLInputElement);
        fireEvent.click(boxes[1] as HTMLInputElement);
        fireEvent.click(screen.getByRole("button", { name: /打开历史/ }));

        expect(on_open_selected).toHaveBeenCalledWith(["claude_code|win|s1", "opencode|win|s2"]);
    });

    it("opens a single session on row click without toggling its checkbox", () => {
        const on_open_session = vi.fn();
        render(
            <SessionTable
                rows={rows()}
                theme="dark"
                modelColors={new Map()}
                onOpenSession={on_open_session}
            />,
        );

        fireEvent.click(screen.getByText("Alpha"));

        expect(on_open_session).toHaveBeenCalledWith("claude_code|win|s1");
        expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(false);
    });

    it("clicking the checkbox does not open the session", () => {
        const on_open_session = vi.fn();
        render(
            <SessionTable
                rows={rows()}
                theme="dark"
                modelColors={new Map()}
                onOpenSession={on_open_session}
            />,
        );

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);

        expect(on_open_session).not.toHaveBeenCalled();
    });

    it("clears checked state when paging to another page", () => {
        const on_open_selected = vi.fn();
        const many = Array.from({ length: 20 }, (_, i) =>
            row({ session_id: `s${String(i)}`, identity_key: `claude_code|win|s${String(i)}` }),
        );
        render(
            <SessionTable
                rows={many}
                theme="dark"
                modelColors={new Map()}
                totalRows={20}
                onOpenSelected={on_open_selected}
            />,
        );

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);
        expect(screen.getByRole("button", { name: /打开历史/ })).toBeEnabled();

        fireEvent.click(screen.getByRole("button", { name: /下一页/ }));
        expect(screen.getByRole("button", { name: /打开历史/ })).toBeDisabled();
    });

    it("clears checked state when sorting resets the page", () => {
        const on_open_selected = vi.fn();
        const many = Array.from({ length: 20 }, (_, i) =>
            row({ session_id: `s${String(i)}`, identity_key: `claude_code|win|s${String(i)}` }),
        );
        render(
            <SessionTable
                rows={many}
                theme="dark"
                modelColors={new Map()}
                totalRows={20}
                onOpenSelected={on_open_selected}
            />,
        );

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);
        expect(screen.getByRole("button", { name: /打开历史/ })).toBeEnabled();

        fireEvent.click(screen.getByRole("columnheader", { name: /最近活跃/ }));
        expect(screen.getByRole("button", { name: /打开历史/ })).toBeDisabled();
    });
});
