import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon, VendorMark } from "../../../../src/renderer/components/Icon";

const ICON_SOURCE = readFileSync(join(process.cwd(), "src/renderer/components/Icon.tsx"), "utf8");

describe("Icon", () => {
    it("renders an SVG element", () => {
        const { container } = render(<Icon name="refresh" />);
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
    });

    it("uses default size of 18", () => {
        const { container } = render(<Icon name="gear" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("18");
        expect(svg?.getAttribute("height")).toBe("18");
    });

    it("accepts custom size", () => {
        const { container } = render(<Icon name="close" size={24} />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("24");
        expect(svg?.getAttribute("height")).toBe("24");
    });

    it("accepts custom color", () => {
        const { container } = render(<Icon name="check" color="red" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("stroke")).toBe("red");
    });

    it("applies custom className", () => {
        const { container } = render(<Icon name="back" className="my-icon" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("class")).toContain("my-icon");
    });

    it("renders empty path for unknown icon name", () => {
        const { container } = render(<Icon name="nonexistent" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.innerHTML).toBe("");
    });
});

describe("Icon 来源守卫（t274 AC2）", () => {
    it("UI_ICONS 映射值全部来自 lucide-react import", () => {
        // 以首个符号 `type LucideIcon` 锚定 lucide 导入块，避免误吞 react import。
        const lucide_import =
            /import\s*\{\s*type\s+LucideIcon,?([\s\S]*?)\}\s*from\s*["']lucide-react["']/.exec(
                ICON_SOURCE,
            );
        expect(lucide_import, "lucide-react import 缺失").not.toBeNull();
        const imported = new Set(
            ["type LucideIcon", ...(lucide_import?.[1] ?? "").split(",")]
                .map((s) => s.trim())
                .map((s) => (s.startsWith("type ") ? s.slice(5) : s))
                .filter((s) => s.length > 0),
        );
        expect(imported.has("LucideIcon")).toBe(true);

        const map_body =
            /const UI_ICONS:\s*Record<string,\s*LucideIcon>\s*=\s*\{([\s\S]*?)\n\};/.exec(
                ICON_SOURCE,
            );
        expect(map_body, "UI_ICONS 映射块缺失").not.toBeNull();
        // 映射块内引用的大写标识符（lucide 组件名；注释中的小写词不匹配）。
        const rhs_identifiers = (map_body?.[1] ?? "").match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [];
        expect(rhs_identifiers.length).toBeGreaterThan(0);
        const not_from_lucide = rhs_identifiers.filter((id) => !imported.has(id));
        expect(not_from_lucide).toEqual([]);
    });

    it("不再引用 src/renderer/assets/ui 旧手绘图标素材", () => {
        // vendor logo 资产（assets/vendor_logos）与数据可视化 SVG 不在禁列，
        // 此处只断言操作/导航图标不再回退旧手绘素材目录。
        expect(ICON_SOURCE).not.toContain("assets/ui");
        expect(ICON_SOURCE).not.toContain("clock-fast-forward");
        expect(ICON_SOURCE).not.toContain("message-chat-square");
    });
});

describe("VendorMark", () => {
    it("renders a span with vendor-mark testid", () => {
        const { container } = render(<VendorMark id="claude" />);
        const span = container.querySelector('[data-testid="vendor-mark"]');
        expect(span).toBeInTheDocument();
    });

    it("renders an official logo image for known vendor", () => {
        const { container } = render(<VendorMark id="deepseek" />);
        const image = container.querySelector('[data-testid="vendor-mark"] img');
        expect(image).toBeInTheDocument();
        expect(image?.getAttribute("src")).toContain("deepseek");
    });

    it("fits image logos inside a square transparent canvas", () => {
        const { container } = render(<VendorMark id="deepseek" size={26} />);
        const span = container.querySelector('[data-testid="vendor-mark"]');
        const image = container.querySelector('[data-testid="vendor-mark"] img');

        expect(span?.getAttribute("style")).toContain("width: 26px");
        expect(span?.getAttribute("style")).toContain("height: 26px");
        expect(image).toHaveClass("object-contain");
        expect(image).not.toHaveAttribute("width");
        expect(image).not.toHaveAttribute("height");
    });

    it("renders MiMo as inline SVG so currentColor can inherit", () => {
        const { container } = render(<VendorMark id="mimo" />);
        const svg = container.querySelector('[data-testid="vendor-mark"] svg');
        const image = container.querySelector('[data-testid="vendor-mark"] img');

        expect(svg).toBeInTheDocument();
        expect(image).not.toBeInTheDocument();
        expect(svg?.getAttribute("fill")).toBe("currentColor");
        expect(svg?.querySelector("title")?.textContent).toBe("XiaomiMiMo");
        expect(svg?.querySelector("rect")).not.toBeInTheDocument();
    });

    it("uses the official XiaomiMiMo logo asset without a fixed orange background", () => {
        const svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/mimo.svg"),
            "utf8",
        );

        expect(svg).toContain("<title>XiaomiMiMo</title>");
        expect(svg).toContain('fill="currentColor"');
        expect(svg).not.toContain("#ff6900");
        expect(svg).not.toContain("<rect");
    });

    it("renders the official Firecrawl logo asset", () => {
        const { container } = render(<VendorMark id="firecrawl" />);
        const image = container.querySelector('[data-testid="vendor-mark"] img');
        const svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/firecrawl.svg"),
            "utf8",
        );

        expect(image).toBeInTheDocument();
        expect(image).toHaveClass("object-contain");
        expect(image?.getAttribute("src")).toContain("firecrawl");
        expect(svg).toContain("Firecrawl");
    });

    it("renders official opencode logos for both themes", () => {
        const { container } = render(<VendorMark id="opencode_go" />);
        const light_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="opencode_go_light"]',
        );
        const dark_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="opencode_go_dark"]',
        );
        const light_svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/opencode_go_light.svg"),
            "utf8",
        );
        const dark_svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/opencode_go_dark.svg"),
            "utf8",
        );

        expect(light_image).toBeInTheDocument();
        expect(dark_image).toBeInTheDocument();
        expect(light_image).toHaveClass("object-contain");
        expect(dark_image).toHaveClass("object-contain");
        expect(light_image).not.toHaveAttribute("width");
        expect(light_image).not.toHaveAttribute("height");
        expect(dark_image).not.toHaveAttribute("width");
        expect(dark_image).not.toHaveAttribute("height");
        expect(light_image?.getAttribute("src")).toContain("opencode_go_light");
        expect(dark_image?.getAttribute("src")).toContain("opencode_go_dark");
        expect(light_svg).toContain("fill='#211E1E'");
        expect(dark_svg).toContain("fill='#F1ECEC'");
    });

    it("renders official Grok logos for both themes", () => {
        const { container } = render(<VendorMark id="grok" />);
        const light_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="grok_light"]',
        );
        const dark_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="grok_dark"]',
        );
        const light_svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/grok_light.svg"),
            "utf8",
        );
        const dark_svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/grok_dark.svg"),
            "utf8",
        );

        const official_light_hash =
            "9175fc90c22655160231976c849f25a03b888d7cc0e04c5f1b987b659bb07c95";
        const light_hash = createHash("sha256")
            .update(light_svg.replace(/\r\n/g, "\n"))
            .digest("hex");

        expect(light_image?.getAttribute("src")).toContain("grok_light");
        expect(dark_image?.getAttribute("src")).toContain("grok_dark");
        expect(container.querySelector('[data-testid="vendor-mark"] svg')).not.toBeInTheDocument();
        expect(light_hash).toBe(official_light_hash);
        expect(dark_svg).toContain("<title>Grok</title>");
        expect(dark_svg).toContain('fill="#fff"');
        expect(/<path d="([^"]+)"/.exec(light_svg)?.[1]).toBe(
            /<path d="([^"]+)"/.exec(dark_svg)?.[1],
        );
    });

    it("encapsulates theme logo switching in the component (light hidden in dark)", () => {
        const { container } = render(<VendorMark id="opencode_go" />);
        const light_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="opencode_go_light"]',
        );
        const dark_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="opencode_go_dark"]',
        );
        // 明暗切换由组件内 dark: 变体 utility 封装（t268 @custom-variant），
        // globals.css 不再有 .vicon/.vendor-logo-* 业务选择器。
        expect(light_image).toHaveClass("dark:hidden");
        expect(dark_image).toHaveClass("hidden");
        expect(dark_image).toHaveClass("dark:block");
    });

    it("stores the official Zhipu logo asset for glm", () => {
        const svg = readFileSync(
            join(process.cwd(), "src/renderer/assets/vendor_logos/glm.svg"),
            "utf8",
        );

        expect(svg).toContain("<title>Zhipu</title>");
        expect(svg).not.toContain("<title>ChatGLM</title>");
        expect(svg).toContain('fill="#3859FF"');
    });

    it("renders cpa as img logo (CLIProxyAPI, t093)", () => {
        const { container } = render(<VendorMark id="cpa" color="red" />);
        const img = container.querySelector('[data-testid="vendor-mark"] img');
        expect(img).toBeTruthy();
        if (!img) return;
        expect(img.getAttribute("src")).toContain("cpa");
    });

    it("renders overview SVG as default for overview id", () => {
        const { container } = render(<VendorMark id="overview" />);
        const inner = container.querySelector('[data-testid="vendor-mark"] svg');
        expect(inner).toBeInTheDocument();
    });

    it("accepts custom size", () => {
        const { container } = render(<VendorMark id="claude" size={40} />);
        const span = container.querySelector('[data-testid="vendor-mark"]');
        expect(span).not.toBeNull();
        expect(span?.getAttribute("style")).toContain("width: 40px");
        expect(span?.getAttribute("style")).toContain("height: 40px");
    });
});
