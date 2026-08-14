import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon, VendorMark, type IconName } from "../../../../src/renderer/components/Icon";

const ICON_SOURCE = readFileSync(join(process.cwd(), "src/renderer/components/Icon.tsx"), "utf8");

describe("Icon", () => {
    it("renders an SVG element", () => {
        const { container } = render(<Icon name="refresh" />);
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
    });

    it("alert_circle 渲染非空 SVG（登录错误提示图标，t359 AC-001）", () => {
        const { container } = render(<Icon name="alert_circle" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        // 注册后应有真实图标 path（非空 SVG）。
        expect(svg?.innerHTML).not.toBe("");
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

    it("renders empty path for unregistered name at runtime (t359: dev warn + empty SVG)", () => {
        // tsc 已把 name 收窄为 IconName，未注册名无法静态传入；此用例以运行时
        // 注入模拟（如外部动态 name），验证空 SVG + dev 告警防御。
        const { container } = render(<Icon name={"nonexistent" as unknown as IconName} />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.innerHTML).toBe("");
    });

    it("chat_square 渲染 t274 前手绘聊天气泡特征 path（非 lucide MessageSquare）（AC-007）", () => {
        const { container } = render(<Icon name="chat_square" />);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        // message-chat-square.svg 手绘双气泡 path 起始段（t274 前资产特征数据）。
        expect(svg?.innerHTML).toContain('d="M10 15L6.92474 18.1137');
        // 手绘气泡用 fill="none" + stroke，无 lucide MessageSquare 的矩形/缺角形状特征。
        expect(svg?.innerHTML).not.toContain("M21 15a2 2 0 0 1-2 2H7l-4 4V5");
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
            /const UI_ICONS\s*=\s*\{([\s\S]*?)\n\}\s*satisfies\s*Record<string,\s*LucideIcon>/.exec(
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

    it("渲染层所有 <Icon name> 引用均注册于 UI_ICONS（t359 AC-003）", () => {
        // 从 UI_ICONS 映射块提取注册键（左侧小写标识符）。
        const map_body =
            /const UI_ICONS\s*=\s*\{([\s\S]*?)\n\}\s*satisfies\s*Record<string,\s*LucideIcon>/.exec(
                ICON_SOURCE,
            );
        expect(map_body).not.toBeNull();
        const registered = new Set<string>();
        for (const m of (map_body?.[1] ?? "").matchAll(/\b([a-z_]+):\s*[A-Z]/g)) {
            registered.add(m[1] ?? "");
        }
        // chat_square 手绘例外不在 UI_ICONS。
        registered.add("chat_square");
        expect(registered.size).toBeGreaterThan(10);

        // 递归扫描 src/renderer 下 tsx，收集 <Icon name="…"> 字面量。
        const walk = (dir: string): string[] => {
            const out: string[] = [];
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, entry.name);
                if (entry.isDirectory()) out.push(...walk(p));
                else if (entry.name.endsWith(".tsx")) out.push(p);
            }
            return out;
        };
        const used = new Set<string>();
        const icon_ref = /<Icon\b[^>]*\bname="([a-z_]+)"/g;
        for (const file of walk(join(process.cwd(), "src/renderer"))) {
            for (const m of readFileSync(file, "utf8").matchAll(icon_ref)) {
                used.add(m[1] ?? "");
            }
        }
        expect(used.size).toBeGreaterThan(10);
        const missing = [...used].filter((n) => !registered.has(n));
        expect(missing).toEqual([]);
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

    it("keeps wrapper display rules from overriding img theme states (t316)", () => {
        // t316：`[&_img]:block` 编译为 `.\[\&_img\]\:block img`（特异性 (0,1,1)），
        // 高于 img 自身 `hidden`/`dark:hidden`/`dark:block`（(0,1,0)），light/dark
        // 两主题下两张 logo 同时显示。修复：wrapper 不再声明 img display，
        // 基础 `block` 下沉到 img 自身与状态类同层，后者才能覆盖 display。
        const { container } = render(<VendorMark id="exa" />);
        const wrap = container.querySelector('[data-testid="vendor-mark"]');
        const light_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="exa_light"]',
        );
        const dark_image = container.querySelector(
            '[data-testid="vendor-mark"] img[src*="exa_dark"]',
        );

        expect(wrap?.getAttribute("class")).not.toContain("[&_img]:block");
        expect(wrap?.getAttribute("class")).toContain("[&_svg]:block");
        expect(light_image).toHaveClass("block");
        expect(dark_image).toHaveClass("block");
        expect(light_image).toHaveClass("dark:hidden");
        expect(dark_image).toHaveClass("hidden");
        expect(dark_image).toHaveClass("dark:block");
    });

    it("keeps single-logo provider rendering intact (t316 AC-004)", () => {
        const { container } = render(<VendorMark id="deepseek" size={26} />);
        const wrap = container.querySelector('[data-testid="vendor-mark"]');
        const image = container.querySelector('[data-testid="vendor-mark"] img');

        // 单图分支同样受益：无 hidden 状态类时 img 自身 `block` 保证布局，
        // 不依赖 wrapper 的 `[&_img]:block`（t316 已移除）。
        expect(image).toHaveClass("block");
        expect(image).toHaveClass("h-full");
        expect(image).toHaveClass("object-contain");
        expect(wrap?.getAttribute("style")).toContain("width: 26px");
        expect(wrap?.getAttribute("style")).toContain("height: 26px");
        expect(image).not.toHaveAttribute("width");
        expect(image).not.toHaveAttribute("height");
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
