import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
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
        const { container } = render(
            <Switch checked={checked} onChange={(v) => (checked = v)} aria-label="sw" />,
        );
        const btn = container.querySelector("button");
        expect(btn?.getAttribute("aria-checked")).toBe("false");
        if (!btn) throw new Error("switch button missing");
        fireEvent.click(btn);
        expect(checked).toBe(true);
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
        expect(items[1]?.className).toContain("text-[var(--color-error)]");
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
        expect(thin?.className).toContain("h-1");
        rerender(<Progress value={0.3} variant="capsule" label="30%" />);
        const cap = container.querySelector('[role="progressbar"]');
        expect(cap?.className).toContain("h-6");
        expect(screen.getByText("30%")).not.toBeNull();
        // 0.3 → success 色（低风险）
        const fill = cap?.querySelector("div");
        expect(fill?.getAttribute("style")).toContain("color-success");
    });

    it("Badge count/label 双形态", () => {
        const { container, rerender } = render(<Badge>5</Badge>);
        expect(container.querySelector("span")?.className).toContain("rounded-full");
        rerender(
            <Badge variant="label" color="#e85d3d">
                claude
            </Badge>,
        );
        expect(container.querySelector("span")?.className).toContain("rounded-md");
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
});
