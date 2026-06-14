import { describe, it, expect } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/renderer/App";
import { SettingsView } from "../../src/renderer/views/SettingsView";
import { getMockApi } from "./setup";

describe("Renderer smoke tests", () => {
    describe("PopupView", () => {
        it("renders OmniUsage header", async () => {
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("OmniUsage")).toBeInTheDocument();
            });
        });

        it("shows provider cards with usage data", async () => {
            const user = userEvent.setup();
            render(<App />);
            await waitFor(() => {
                expect(screen.getAllByText("DeepSeek").length).toBeGreaterThanOrEqual(1);
            });
            // Click DeepSeek provider tab to switch to provider detail view
            const deepseekTabs = screen.getAllByRole("button", { name: "DeepSeek" });
            const target = deepseekTabs[deepseekTabs.length - 1];
            if (!target) throw new Error("DeepSeek tab not found");
            await user.click(target);
            expect(screen.getByText("5000/10000")).toBeInTheDocument();
        });

        it("shows failed provider source as an empty provider page", async () => {
            const user = userEvent.setup();
            render(<App />);
            await waitFor(() => {
                expect(screen.getAllByText("Claude").length).toBeGreaterThanOrEqual(1);
            });
            await user.click(screen.getByRole("button", { name: "Claude" }));
            expect(screen.getByText("该服务暂无账号。请到设置添加数据来源。")).toBeInTheDocument();
        });

        it("shows refresh button", async () => {
            render(<App />);
            await waitFor(() => {
                expect(screen.getByTitle("刷新全部")).toBeInTheDocument();
            });
        });

        it("clicking refresh calls refreshAll", async () => {
            const user = userEvent.setup();
            render(<App />);
            await waitFor(() => {
                expect(screen.getByTitle("刷新全部")).toBeInTheDocument();
            });
            const btn = screen.getByTitle("刷新全部");
            await user.click(btn);
            const api = getMockApi();
            expect(api.plugin.refreshAll).toHaveBeenCalled();
        });
    });

    describe("SettingsView", () => {
        it("renders settings sidebar with plugin names", async () => {
            render(<SettingsView />);
            await waitFor(() => {
                expect(screen.getByText("设置")).toBeInTheDocument();
            });
            // nav items present
            expect(screen.getByText("常规")).toBeInTheDocument();
            expect(screen.getByText("账号")).toBeInTheDocument();
        });

        it("renders general settings with global options", async () => {
            render(<SettingsView />);
            await waitFor(() => {
                expect(screen.getByText("开机时自动启动")).toBeInTheDocument();
            });
            expect(screen.getByText("自动刷新间隔")).toBeInTheDocument();
        });

        it("saves edited account settings through config and secret IPC", async () => {
            const user = userEvent.setup();
            const api = getMockApi();
            render(<SettingsView />);

            await user.click(await screen.findByTestId("settings-plugin-nav-accounts"));
            const deepseek_vendors = await screen.findAllByText("DeepSeek");
            const deepseek_row = deepseek_vendors
                .find((el) => el.classList.contains("ar-vendor"))
                ?.closest(".acc-card");
            if (!deepseek_row) throw new Error("DeepSeek card not found");
            const edit_button =
                deepseek_row.querySelector<HTMLButtonElement>('button[title="编辑"]');
            if (!edit_button) throw new Error("DeepSeek edit button not found");
            await user.click(edit_button);

            await user.type(await screen.findByLabelText("API Key"), "sk-smoke-test");
            await user.selectOptions(screen.getByLabelText("Model"), "coder");
            await user.click(screen.getByTestId("settings-save-btn-deepseek"));

            await waitFor(() => {
                expect(api.config.saveSecrets).toHaveBeenCalledWith({
                    instanceId: "deepseek",
                    secrets: { API_KEY: "sk-smoke-test" },
                });
                expect(api.config.save).toHaveBeenCalledWith({
                    ...api._config,
                    plugins: [
                        {
                            ...api._config.plugins[0],
                            parameterValues: { MODEL: "coder" },
                        },
                        api._config.plugins[1],
                    ],
                });
                expect(api.plugin.refresh).toHaveBeenCalledWith("deepseek");
            });
        });
    });

    describe("Empty state", () => {
        it("shows empty state when no plugins", async () => {
            const api = getMockApi();
            api.plugin.list.mockResolvedValueOnce([]);
            window.location.hash = "#popup";
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("还没有添加任何服务")).toBeInTheDocument();
            });
        });
    });

    describe("Error state", () => {
        it("shows error banner when plugin list fails", async () => {
            const api = getMockApi();
            api.plugin.list.mockRejectedValueOnce(new Error("IPC 断开"));
            window.location.hash = "#popup";
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("网络连接异常，部分数据可能不是最新")).toBeInTheDocument();
            });
        });
    });

    describe("Theme", () => {
        it("applies dark class on theme change event", async () => {
            render(<App />);
            await screen.findAllByText("DeepSeek");
            const api = getMockApi();
            const listeners = api._themeListeners;
            expect(listeners.size).toBeGreaterThan(0);
            act(() => {
                for (const cb of listeners) {
                    cb(true);
                }
            });
            expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        });
    });
});
