import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";
import {
    save,
    saveSecrets,
    duplicate,
    base_config,
    install_settings_usageboard,
} from "./settings_view_test_utils";

let current_config: AppConfiguration = base_config;

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    use_config: () => ({
        config: current_config,
        hasSecrets: { "cpa-1": { cpa_mgmt_key: true } },
        loading: false,
        error: null,
        save,
        saveSecrets,
        duplicate,
    }),
}));

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("SettingsView", () => {
    beforeEach(() => {
        current_config = base_config;
        install_settings_usageboard(() => current_config);
    });

    it("labels the log level selector for assistive technology", async () => {
        current_config = { ...base_config, logLevel: "info" };
        render(<SettingsView />);

        expect(await screen.findByLabelText("日志等级")).toHaveDisplayValue("Info");
    });

    describe("upcoming reset threshold input (t041)", () => {
        it("renders empty input when threshold is null", async () => {
            current_config = { ...base_config, upcomingResetThresholdPercent: null };
            render(<SettingsView />);
            const input = await screen.findByPlaceholderText("留空");
            expect(input).toHaveDisplayValue("");
        });

        it("saves parsed number when user enters a valid threshold", async () => {
            current_config = { ...base_config, upcomingResetThresholdPercent: null };
            render(<SettingsView />);
            const input = await screen.findByPlaceholderText("留空");
            fireEvent.change(input, { target: { value: "15" } });
            await waitFor(() => {
                expect(save).toHaveBeenCalledWith(
                    expect.objectContaining({ upcomingResetThresholdPercent: 15 }),
                );
            });
        });

        it("saves null when user clears the input", async () => {
            current_config = { ...base_config, upcomingResetThresholdPercent: 20 };
            render(<SettingsView />);
            const input = await screen.findByPlaceholderText("留空");
            fireEvent.change(input, { target: { value: "" } });
            await waitFor(() => {
                expect(save).toHaveBeenCalledWith(
                    expect.objectContaining({ upcomingResetThresholdPercent: null }),
                );
            });
        });

        it("does not save when input is out of range", async () => {
            current_config = { ...base_config, upcomingResetThresholdPercent: null };
            render(<SettingsView />);
            const input = await screen.findByPlaceholderText("留空");
            fireEvent.change(input, { target: { value: "150" } });
            expect(save).not.toHaveBeenCalledWith(
                expect.objectContaining({ upcomingResetThresholdPercent: 150 }),
            );
        });
    });

    it("hides window controls in web mode", () => {
        document.documentElement.setAttribute("data-web", "1");
        try {
            render(<SettingsView />);
            // TitleBar renders synchronously; window controls must be absent.
            expect(screen.queryByTitle("最小化")).not.toBeInTheDocument();
            expect(screen.queryByTitle("最大化")).not.toBeInTheDocument();
            expect(screen.queryByTitle("关闭")).not.toBeInTheDocument();
        } finally {
            document.documentElement.removeAttribute("data-web");
        }
    });

    it("saves selected log level from general settings", async () => {
        current_config = { ...base_config, logLevel: "info" };
        render(<SettingsView />);

        const user = userEvent.setup();
        await user.selectOptions(await screen.findByDisplayValue("Info"), "Debug");

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "debug" }));
        });
    });

    it("calls window.close when back button is clicked", async () => {
        const closeSpy = vi.spyOn(window, "close").mockImplementation(() => undefined);
        const user = userEvent.setup();
        render(<SettingsView />);
        const backBtn = document.querySelector<HTMLButtonElement>(".back-btn");
        if (!backBtn) throw new Error("back button not found");
        await user.click(backBtn);
        expect(closeSpy).toHaveBeenCalled();
        closeSpy.mockRestore();
    });

    it("saves main panel mode", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.selectOptions(screen.getByDisplayValue("跟随系统推荐"), "弹出面板");

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            mainPanelMode: "popup",
        });
    });

    it("shows and saves floating height mode when floating is effective", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config, mainPanelMode: "floating" };
        render(<SettingsView />);

        expect(screen.getByText("浮动窗口高度")).toBeInTheDocument();
        await user.selectOptions(screen.getByDisplayValue("保持窗口大小"), "跟随内容变化");

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
        });
    });

    it("hides floating height mode when popup is effective", async () => {
        current_config = { ...base_config, mainPanelMode: "popup" };
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.queryByText("浮动窗口高度")).not.toBeInTheDocument();
        });
    });

    it("shows and saves usage bar color scheme from appearance settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));

        expect(screen.getByText("用量条颜色方案")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /风险色：仅当前用量/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /风险色：带投影预测/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /彩色区分：九色循环/ })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /彩色区分：九色循环/ }));

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            usageBarColorScheme: "nine-cycle",
        });
    });

    it("renders usage bar style as buttons above color scheme and saves it", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));
        const style_label = screen.getByText("用量条样式");
        const color_label = screen.getByText("用量条颜色方案");
        expect(
            Boolean(
                style_label.compareDocumentPosition(color_label) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);

        const style_field = screen.getByLabelText("用量条样式");
        expect(within(style_field).getByRole("button", { name: "细线型" })).toHaveClass("on");
        await user.click(within(style_field).getByRole("button", { name: "粗胶囊型" }));

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            usageBarStyle: "capsule",
        });
    });

    it("does not render global usage label map in appearance settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));

        expect(screen.queryByText("用量标签映射")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("用量标签映射")).not.toBeInTheDocument();
    });

    it("does not render anonymous usage statistics in data settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-data"));

        expect(screen.queryByText("匿名使用统计")).not.toBeInTheDocument();
    });

    it("does not render notification settings because notification delivery is not implemented", async () => {
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.getByTestId("settings-plugin-nav-accounts")).toBeInTheDocument();
        });
        expect(screen.queryByTestId("settings-plugin-nav-notify")).not.toBeInTheDocument();
        expect(screen.queryByText("接近限制时提醒")).not.toBeInTheDocument();
    });

    it("exports runtime logs from data settings", async () => {
        const user = userEvent.setup();
        const export_logs = vi.fn().mockResolvedValue({ saved: true });
        window.usageboard.logs = { export: export_logs };
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-data"));
        await user.click(screen.getByRole("button", { name: "导出日志" }));

        await waitFor(() => {
            expect(export_logs).toHaveBeenCalled();
        });
        expect(screen.getByRole("button", { name: "已导出" })).toBeInTheDocument();
    });

    it("right-aligns account action buttons via margin-left: auto", async () => {
        // The .ao-actions element must have margin-left: auto to push
        // toggle/action buttons to the right edge of the flex row.
        // JSDOM doesn't load external CSS, so we verify the rule exists in the source.
        const css = await readFile(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../src/renderer/styles/globals.css",
            ),
            "utf8",
        );

        // .ao-actions block must include margin-left: auto
        const match = /\.ao-actions\s*\{([^}]+)\}/.exec(css);
        if (!match) throw new Error(".ao-actions rule not found in globals.css");
        expect(match[1]).toContain("margin-left");
        expect(match[1]).toContain("auto");
    });

    it("shows label map sync behavior in general section", async () => {
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByText("同一厂商的数据标签映射同步")).toBeInTheDocument();
        });
        const syncRow = screen.getByText("同一厂商的数据标签映射同步").closest(".set-row");
        if (!syncRow) throw new Error("sync row not found");
        expect(within(syncRow as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows proxy URL input in general section", async () => {
        current_config = { ...base_config, proxy: { url: "http://127.0.0.1:7897" } };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });
        expect(screen.getByPlaceholderText("留空表示直连")).toHaveValue("http://127.0.0.1:7897");
    });

    it("saves proxy config when proxy URL is entered", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText("留空表示直连");
        await user.clear(input);
        // Use paste to insert full URL in one event (type fires per-character).
        await user.click(input);
        await user.paste("http://127.0.0.1:7897");

        await waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const saved_config = (
            save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
        )?.[0];
        expect(saved_config?.proxy).toEqual({ url: "http://127.0.0.1:7897" });
    });

    it("renders 8 action cards in about section", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const cards = document.querySelectorAll(".ab-card");
        expect(cards).toHaveLength(8);
    });

    it("shows platform info in separate meta line", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const meta = document.querySelector(".ah-meta");
        expect(meta).not.toBeNull();
        expect(meta?.textContent).toMatch(/Windows.*x64/);
    });

    it("shows build info branch@commit subject in about section", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        await waitFor(() => {
            const build = document.querySelector(".ah-build");
            expect(build?.textContent).toBe("t030_test@abc1234 feat: do thing");
        });
    });

    it("shows omnipanel.app as site card subtitle", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        expect(screen.getByText("omnipanel.app")).toBeInTheDocument();
    });

    it("shows '当前已是最新' as update card subtitle", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        expect(screen.getByText("当前已是最新")).toBeInTheDocument();
    });

    it("removes proxy config when proxy URL is cleared", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config, proxy: { url: "http://127.0.0.1:7897" } };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText("留空表示直连");
        await user.clear(input);

        await waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const saved_config = (
            save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
        )?.[0];
        expect(saved_config?.proxy).toBeUndefined();
    });
});
