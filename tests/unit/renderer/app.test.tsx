import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../../../src/renderer/App";

let mock_route = "usage";

vi.mock("../../../src/renderer/hooks/use-route", () => ({
    use_route: () => mock_route,
}));

// lazy views 替换为同步 stub，专注测 App 路由分发（不依赖真实 view 依赖树）。
// App.tsx lazy 对 SettingsView/SessionShell 取命名导出，其余取 default——mock 同时提供两者。
const PopupStub = () => <div data-testid="view-popup" />;
const SettingStub = () => <div data-testid="view-setting" />;
const TrayStub = () => <div data-testid="view-tray" />;
const AgentStub = () => <div data-testid="view-agent" />;
const SessionStub = () => <div data-testid="view-session" />;

vi.mock("../../../src/renderer/components/session-shell/SessionShell", () => ({
    SessionShell: SessionStub,
}));
vi.mock("../../../src/renderer/views/PopupView", () => ({
    default: PopupStub,
    PopupView: PopupStub,
}));
vi.mock("../../../src/renderer/views/SettingsView", () => ({
    default: SettingStub,
    SettingsView: SettingStub,
}));
vi.mock("../../../src/renderer/views/TrayMenu", () => ({
    default: TrayStub,
    TrayMenu: TrayStub,
}));
vi.mock("../../../src/renderer/views/TokenStatsView", () => ({
    default: AgentStub,
    TokenStatsView: AgentStub,
}));

describe("App 路由分发（t397 AC-003）", () => {
    beforeEach(() => {
        mock_route = "usage";
        vi.clearAllMocks();
    });

    async function expect_view(route: string, testid: string): Promise<void> {
        mock_route = route;
        const { unmount } = render(<App />);
        await waitFor(() => {
            expect(screen.getByTestId(testid)).toBeInTheDocument();
        });
        unmount();
    }

    it("setting 路由渲染 SettingsView", async () => {
        await expect_view("setting", "view-setting");
    });
    it("tray 路由渲染 TrayMenu", async () => {
        await expect_view("tray", "view-tray");
    });
    it("agent 路由渲染 TokenStatsView", async () => {
        await expect_view("agent", "view-agent");
    });
    it("session 路由渲染 SessionShell", async () => {
        await expect_view("session", "view-session");
    });
    it("未知 hash 归一化到 usage → PopupView", async () => {
        await expect_view("bogus", "view-popup");
    });
});
