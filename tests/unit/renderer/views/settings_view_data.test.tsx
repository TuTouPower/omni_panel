import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import type * as theme_module from "../../../../src/renderer/lib/theme";
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

vi.mock("../../../../src/renderer/lib/theme", async (importOriginal) => {
    const actual = await importOriginal<typeof theme_module>();
    return {
        ...actual,
        useTheme: () => undefined,
        apply_accent: () => undefined,
    };
});

describe("SettingsView - DataSection (t490)", () => {
    beforeEach(() => {
        current_config = base_config;
        install_settings_usageboard(() => current_config);
        delete document.documentElement.dataset["web"];
    });

    afterEach(() => {
        delete document.documentElement.dataset["web"];
    });

    it("renders secret option checkbox and unified subtitle in desktop mode (AC-001)", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        // Switch to Data tab
        const dataTab = await screen.findByTestId("settings-plugin-nav-data");
        await user.click(dataTab);

        // Subtitle should be unified
        expect(screen.getByText("导出配置；默认不含明文密钥")).toBeInTheDocument();

        // Checkbox must be present on desktop
        const checkbox = screen.getByRole("checkbox", { name: "包含明文密钥" });
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();

        // Warning should not appear initially
        expect(screen.queryByText("文件含明文密钥，请妥善保管")).not.toBeInTheDocument();

        // Check the checkbox
        await user.click(checkbox);
        expect(checkbox).toBeChecked();
        expect(screen.getByText("文件含明文密钥，请妥善保管")).toBeInTheDocument();
    });

    it("passes { includeSecrets } properly to window.usageboard.config.export on desktop (AC-002)", async () => {
        const user = userEvent.setup();
        const exportMock = vi.fn().mockResolvedValue({ saved: true });
        window.usageboard.config.export = exportMock;

        render(<SettingsView />);

        const dataTab = await screen.findByTestId("settings-plugin-nav-data");
        await user.click(dataTab);

        const exportRow = screen.getByText("导出设置").closest('[data-testid="set-row"]');
        if (!(exportRow instanceof HTMLElement)) throw new Error("导出设置行未渲染");
        const exportButton = within(exportRow).getByRole("button", { name: "导出" });

        // 1. Export without checking secrets
        await user.click(exportButton);
        expect(exportMock).toHaveBeenLastCalledWith({ includeSecrets: false });

        // 2. Export with secrets checked
        const checkbox = screen.getByRole("checkbox", { name: "包含明文密钥" });
        await user.click(checkbox);
        await user.click(exportButton);
        expect(exportMock).toHaveBeenLastCalledWith({ includeSecrets: true });
    });

    it("renders secret option checkbox and unified subtitle in web mode (AC-001)", async () => {
        document.documentElement.dataset["web"] = "true";
        const user = userEvent.setup();
        render(<SettingsView />);

        const dataTab = await screen.findByTestId("settings-plugin-nav-data");
        await user.click(dataTab);

        expect(screen.getByText("导出配置；默认不含明文密钥")).toBeInTheDocument();
        const checkbox = screen.getByRole("checkbox", { name: "包含明文密钥" });
        expect(checkbox).toBeInTheDocument();
    });
});
