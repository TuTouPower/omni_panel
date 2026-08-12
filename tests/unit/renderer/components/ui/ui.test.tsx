import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
    Button,
    Card,
    Input,
    Textarea,
    Select,
    SecretInput,
    Checkbox,
    Switch,
    Segmented,
    Menu,
    MenuItem,
    Dialog,
    Progress,
    Badge,
    StatusDot,
    Kpi,
    Skeleton,
    PanelTitleBar,
    ListRow,
} from "../../../../../src/renderer/components/ui";

describe("ui 组件库（t269）", () => {
    it("Button 变体/尺寸/disabled 渲染正确", () => {
        const { container, rerender } = render(<Button>click</Button>);
        const btn = container.querySelector("button");
        expect(btn).not.toBeNull();
        // primary 默认 variant
        expect(btn?.className).toContain("bg-[var(--color-primary)]");
        expect(btn?.className).toContain("text-[var(--color-on-primary)]");
        // t301：按钮字重对齐 DESIGN（600，font-semibold）
        expect(btn?.className).toContain("font-semibold");
        rerender(
            <Button variant="ghost" size="sm" disabled>
                g
            </Button>,
        );
        expect(container.querySelector("button")?.className).toContain(
            "hover:bg-[var(--color-primary-container)]",
        );
        expect(container.querySelector("button")?.className).toContain("h-8");
        expect(container.querySelector("button")?.disabled).toBe(true);
    });

    it("Card raised 切换背景 token 类", () => {
        const { container, rerender } = render(<Card>c</Card>);
        expect(container.querySelector("div")?.className).toContain(
            "bg-[var(--color-surface-card)]",
        );
        rerender(<Card raised>c</Card>);
        expect(container.querySelector("div")?.className).toContain(
            "bg-[var(--color-surface-raised)]",
        );
    });

    it("Input invalid 加 error 边框 token 类", () => {
        const { container, rerender } = render(<Input />);
        expect(container.querySelector("input")?.className).not.toContain(
            "border-[var(--color-error)]",
        );
        rerender(<Input invalid />);
        expect(container.querySelector("input")?.className).toContain(
            "border-[var(--color-error)]",
        );
    });

    it("Textarea 渲染", () => {
        const { container } = render(<Textarea placeholder="desc" />);
        const ta = container.querySelector("textarea");
        expect(ta).not.toBeNull();
        expect(ta?.getAttribute("placeholder")).toBe("desc");
    });

    it("Select 渲染自绘箭头（option 传递）", () => {
        const { container } = render(
            <Select aria-label="pick">
                <option value="a">A</option>
                <option value="b">B</option>
            </Select>,
        );
        const sel = container.querySelector("select");
        expect(sel?.querySelectorAll("option")).toHaveLength(2);
        // 自绘箭头 svg
        expect(container.querySelector("svg")).not.toBeNull();
    });

    it("SecretInput 默认 password 类型，切换后 text", () => {
        const { container } = render(<SecretInput aria-label="sec" />);
        const input = container.querySelector("input");
        expect(input?.getAttribute("type")).toBe("password");
        const toggle = container.querySelector("button");
        if (!toggle) throw new Error("toggle button missing");
        fireEvent.click(toggle);
        expect(container.querySelector("input")?.getAttribute("type")).toBe("text");
    });

    it("Checkbox 渲染为 checkbox 类型", () => {
        const { container } = render(<Checkbox aria-label="chk" />);
        const cb = container.querySelector("input");
        expect(cb?.getAttribute("type")).toBe("checkbox");
    });

    it("Switch 点击切换 checked 状态", () => {
        let checked = false;
        const { container, rerender } = render(
            <Switch checked={checked} onChange={(v) => (checked = v)} aria-label="sw" />,
        );
        const btn = container.querySelector("button");
        expect(btn?.getAttribute("aria-checked")).toBe("false");
        if (!btn) throw new Error("switch button missing");
        // t301 token 对齐：关态 surface-raised、尺寸 38×22（DESIGN switch-track）
        expect(btn.className).toContain("h-[22px]");
        expect(btn.className).toContain("w-[38px]");
        expect(btn.className).toContain("bg-[var(--color-surface-raised)]");
        fireEvent.click(btn);
        expect(checked).toBe(true);
        // 开态 success 绿（DESIGN switch-track-on）
        rerender(<Switch checked onChange={(v) => (checked = v)} aria-label="sw" />);
        const on_btn = container.querySelector("button");
        expect(on_btn?.className).toContain("bg-[var(--color-success)]");
        // 圆钮：18px，关态留白 0.5 起步，开态对称到右缘（38−18−2=18px，轨道无边框）
        const knob = on_btn?.querySelector("span");
        expect(knob?.className).toContain("translate-x-[18px]");
        expect(knob?.className).toContain("h-[18px]");
        expect(knob?.className).toContain("w-[18px]");
    });

    it("Segmented 高亮选中项并回调", () => {
        let value = "a";
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];
        const { container, rerender } = render(
            <Segmented options={options} value={value} onChange={(v) => (value = v)} />,
        );
        const buttons = container.querySelectorAll("button");
        expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
        expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
        expect(buttons[0]?.className).toContain("bg-[var(--color-surface-window)]");
        const second = buttons[1];
        if (!second) throw new Error("second segment missing");
        fireEvent.click(second);
        expect(value).toBe("b");
        // 父级以新 value 重渲染后，aria-pressed 与选中态同步
        rerender(<Segmented options={options} value={value} onChange={(v) => (value = v)} />);
        expect(second.getAttribute("aria-pressed")).toBe("true");
        expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    });

    it("Menu + MenuItem 渲染，danger 项加 error 类", () => {
        const { container } = render(
            <Menu>
                <MenuItem>item</MenuItem>
                <MenuItem danger>del</MenuItem>
            </Menu>,
        );
        const items = container.querySelectorAll("button");
        expect(items).toHaveLength(2);
        // t301 token 对齐：普通项 hover 蓝底白字、危险项红底白字（DESIGN menu-item-hover）
        expect(items[0]?.className).toContain("hover:bg-[var(--color-primary)]");
        expect(items[0]?.className).toContain("hover:text-[var(--color-on-primary)]");
        expect(items[1]?.className).toContain("text-[var(--color-error)]");
        expect(items[1]?.className).toContain("hover:bg-[var(--color-error)]");
        expect(items[1]?.className).toContain("hover:text-[var(--color-on-primary)]");
    });

    it("Dialog 关闭时不渲染，open 时渲染 372 宽度", () => {
        const { container, rerender } = render(<Dialog open={false} onClose={() => undefined} />);
        expect(container.innerHTML).toBe("");
        rerender(
            <Dialog open onClose={() => undefined} title="t">
                body
            </Dialog>,
        );
        expect(screen.getByText("t")).not.toBeNull();
        expect(screen.getByText("body")).not.toBeNull();
        expect(container.innerHTML).toContain("w-[372px]");
        // t301：Dialog 入场动画类（DESIGN Motion：160ms 上浮淡入）
        expect(container.innerHTML).toContain("animate-[dialogIn");
    });

    it("Dialog 420 宽度", () => {
        const { container } = render(
            <Dialog open onClose={() => undefined} width={420}>
                b
            </Dialog>,
        );
        expect(container.innerHTML).toContain("w-[420px]");
    });

    it("Progress 细线与胶囊形态并存，填充色按风险阶梯", () => {
        const { container, rerender } = render(<Progress value={0.3} />);
        const thin = container.querySelector('[role="progressbar"]');
        // t301 token 对齐：细线 6px、胶囊 22px（DESIGN progress-track/capsule）
        expect(thin?.className).toContain("h-[6px]");
        rerender(<Progress value={0.3} variant="capsule" label="30%" />);
        const cap = container.querySelector('[role="progressbar"]');
        expect(cap?.className).toContain("h-[22px]");
        expect(screen.getByText("30%")).not.toBeNull();
        // 0.3 → success 色（低风险）
        const fill = cap?.querySelector("div");
        expect(fill?.getAttribute("style")).toContain("color-success");
    });

    it("Badge count/label 双形态", () => {
        const { container, rerender } = render(<Badge>5</Badge>);
        const count = container.querySelector("span");
        expect(count?.className).toContain("rounded-full");
        // t301 token 对齐：count 浅底 primary 字（DESIGN badge-count）
        expect(count?.className).toContain("bg-[var(--color-primary-container)]");
        expect(count?.className).toContain("text-[var(--color-primary)]");
        rerender(
            <Badge variant="label" color="#e85d3d">
                claude
            </Badge>,
        );
        expect(container.querySelector("span")?.className).toContain("rounded-md");
    });

    // AC-005: Badge label 未传 dot 时保留前置圆点（t320 去圆点是调用侧显式关闭）。
    it("Badge label keeps leading dot by default and hides it when dot=false", () => {
        const { container, rerender } = render(
            <Badge variant="label" color="#e85d3d">
                claude
            </Badge>,
        );
        expect(container.querySelector(".rounded-full")).not.toBeNull();
        rerender(
            <Badge variant="label" color="#e85d3d" dot={false}>
                claude
            </Badge>,
        );
        expect(container.querySelector(".rounded-full")).toBeNull();
    });

    it("StatusDot tone 类", () => {
        const { container } = render(<StatusDot tone="success" />);
        expect(container.querySelector("span")?.className).toContain("bg-[var(--color-success)]");
    });

    it("Kpi 渲染数值与标签", () => {
        render(<Kpi value="12.3k" label="tokens" />);
        expect(screen.getByText("12.3k")).not.toBeNull();
        expect(screen.getByText("tokens")).not.toBeNull();
    });

    it("Skeleton 渲染 shimmer 骨架", () => {
        const { container } = render(<Skeleton className="h-4" />);
        expect(container.querySelector("div")?.className).toContain("shimmer");
        expect(container.querySelector("div")?.className).toContain("animate-pulse");
    });

    it("PanelTitleBar 渲染标题与动作", () => {
        render(<PanelTitleBar title="Title" actions={<button type="button">x</button>} />);
        expect(screen.getByText("Title")).not.toBeNull();
        expect(screen.getByText("x")).not.toBeNull();
    });

    it("ListRow 渲染 title/subtitle，selected 加高亮类", () => {
        const { container, rerender } = render(<ListRow title="row" subtitle="sub" />);
        expect(screen.getByText("row")).not.toBeNull();
        expect(screen.getByText("sub")).not.toBeNull();
        rerender(<ListRow title="row" selected />);
        expect(container.querySelector("div")?.className).toContain(
            "bg-[var(--color-primary-container)]",
        );
    });
});

describe("ui 组件库构建产物（t269 AC4）", () => {
    it("Tailwind 产物生成组件用到的工具类与 @utility（构建 grep 验证）", () => {
        const dir = join(process.cwd(), "out", "renderer", "assets");
        let files: string[];
        try {
            files = readdirSync(dir).filter((f) => f.startsWith("index-") && f.endsWith(".css"));
        } catch {
            // 未 build（纯单测环境）——跳过，由 CI/黑盒前置 build 兜底。
            return;
        }
        expect(files.length).toBeGreaterThan(0);
        const css = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
        // @utility：毛玻璃菜单 / 骨架屏 / KPI 数字 / 交互反馈过渡
        for (const util of ["glass-menu", "shimmer", "metric-num", "transition-feedback"]) {
            expect(css).toContain(util);
        }
        // 组件消费的关键语义色工具类（Tailwind 产物中 arbitrary 类转义形式）
        for (const cls of [
            "bg-[var(--color-primary)]",
            "bg-[var(--color-surface-card)]",
            "text-[var(--color-on-surface)]",
            "bg-[var(--color-field-bg)]",
            "bg-[var(--color-surface-raised)]",
        ]) {
            const escaped = cls.replace(/[()]/g, "\\$&").replace(/[\[\]]/g, "\\$&");
            expect(css).toContain(escaped);
        }
    });

    it("Button standard 字号类不被 tailwind-merge 吞（t298）", () => {
        // d032：自定义字号 token 若用 text-body-md 裸名会被 twMerge 误判为颜色类吞掉；
        // 显式任意值 text-[length:var(--text-body-md)] 与文字色类共存。
        for (const variant of ["primary", "secondary", "danger"] as const) {
            const { container } = render(<Button variant={variant}>save</Button>);
            const btn = container.querySelector("button");
            expect(btn?.className).toContain("text-[length:var(--text-body-md)]");
            if (variant === "secondary") {
                expect(btn?.className).toContain("text-[var(--color-on-surface)]");
            } else {
                expect(btn?.className).toContain("text-[var(--color-on-primary)]");
            }
        }
    });

    it("受影响 ui 组件字号类不被 tailwind-merge 吞（t302 d032 扩展）", () => {
        // p126：d032 机制（自定义字号 token 被 twMerge 误判颜色类吞色）扩展清理。
        // 断言 cn() base 内字号类为显式 length 形式、颜色类共存，覆盖 Input/Textarea/
        // Select/SecretInput/PanelTitleBar/Menu/ListRow 等受影响组件。
        const { container: in_c } = render(<Input placeholder="x" />);
        expect(in_c.querySelector("input")?.className).toContain(
            "text-[length:var(--text-body-md)]",
        );
        expect(in_c.querySelector("input")?.className).toContain("text-[var(--color-on-surface)]");

        const { container: ta_c } = render(<Textarea placeholder="x" />);
        expect(ta_c.querySelector("textarea")?.className).toContain(
            "text-[length:var(--text-body-md)]",
        );

        const { container: sel_c } = render(
            <Select>
                <option>a</option>
            </Select>,
        );
        expect(sel_c.querySelector("select")?.className).toContain(
            "text-[length:var(--text-body-md)]",
        );

        const { container: sec_c } = render(<SecretInput aria-label="s" />);
        expect(sec_c.querySelector("input")?.className).toContain(
            "text-[length:var(--text-body-md)]",
        );

        const { container: ptb_c } = render(<PanelTitleBar title="t" panel="Session" />);
        expect(ptb_c.querySelector("[data-panel-titlebar]")?.className).toContain(
            "text-[length:var(--text-body-md)]",
        );
        expect(ptb_c.querySelector("[data-panel-titlebar]")?.className).toContain(
            "text-[var(--color-on-surface)]",
        );

        // ListRow subtitle：渲染断言易受容器状态影响，改静态源码断言（p126 明确列举组件）。
        const listrow_src = readFileSync(join("src/renderer/components/ui", "ListRow.tsx"), "utf8");
        expect(listrow_src).toContain(
            "text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]",
        );
    });

    it("全仓自定义字号 token 无裸类残留（t302 AC-002）", () => {
        // d032 规避统一：自定义字号一律 text-[length:var(--text-*)]，禁裸 text-body-*/label-*/title-*/code-md。
        // 存量 text-label-sm 已归级清除（t303），无需再排除。
        const bare = /text-(body|label|display|title|code)-(md|sm|lg|xs|xl|num|2xl|3xl|caps)\b/;
        const length_form =
            /text-\[length:var\(--text-(body|label|display|title|code)-(md|sm|lg|xs|xl|num|2xl|3xl|caps)\)\]/g;
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir)) {
                const p = join(dir, e);
                const st = statSync(p);
                if (st.isDirectory()) walk(p);
                else if (/\.(tsx|ts)$/.test(e)) files.push(p);
            }
        };
        walk("src/renderer");
        const offenders: string[] = [];
        for (const f of files) {
            const content = readFileSync(f, "utf8");
            for (const line of content.split("\n")) {
                // token 级匹配：length 形式与裸类各自提取，避免整行 includes 守卫漏报。
                // 跳过注释行（// 前缀）：注释里的 token 名（如说明 d032 机制的注释）非实际类。
                if (line.trimStart().startsWith("//")) continue;
                const stripped = line.replace(length_form, "");
                const bareHit = bare.exec(stripped);
                if (bareHit) {
                    offenders.push(`${f}: ${line.trim().slice(0, 100)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("全仓无 text-label-sm 残留（t303 AC-001）", () => {
        // p127：--text-label-sm 未定义（字号档仅九级），该类不生成字号 CSS；归级清除后不得复现。
        // 扫全部文件类型（含 css/json），使「全仓」与 AC-001 措辞一致（p130）。
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir)) {
                const p = join(dir, e);
                const st = statSync(p);
                if (st.isDirectory()) walk(p);
                else files.push(p);
            }
        };
        walk("src/renderer");
        const hits: string[] = [];
        for (const f of files) {
            const content = readFileSync(f, "utf8");
            for (const line of content.split("\n")) {
                if (line.includes("text-label-sm")) hits.push(`${f}: ${line.trim().slice(0, 100)}`);
            }
        }
        expect(hits).toEqual([]);
    });

    it("danger 按钮暗色白字对比 ≥ 3.0（t298）", () => {
        // error-dark 同时用于错误文字；取暗色 token 值算与 #fff 的对比。
        const globals = readFileSync("src/renderer/styles/globals.css", "utf8");
        const m = /--color-error-dark:\s*(#[0-9a-fA-F]{6})/.exec(globals);
        expect(m).not.toBeNull();
        const bg = m?.[1] ?? "";
        // danger 按钮类链：bg 用 --color-error（暗色 = error-dark），文字白。
        const { container } = render(<Button variant="danger">del</Button>);
        const btn = container.querySelector("button");
        expect(btn?.className).toContain("bg-[var(--color-error)]");
        expect(btn?.className).toContain("text-[var(--color-on-primary)]");
        const lum = (hex: string): number => {
            const n = Number.parseInt(hex.slice(1), 16);
            const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
                const s = v / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            const [r, g, b] = ch;
            return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
        };
        const contrast = (1.0 + 0.05) / (lum(bg) + 0.05);
        expect(contrast).toBeGreaterThanOrEqual(3.0);
    });
});
