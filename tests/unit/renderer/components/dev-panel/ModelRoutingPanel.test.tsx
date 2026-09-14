import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRoutingPanel } from "../../../../../src/renderer/components/dev-panel/ModelRoutingPanel";

function install_api() {
    const api = {
        getConfig: vi.fn().mockResolvedValue({
            config_path: "/tmp/new_api.yaml",
            settings_path: "/tmp/settings.json",
            models: ["claude-sonnet", "claude-opus"],
            aliases: {},
            expanded_slots: ["default_model"],
            settings_present: true,
        }),
        getChannels: vi.fn().mockResolvedValue({
            fetched_at: "now",
            channels: [
                {
                    id: "alpha",
                    name: "Alpha",
                    group: "default",
                    status: "enabled",
                    enabled: true,
                    models: ["claude-sonnet", "legacy-model"],
                    model_mapping: { default_model: "legacy-model" },
                    priority: 1,
                },
            ],
        }),
        save: vi.fn().mockResolvedValue({
            success: true,
            snapshot: { snapshot_id: "snapshot-1", created_at: "now", channel_count: 1 },
            changes: [
                {
                    channel_id: "alpha",
                    channel_name: "Alpha",
                    status: "success",
                    added_models: ["default_model"],
                    removed_models: [],
                    mapping_changes: ["default_model: legacy-model → claude-sonnet"],
                    priority_changed: false,
                },
            ],
        }),
        test: vi.fn().mockResolvedValue({
            success: true,
            model_name: "claude-sonnet",
            error: null,
        }),
        getSnapshot: vi.fn().mockResolvedValue(null),
    };
    (window as unknown as { usageboard: unknown }).usageboard = {
        devPanel: { modelRouting: api },
    };
    return api;
}

describe("ModelRoutingPanel", () => {
    beforeEach(() => {
        install_api();
        vi.stubGlobal(
            "confirm",
            vi.fn(() => true),
        );
    });

    it("renders five selectors, tests a slot, and saves only after confirmation", async () => {
        const api = install_api();
        render(<ModelRoutingPanel />);

        await waitFor(() => expect(screen.getByLabelText("默认模型")).toBeInTheDocument());
        expect(screen.getAllByRole("combobox")).toHaveLength(5);
        expect(screen.getAllByRole("option", { name: "legacy-model" })).toHaveLength(5);

        const test_button = screen.getAllByRole("button", { name: "测试" })[0];
        if (!test_button) throw new Error("missing model test button");
        fireEvent.click(test_button);
        await waitFor(() =>
            expect(screen.getByText("返回模型：claude-sonnet")).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByRole("button", { name: "保存模型路由" }));
        await waitFor(() => {
            expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }));
        });
        expect(screen.getByText(/成功 1/)).toBeInTheDocument();
        expect(screen.getByText(/快照已保留/)).toBeInTheDocument();
    });

    it("does not save when the second confirmation is declined", async () => {
        const api = install_api();
        vi.stubGlobal(
            "confirm",
            vi.fn(() => false),
        );
        render(<ModelRoutingPanel />);
        await waitFor(() => expect(screen.getByLabelText("默认模型")).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "保存模型路由" }));
        expect(api.save).not.toHaveBeenCalled();
    });
});
