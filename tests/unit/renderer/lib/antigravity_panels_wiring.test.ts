import { describe, expect, it } from "vitest";
import { vendor_id_for_source } from "../../../../src/renderer/lib/workspace/slots";
import { agent_friendly, agent_slug } from "../../../../src/renderer/lib/session-history/markdown";
import { resume_command } from "../../../../src/renderer/lib/session-resume";
import type { AgentFilter } from "../../../../src/renderer/lib/token-stats/types";
import {
    agentSessionUsageSchema,
    tokenStatsDashboardAgentSchema,
    tokenStatsSourceSchema,
} from "../../../../src/shared/types/token-stats";

/**
 * t456 会话面板 antigravity 接线（只做会话面板；代理面板过滤选项不得出现 antigravity）。
 * AC-003 为类型级守卫：若 AgentFilter 新增 "antigravity"，下行断言在 tsc 失败。
 */
type NoAntigravityInAgentFilter =
    Exclude<
        AgentFilter,
        "all" | "claude-code" | "opencode" | "kimi-code" | "grok" | "codex"
    > extends never
        ? true
        : false;
const NO_ANTIGRAVITY_IN_AGENT_FILTER: NoAntigravityInAgentFilter = true;
describe("antigravity panels wiring (t456)", () => {
    it("AC-001: 会话展示名与 vendor logo 同源", () => {
        expect(agent_friendly("antigravity")).toBe("Antigravity");
        expect(agent_slug("antigravity")).toBe("antigravity");
        expect(vendor_id_for_source("antigravity")).toBe("antigravity");
    });

    it("AC-002: 续接命令模板为 agy --conversation", () => {
        expect(resume_command("antigravity", "sid-1")).toBe("agy --conversation sid-1");
    });

    it("AC-003: 代理面板过滤选项不出现 antigravity", () => {
        expect(NO_ANTIGRAVITY_IN_AGENT_FILTER).toBe(true);
    });

    it("t470 AC-001: 会话 source 契约接纳 antigravity", () => {
        expect(tokenStatsSourceSchema.safeParse("antigravity").success).toBe(true);
    });

    it("t470 AC-004: records/dashboard agent 契约拒绝 antigravity", () => {
        expect(agentSessionUsageSchema.shape.agent.safeParse("antigravity").success).toBe(false);
        expect(tokenStatsDashboardAgentSchema.safeParse("antigravity").success).toBe(false);
    });
});
