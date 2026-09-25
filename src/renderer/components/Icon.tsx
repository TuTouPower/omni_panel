import { type CSSProperties } from "react";
import {
    type LucideIcon,
    BarChart3,
    Bell,
    BellOff,
    BookOpen,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clipboard,
    ClockArrowUp,
    CloudOff,
    Code,
    CircleAlert,
    Columns2,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    File,
    Folder,
    Globe,
    GripVertical,
    Heart,
    History,
    Inbox,
    Info,
    Layers,
    LayoutGrid,
    Lock,
    LogOut,
    Maximize2,
    MessageCircle,
    Minus,
    Moon,
    MoreVertical,
    Palette,
    Pause,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    Search,
    Settings,
    Shield,
    Sun,
    Tag,
    Trash2,
    X,
} from "lucide-react";
import antigravity_svg from "../assets/vendor_logos/antigravity.svg";
import claude_svg from "../assets/vendor_logos/claude.svg";
import codex_svg from "../assets/vendor_logos/codex.svg";
import commandcode_svg from "../assets/vendor_logos/commandcode.svg";
import cpa_png from "../assets/vendor_logos/cpa.png";
import deepseek_svg from "../assets/vendor_logos/deepseek.svg";
import exa_light_png from "../assets/vendor_logos/exa_light.png";
import exa_dark_png from "../assets/vendor_logos/exa_dark.png";
import firecrawl_svg from "../assets/vendor_logos/firecrawl.svg";
import getoneapi_png from "../assets/vendor_logos/getoneapi.png";
import glm_svg from "../assets/vendor_logos/glm.svg";
import grok_light_svg from "../assets/vendor_logos/grok_light.svg";
import grok_dark_svg from "../assets/vendor_logos/grok_dark.svg";
import kimi_svg from "../assets/vendor_logos/kimi.svg";
import minimax_svg from "../assets/vendor_logos/minimax.svg";
import opencode_go_dark_svg from "../assets/vendor_logos/opencode_go_dark.svg";
import opencode_go_light_svg from "../assets/vendor_logos/opencode_go_light.svg";
import muse_png from "../assets/vendor_logos/muse.png";
import mimo_svg from "../assets/vendor_logos/mimo.svg";
import tavily_svg from "../assets/vendor_logos/tavily.svg";
import tikhub_jpeg from "../assets/vendor_logos/tikhub.jpeg";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("renderer:icon");

// 操作/导航图标统一来自 lucide-react（t274 收口手绘 SVG 图标集）。
const UI_ICONS = {
    refresh: RefreshCw,
    gear: Settings,
    more: MoreVertical,
    grip: GripVertical,
    back: ChevronLeft,
    chev_down: ChevronDown,
    minus: Minus,
    maximize: Maximize2,
    info: Info,
    plus: Plus,
    trash: Trash2,
    edit: Pencil,
    cloud_off: CloudOff,
    lock: Lock,
    inbox: Inbox,
    power: Power,
    pause: Pause,
    open: ExternalLink,
    download: Download,
    check: Check,
    exit: LogOut,
    bell: Bell,
    bell_off: BellOff,
    palette: Palette,
    shield: Shield,
    grid_nav: LayoutGrid,
    close: X,
    eye: Eye,
    eye_off: EyeOff,
    chevron: ChevronRight,
    external_link: ExternalLink,
    globe: Globe,
    chart: BarChart3,
    clipboard: Clipboard,
    heart: Heart,
    search: Search,
    history: History,
    folder: Folder,
    file: File,
    tag: Tag,
    book: BookOpen,
    code: Code,
    // 会话库「同屏最近」内联图标。
    columns2: Columns2,
    // 用量面板（面板间导航，时间快进）。
    feedback: MessageCircle,
    clock_forward: ClockArrowUp,
    // 明/暗主题切换（sun / moon）与会话库空态（layers）。
    sun: Sun,
    moon: Moon,
    layers: Layers,
    // 登录/授权错误提示。
    alert_circle: CircleAlert,
} satisfies Record<string, LucideIcon>;

/** t359 AC-002: 已注册图标名联合；chat_square 为手绘例外（见 ChatSquareIcon）。 */
export type IconName = keyof typeof UI_ICONS | "chat_square";

/**
 * t313: chat_square 例外恢复 t274 前手绘聊天气泡（p131）。t274 将操作图标
 * 整体收口 lucide，但会话面板入口的聊天气泡保留手绘特征（双气泡圆角 path），
 * 其余图标一律 lucide；Agent chart / Settings gear 不在此例外内。
 * path 取自 t274 删除的手绘气泡素材特征数据（归档可查）。
 */
function ChatSquareIcon({ size }: { size: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M10 15L6.92474 18.1137C6.49579 18.548 6.28131 18.7652 6.09695 18.7805C5.93701 18.7938 5.78042 18.7295 5.67596 18.6076C5.55556 18.4672 5.55556 18.162 5.55556 17.5515V15.9916C5.55556 15.444 5.10707 15.0477 4.5652 14.9683V14.9683C3.25374 14.7762 2.22378 13.7463 2.03168 12.4348C2 12.2186 2 11.9605 2 11.4444V6.8C2 5.11984 2 4.27976 2.32698 3.63803C2.6146 3.07354 3.07354 2.6146 3.63803 2.32698C4.27976 2 5.11984 2 6.8 2H14.2C15.8802 2 16.7202 2 17.362 2.32698C17.9265 2.6146 18.3854 3.07354 18.673 3.63803C19 4.27976 19 5.11984 19 6.8V11M19 22L16.8236 20.4869C16.5177 20.2742 16.3647 20.1678 16.1982 20.0924C16.0504 20.0255 15.8951 19.9768 15.7356 19.9474C15.5558 19.9143 15.3695 19.9143 14.9969 19.9143H13.2C12.0799 19.9143 11.5198 19.9143 11.092 19.6963C10.7157 19.5046 10.4097 19.1986 10.218 18.8223C10 18.3944 10 17.8344 10 16.7143V14.2C10 13.0799 10 12.5198 10.218 12.092C10.4097 11.7157 10.7157 11.4097 11.092 11.218C11.5198 11 12.0799 11 13.2 11H18.8C19.9201 11 20.4802 11 20.908 11.218C21.2843 11.4097 21.5903 11.7157 21.782 12.092C22 12.5198 22 13.0799 22 14.2V16.9143C22 17.8462 22 18.3121 21.8478 18.6797C21.6448 19.1697 21.2554 19.5591 20.7654 19.762C20.3978 19.9143 19.9319 19.9143 19 19.9143V22Z"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

interface IconProps {
    name: IconName;
    size?: number;
    strokeWidth?: number;
    color?: string;
    style?: CSSProperties;
    className?: string;
    /** t333: 状态驱动标记，透传到 svg（如斜杠显隐断言）。 */
    "data-slash"?: string | undefined;
}

export function Icon({
    name,
    size = 18,
    strokeWidth = 1.7,
    color,
    style,
    className,
    "data-slash": data_slash,
}: IconProps) {
    if (name === "chat_square") {
        // t313: chat_square 手绘气泡例外（见 ChatSquareIcon）；其余参数对齐 lucide 渲染。
        return <ChatSquareIcon size={size} />;
    }
    const IconComponent = UI_ICONS[name];
    // t359 AC-002: 运行时防御——外部动态 name 注入（绕过 tsc）时回空 SVG + dev 告警。
    // eslint 因 tsc 收窄判恒假，此处属跨边界运行时防御，禁用该 lint。
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!IconComponent) {
        if (import.meta.env.DEV) {
            // A69: 替换 console.warn 为统一的 renderer:icon logger
            log.warn(`Icon: unregistered name "${name}"`);
        }
        // 未知 name：保持空 SVG、不崩溃。
        return (
            <svg
                viewBox="0 0 24 24"
                width={size}
                height={size}
                fill="none"
                stroke={color ?? "currentColor"}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={className}
                style={style}
                data-slash={data_slash}
            />
        );
    }
    return (
        <IconComponent
            size={size}
            strokeWidth={strokeWidth}
            color={color}
            className={className}
            style={style}
            data-slash={data_slash}
        />
    );
}

// A110: Icon 单源注册表重构，消除三表分离与特例维护
export type VendorRegistryEntry =
    | { type: "theme"; light: string; dark: string }
    | { type: "logo"; src: string }
    | { type: "mark"; render: (s: number) => string };

export const VENDOR_REGISTRY: Record<string, VendorRegistryEntry> = {
    // Theme logos
    exa: { type: "theme", light: exa_light_png, dark: exa_dark_png },
    opencode_go: { type: "theme", light: opencode_go_light_svg, dark: opencode_go_dark_svg },
    grok: { type: "theme", light: grok_light_svg, dark: grok_dark_svg },
    grok_bot: { type: "theme", light: grok_light_svg, dark: grok_dark_svg },

    // Static logos (A68: mimo 已归位统一使用 mimo_svg 资产文件)
    claude: { type: "logo", src: claude_svg },
    codex: { type: "logo", src: codex_svg },
    commandcode: { type: "logo", src: commandcode_svg },
    antigravity: { type: "logo", src: antigravity_svg },
    kimi: { type: "logo", src: kimi_svg },
    kimi_web: { type: "logo", src: kimi_svg },
    glm: { type: "logo", src: glm_svg },
    deepseek: { type: "logo", src: deepseek_svg },
    getoneapi: { type: "logo", src: getoneapi_png },
    minimax: { type: "logo", src: minimax_svg },
    tavily: { type: "logo", src: tavily_svg },
    firecrawl: { type: "logo", src: firecrawl_svg },
    tikhub: { type: "logo", src: tikhub_jpeg },
    cpa: { type: "logo", src: cpa_png },
    muse: { type: "logo", src: muse_png },
    mimo: { type: "logo", src: mimo_svg },

    // SVG marks fallback
    overview: {
        type: "mark",
        render: (s) =>
            `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
            `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/>` +
            `<rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>`,
    },
};

export type VendorId = string;

interface VendorMarkProps {
    id: VendorId;
    size?: number;
    color?: string;
}

export function VendorMark({ id, size = 28, color }: VendorMarkProps) {
    // wrapper：t274 由全局 .vicon 迁为组件内 utility。logo 明暗切换用 dark:
    // 变体（t268 @custom-variant）在组件内封装，globals.css 不再保留业务选择器。
    // t316：wrapper 不再声明 `[&_img]:block`——它编译为 `.\[\&_img\]\:block img`
    // （特异性 (0,1,1)），高于 img 自身 hidden/dark:hidden/dark:block（(0,1,0)），
    // 导致亮暗两主题下两张 logo 同时显示。基础 `block` 下沉到 logo_img 与状态类
    // 同层（(0,1,0)），同层后声明的 hidden 才能正确覆盖 display。
    const wrap = "flex shrink-0 items-center justify-center [&_svg]:block";
    const logo_img = "block h-full w-full object-contain";
    const entry = VENDOR_REGISTRY[id] ?? VENDOR_REGISTRY["overview"];
    if (!entry) return null;

    if (entry.type === "theme") {
        return (
            <span className={wrap} style={{ width: size, height: size }} data-testid="vendor-mark">
                <img className={logo_img + " dark:hidden"} src={entry.light} alt="" />
                <img className={logo_img + " hidden dark:block"} src={entry.dark} alt="" />
            </span>
        );
    }

    if (entry.type === "logo") {
        return (
            <span className={wrap} style={{ width: size, height: size }} data-testid="vendor-mark">
                <img className={logo_img} src={entry.src} alt="" />
            </span>
        );
    }

    return (
        <span
            className={wrap}
            style={{ width: size, height: size, color: color ?? undefined }}
            data-testid="vendor-mark"
            dangerouslySetInnerHTML={{ __html: entry.render(size) }}
        />
    );
}
