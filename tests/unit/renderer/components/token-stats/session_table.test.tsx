import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    it("labels claude-code / opencode / kimi-code rows with the right tool name", () => {
        render(
            <SessionTable
                rows={[
                    row({ session_id: "s1", agent: "claude-code" }),
                    row({ session_id: "s2", agent: "opencode" }),
                    row({ session_id: "s3", agent: "kimi-code" }),
                ]}
                theme="dark"
                modelColors={new Map([["m", "#fff"]])}
            />,
        );

        expect(screen.getByText("Claude Code")).toBeInTheDocument();
        expect(screen.getByText("OpenCode")).toBeInTheDocument();
        expect(screen.getByText("Kimi Code")).toBeInTheDocument();
    });
});
