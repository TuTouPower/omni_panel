import { describe, it, expect } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/renderer/App";
import { getMockApi } from "./setup";

describe("Renderer smoke tests", () => {
    describe("PopupView", () => {
        it("renders OmniUsage header", async () => {
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("OmniUsage")).toBeInTheDocument();
            });
        });

        it("shows plugin cards with usage data", async () => {
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("DeepSeek")).toBeInTheDocument();
            });
            // ratio display: shows "5000 / 10000 (50%)"
            expect(screen.getByText(/5000.*10000.*50%/)).toBeInTheDocument();
        });

        it("shows failed plugin error", async () => {
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("Claude")).toBeInTheDocument();
            });
            expect(screen.getByText("API 超时")).toBeInTheDocument();
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
            window.location.hash = "#settings";
            render(<App />);
            await waitFor(() => {
                expect(screen.getByText("设置")).toBeInTheDocument();
            });
            // nav items present
            expect(screen.getByText("常规")).toBeInTheDocument();
            expect(screen.getByText("账号")).toBeInTheDocument();
        });

        it("renders settings form with parameter fields", async () => {
            window.location.hash = "#settings";
            render(<App />);
            await waitFor(() => {
                expect(screen.getByLabelText("API Key")).toBeInTheDocument();
            });
            expect(screen.getByLabelText("Model")).toBeInTheDocument();
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
                expect(screen.getByText("IPC 断开")).toBeInTheDocument();
            });
        });
    });

    describe("Theme", () => {
        it("applies dark class on theme change event", async () => {
            render(<App />);
            await screen.findByText("DeepSeek");
            const api = getMockApi();
            const listeners = api._themeListeners;
            expect(listeners.size).toBeGreaterThan(0);
            act(() => {
                for (const cb of listeners) {
                    cb(true);
                }
            });
            expect(document.documentElement.classList.contains("dark")).toBe(true);
        });
    });
});
