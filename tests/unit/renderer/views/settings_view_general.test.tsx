import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfiguration } from "../../../../src/shared/types/config";
// t432: consistent-type-imports——`typeof import(...)` 类型注解违规，
// 改顶部 type import（vi.mock 内引用模块类型）。
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

    it("hides window controls in web mode", async () => {
        document.documentElement.setAttribute("data-web", "1");
        try {
            render(<SettingsView />);
            // 挂载 effect 异步（config get 等）mock 立即 resolve；先 flush 使其在 act 内落地。
            await act(async () => {
                await Promise.resolve();
            });
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

    it("无返回按钮，返回导航（goBack）不再可达（AC-008）", async () => {
        render(<SettingsView />);
        // 标题栏右侧为面板切换 + 窗口控制，左上角不得再有 aria-label="返回" 的 ghost 按钮。
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByLabelText("返回")).not.toBeInTheDocument();
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
        // t271: set-seg 迁移到 ui/Segmented，选中态由 .on class 改为语义类。
        // t435: 选中配方 surface-window/on-surface → surface-card/primary。
        expect(within(style_field).getByRole("button", { name: "细线型" })).toHaveClass(
            "bg-[var(--color-surface-card)]",
        );
        expect(within(style_field).getByRole("button", { name: "细线型" })).toHaveClass(
            "text-[var(--color-primary)]",
        );
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
        // t274: 动作列手写规则（.ao-actions margin-left:auto）已迁为
        // AccountRow/CpaCard 内 ml-auto utility。JSDOM 不加载 Tailwind 产物，
        // 沿用本文件既有策略：在组件源码断言 actions 容器带 ml-auto。
        const row_src = await readFile(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../src/renderer/components/AccountRow.tsx",
            ),
            "utf8",
        );
        const cpa_src = await readFile(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../src/renderer/components/CpaCard.tsx",
            ),
            "utf8",
        );
        const actions_class = /className="([^"]*ml-auto[^"]*)"/.exec(row_src)?.[1];
        expect(actions_class).toContain("ml-auto");
        expect(cpa_src).toContain("ml-auto");
    });

    it("shows label map sync behavior in general section", async () => {
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByText("同一厂商的数据标签映射同步")).toBeInTheDocument();
        });
        const syncRow = screen
            .getByText("同一厂商的数据标签映射同步")
            .closest('[data-testid="set-row"]');
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

    describe("resume command templates (t402)", () => {
        const placeholders = {
            claude_code: "claude --resume {session_id}",
            kimi_code: "kimi -r {session_id}",
            grok: "grok --resume {session_id}",
            opencode: "opencode -s {session_id}",
        } as const;

        it("AC-001: shows group and 4 source inputs with built-in placeholders", async () => {
            render(<SettingsView />);
            await waitFor(() => {
                expect(screen.getByText("会话续接命令")).toBeInTheDocument();
            });
            for (const [source, ph] of Object.entries(placeholders)) {
                const input = screen.getByLabelText(`续接命令 ${source}`);
                expect(input).toHaveAttribute("placeholder", ph);
                expect(input).toHaveDisplayValue("");
            }
            expect(screen.getByText(/\{session_id\}/, { exact: false })).toBeInTheDocument();
        });

        it("AC-002: saves kimi_code custom template to resumeCommandTemplates", async () => {
            current_config = { ...base_config };
            render(<SettingsView />);
            const input = await screen.findByLabelText("续接命令 kimi_code");
            fireEvent.change(input, {
                target: { value: "kimi --yolo -r {session_id}" },
            });
            await waitFor(() => {
                expect(save).toHaveBeenCalled();
            });
            const saved = (
                save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
            )?.[0];
            expect(saved?.resumeCommandTemplates?.["kimi_code"]).toBe(
                "kimi --yolo -r {session_id}",
            );
        });

        it("AC-003: clearing a source removes that key from resumeCommandTemplates", async () => {
            current_config = {
                ...base_config,
                resumeCommandTemplates: {
                    kimi_code: "kimi --yolo -r {session_id}",
                    claude_code: "claude --resume {session_id}",
                },
            };
            render(<SettingsView />);
            const input = await screen.findByLabelText("续接命令 kimi_code");
            expect(input).toHaveDisplayValue("kimi --yolo -r {session_id}");
            fireEvent.change(input, { target: { value: "" } });
            await waitFor(() => {
                expect(save).toHaveBeenCalled();
            });
            const saved = (
                save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
            )?.[0];
            expect(saved?.resumeCommandTemplates).toEqual({
                claude_code: "claude --resume {session_id}",
            });
            expect(saved?.resumeCommandTemplates).not.toHaveProperty("kimi_code");
        });

        it("AC-003b: clearing last source removes resumeCommandTemplates field", async () => {
            current_config = {
                ...base_config,
                resumeCommandTemplates: {
                    kimi_code: "kimi --yolo -r {session_id}",
                },
            };
            render(<SettingsView />);
            const input = await screen.findByLabelText("续接命令 kimi_code");
            fireEvent.change(input, { target: { value: "" } });
            await waitFor(() => {
                expect(save).toHaveBeenCalled();
            });
            const saved = (
                save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
            )?.[0];
            expect(saved).not.toHaveProperty("resumeCommandTemplates");
            expect(saved?.resumeCommandTemplates).toBeUndefined();
        });

        it("AC-004: echoes existing custom templates in inputs", async () => {
            current_config = {
                ...base_config,
                resumeCommandTemplates: {
                    kimi_code: "kimi --yolo -r {session_id}",
                    grok: "grok custom {session_id}",
                },
            };
            render(<SettingsView />);
            expect(await screen.findByLabelText("续接命令 kimi_code")).toHaveDisplayValue(
                "kimi --yolo -r {session_id}",
            );
            expect(screen.getByLabelText("续接命令 grok")).toHaveDisplayValue(
                "grok custom {session_id}",
            );
            expect(screen.getByLabelText("续接命令 claude_code")).toHaveDisplayValue("");
            expect(screen.getByLabelText("续接命令 opencode")).toHaveDisplayValue("");
        });
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
        const cards = document.querySelectorAll('[data-testid^="about-card-"]');
        expect(cards).toHaveLength(8);
    });

    it("web 态关于页外链卡片渲染为原生链接，href/target/rel 正确且无 onClick（t311 AC-003/AC-004）", async () => {
        const open_spy = vi.spyOn(window, "open").mockImplementation(() => ({}) as Window);
        document.documentElement.setAttribute("data-web", "1");
        try {
            const user = userEvent.setup();
            render(<SettingsView />);
            await user.click(screen.getByTestId("settings-plugin-nav-about"));

            const expected_urls: Record<string, string> = {
                site: "https://omnipanel.app",
                docs: "https://omnipanel.app/docs",
                contact: "https://omnipanel.app/feedback",
                donate: "https://omnipanel.app/sponsor",
                privacy: "https://omnipanel.app/privacy",
                terms: "https://omnipanel.app/terms",
                oss: "https://omnipanel.app/oss",
            };
            for (const [id, url] of Object.entries(expected_urls)) {
                const link = screen.getByTestId(`about-card-${id}`);
                expect(link.tagName).toBe("A");
                expect(link).toHaveAttribute("href", url);
                expect(link).toHaveAttribute("target", "_blank");
                expect(link).toHaveAttribute("rel", "noopener noreferrer");
                // AC-004 静态前提：无 onClick 拦截。React 合成事件不渲染 onclick
                // attribute（恒真断言无意义）；可失败断言——点击外链不触发
                // window.open（若实现误在 <a> 上挂 onClick 拦截会调它）。
                link.click();
                expect(open_spy).not.toHaveBeenCalled();
            }
            // 「检查更新」卡无外链地址，保持按钮形态。
            const update = screen.getByTestId("about-card-update");
            expect(update.tagName).toBe("BUTTON");
        } finally {
            open_spy.mockRestore();
            document.documentElement.removeAttribute("data-web");
        }
    });

    it("桌面态点击关于页外链卡片调用 window.open（t311 AC-005）", async () => {
        const open_spy = vi.spyOn(window, "open").mockImplementation(() => ({}) as Window);
        try {
            const user = userEvent.setup();
            render(<SettingsView />);
            await user.click(screen.getByTestId("settings-plugin-nav-about"));
            await user.click(screen.getByTestId("about-card-site"));
            expect(open_spy).toHaveBeenCalledWith(
                "https://omnipanel.app",
                "_blank",
                "noopener,noreferrer",
            );
            const site_card = screen.getByTestId("about-card-site");
            expect(site_card.tagName).toBe("BUTTON");
        } finally {
            open_spy.mockRestore();
        }
    });

    it("shows platform info in separate meta line", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const meta = screen.getByTestId("about-platform");
        expect(meta).toBeInTheDocument();
        expect(meta.textContent).toMatch(/Windows/);
    });

    it("shows Linux platform in about section on linux (t369 AC-003)", async () => {
        window.usageboard.platform = "linux";
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const meta = screen.getByTestId("about-platform");
        expect(meta.textContent).toMatch(/Linux/);
    });

    it("shows build info branch@commit subject in about section", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        await waitFor(() => {
            expect(screen.getByTestId("about-build")).toHaveTextContent(
                "t030_test@abc1234 feat: do thing",
            );
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

    it("uses semantic UI controls for data actions", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-data"));

        for (const label of ["导出", "导入", "导出日志", "暂未开放"]) {
            const buttons = screen.getAllByRole("button", { name: label });
            expect(buttons.length).toBeGreaterThan(0);
            for (const button of buttons) {
                expect(button.className).not.toContain("set-select");
            }
        }
    });

    it("removes migrated settings control CSS selectors", async () => {
        const css = await readFile(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../src/renderer/styles/globals.css",
            ),
            "utf8",
        );
        for (const selector of [
            ".set-select",
            ".set-seg",
            ".ad-input",
            ".ad-btn",
            ".acct-dialog",
            ".acct-dialog-scrim",
            ".sp-action",
            ".accent-sw",
            ".bsf-opt",
        ]) {
            const escaped = selector.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
            expect(css).not.toMatch(new RegExp(`${escaped}\\s*\\{`));
        }
    });

    it("t406 AC-002/003：侧栏背景 surface-window，无 color-mix；nav hover 仍用 raised", async () => {
        render(<SettingsView />);
        const sidebar = await screen.findByTestId("settings-sidebar");
        expect(sidebar.className).toContain("bg-[var(--color-surface-window)]");
        expect(sidebar.className).not.toContain("color-mix");
        const idle_nav = screen.getByTestId("settings-plugin-nav-appearance");
        expect(idle_nav.className).toContain("hover:bg-[var(--color-surface-raised)]");
    });
});
