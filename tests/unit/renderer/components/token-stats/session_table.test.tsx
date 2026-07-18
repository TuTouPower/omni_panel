import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentSessionUsage } from "../../../../../src/shared/types/token-stats";
import { SessionTable } from "../../../../../src/renderer/components/token-stats/SessionTable";

function rec(overrides: Partial<AgentSessionUsage>): AgentSessionUsage {
    return {
        session_id: "s1",
        title: "session",
        directory: "D:/p",
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: "m1",
        role: "assistant",
        timestamp: Date.now() - 1000,
        model: "m",
        input_tokens: 1,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        agent: "claude-code",
        ...overrides,
    };
}

describe("SessionTable agent chip", () => {
    it("labels claude-code / opencode / kimi-code records with the right tool name", () => {
        render(
            <SessionTable
                records={[
                    rec({ session_id: "s1", agent: "claude-code", message_id: "m1" }),
                    rec({ session_id: "s2", agent: "opencode", message_id: "m2" }),
                    rec({ session_id: "s3", agent: "kimi-code", message_id: "m3" }),
                ]}
                metric="tokens"
                theme="dark"
            />,
        );

        expect(screen.getByText("Claude Code")).toBeInTheDocument();
        expect(screen.getByText("OpenCode")).toBeInTheDocument();
        expect(screen.getByText("Kimi Code")).toBeInTheDocument();
    });
});
