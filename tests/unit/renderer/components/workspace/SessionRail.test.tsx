import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionRail } from "../../../../../src/renderer/components/workspace/SessionRail";
import {
    empty_slots,
    session_meta,
    try_assign_slot,
    type SlotsState,
} from "../../../../../src/renderer/lib/workspace/slots";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";

function sess(id: string, source: string): TokenStatsSession {
    return {
        id,
        source: source as TokenStatsSession["source"],
        env: "win",
        model: "model",
        title: `会话 ${id}`,
        directory: null,
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: 3,
        started_at: 1000,
        ended_at: 2000,
    };
}

function slots_with_sources(sources: readonly string[]): SlotsState {
    let slots = empty_slots();
    sources.forEach((source, index) => {
        slots = try_assign_slot(
            slots,
            index,
            session_meta(sess(`sess_${String(index)}`, source), 1),
        ).next;
    });
    return slots;
}

describe("SessionRail provider 徽标", () => {
    it("四个已知 source 与未知 source 都使用 VendorMark", () => {
        render(
            <SessionRail
                slots={slots_with_sources([
                    "claude_code",
                    "kimi_code",
                    "grok",
                    "opencode",
                    "unknown",
                ])}
                collapsed={false}
                on_toggle_collapse={() => undefined}
                on_pick={() => undefined}
                on_close={() => undefined}
                on_move={() => undefined}
            />,
        );

        const badges = Array.from(document.querySelectorAll(".rail-badge"));
        expect(badges).toHaveLength(5);
        const expected = [
            { light: "claude" },
            { light: "kimi" },
            { light: "grok_light", dark: "grok_dark" },
            { light: "opencode_go_light", dark: "opencode_go_dark" },
            { fallback: true },
        ] as const;
        badges.forEach((badge, index) => {
            expect(badge.querySelector(".vicon")).toBeTruthy();
            const expected_logo = expected[index];
            if (!expected_logo || "fallback" in expected_logo) {
                expect(badge.querySelector("svg")).toBeTruthy();
                return;
            }
            const sources = Array.from(badge.querySelectorAll("img")).map(
                (img) => img.getAttribute("src") ?? "",
            );
            expect(sources.some((src) => src.includes(expected_logo.light))).toBe(true);
            if ("dark" in expected_logo) {
                expect(sources.some((src) => src.includes(expected_logo.dark))).toBe(true);
            }
        });
    });
});
