import { describe, expect, it } from "vitest";
import { vendor_id_for_source, agent_accent } from "../../../../src/renderer/lib/workspace/slots";
import { agent_friendly, agent_slug } from "../../../../src/renderer/lib/session-history/markdown";
import type { AgentFilter } from "../../../../src/renderer/lib/token-stats/types";
import { resume_command } from "../../../../src/renderer/lib/session-resume";

/**
 * t447 两面板 codex 接线（AC-001~004 的映射层部分；面板行为由
 * token_stats_view.test.tsx 的 Codex 用例覆盖）。
 */
describe("codex panels wiring (t447)", () => {
    it("AC-001: AgentFilter 接纳 codex", () => {
        const f: AgentFilter = "codex";
        expect(f).toBe("codex");
    });

    it("AC-002: 会话库展示名/directory 语义（friendly + slug 与明细 agent 一致）", () => {
        expect(agent_friendly("codex")).toBe("Codex");
        expect(agent_slug("codex")).toBe("codex");
    });

    it("AC-003: 续接命令模板", () => {
        expect(resume_command("codex", "sid-1")).toBe("codex resume sid-1");
    });

    it("AC-004: 会话行徽标走 codex vendor logo（与用量面板同源）", () => {
        expect(vendor_id_for_source("codex")).toBe("codex");
    });

    it("t448 AC-003: codex accent 走独立色，不回退 primary", () => {
        expect(agent_accent("codex")).toBe("var(--color-agent-codex)");
    });
});
