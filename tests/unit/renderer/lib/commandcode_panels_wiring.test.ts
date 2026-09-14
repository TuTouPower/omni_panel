import { describe, expect, it } from "vitest";
import { agent_abbrev } from "../../../../src/renderer/components/session-library/session-library-utils";
import { agent_friendly, agent_slug } from "../../../../src/renderer/lib/session-history/markdown";
import { resume_command } from "../../../../src/renderer/lib/session-resume";
import { agent_accent, vendor_id_for_source } from "../../../../src/renderer/lib/workspace/slots";
import {
    agentSessionUsageSchema,
    tokenStatsDashboardAgentSchema,
    tokenStatsSourceSchema,
} from "../../../../src/shared/types/token-stats";

describe("Command Code panels wiring (t484)", () => {
    it("maps the independent display, slug, abbreviation, logo and accent", () => {
        expect(agent_friendly("commandcode")).toBe("Command Code");
        expect(agent_slug("commandcode")).toBe("commandcode");
        expect(agent_abbrev("commandcode")).toBe("CC");
        expect(vendor_id_for_source("commandcode")).toBe("commandcode");
        expect(agent_accent("commandcode")).toBe("var(--color-agent-commandcode)");
    });

    it("accepts Command Code in source and dashboard/record agent contracts", () => {
        expect(tokenStatsSourceSchema.safeParse("commandcode").success).toBe(true);
        expect(agentSessionUsageSchema.shape.agent.safeParse("commandcode").success).toBe(true);
        expect(tokenStatsDashboardAgentSchema.safeParse("commandcode").success).toBe(true);
    });

    it("uses the fixed resume template", () => {
        expect(resume_command("commandcode", "sid-1")).toBe("cmd --resume sid-1");
        expect(resume_command("commandcode", "sid-1", { commandcode: "rm -rf {session_id}" })).toBe(
            "cmd --resume sid-1",
        );
    });
});
