import { type CSSProperties } from "react";
import {
    type LucideIcon,
    BarChart3,
    Bell,
    BookOpen,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clipboard,
    ClockArrowUp,
    CloudOff,
    Code,
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
import tavily_svg from "../assets/vendor_logos/tavily.svg";
import tikhub_jpeg from "../assets/vendor_logos/tikhub.jpeg";

// 操作/导航图标统一来自 lucide-react（t274 收口手绘 SVG 图标集）。
const UI_ICONS: Record<string, LucideIcon> = {
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
    // 用量面板（面板间导航，时间快进）。
    feedback: MessageCircle,
    clock_forward: ClockArrowUp,
    // 明/暗主题切换（sun / moon）与会话库空态（layers）。
    sun: Sun,
    moon: Moon,
    layers: Layers,
};

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
    name: string;
    size?: number;
    strokeWidth?: number;
    color?: string;
    style?: CSSProperties;
    className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, color, style, className }: IconProps) {
    if (name === "chat_square") {
        // t313: chat_square 手绘气泡例外（见 ChatSquareIcon）；其余参数对齐 lucide 渲染。
        return <ChatSquareIcon size={size} />;
    }
    const IconComponent = UI_ICONS[name];
    if (!IconComponent) {
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
        />
    );
}

/* ── Vendor marks (SVG placeholder icons, used when no official logo available) ── */
const VENDOR_THEME_LOGOS: Partial<Record<string, { light: string; dark: string }>> = {
    exa: {
        light: exa_light_png,
        dark: exa_dark_png,
    },
    opencode_go: {
        light: opencode_go_light_svg,
        dark: opencode_go_dark_svg,
    },
    grok: {
        light: grok_light_svg,
        dark: grok_dark_svg,
    },
};

const VENDOR_LOGOS: Record<string, string> = {
    claude: claude_svg,
    codex: codex_svg,
    antigravity: antigravity_svg,
    kimi: kimi_svg,
    glm: glm_svg,
    deepseek: deepseek_svg,
    getoneapi: getoneapi_png,
    minimax: minimax_svg,
    tavily: tavily_svg,
    firecrawl: firecrawl_svg,
    tikhub: tikhub_jpeg,
    cpa: cpa_png,
};

const VENDOR_MARKS: Record<string, (s: number) => string> = {
    overview: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
        `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/>` +
        `<rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>`,
    claude: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24"><g stroke="currentColor" stroke-width="2" stroke-linecap="round">` +
        `<line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>` +
        `<line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="5.6" y2="18.4"/>` +
        `<line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(22.5 12 12)"/>` +
        `<line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(67.5 12 12)"/></g>` +
        `<circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>`,
    codex: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none">` +
        `<path d="M12 2.6l8 4.4v9.9l-8 4.5-8-4.5V7z" fill="#eef1ff" stroke="#6172f3" stroke-width="1.4"/>` +
        `<path d="M12 12.4l8-4.6M12 12.4v9.1M12 12.4L4 7.8" stroke="#6172f3" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M12 2.6l8 4.4-8 5.4-8-5.4z" fill="#8b9bff"/></svg>`,
    antigravity: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
        `<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M4 12c2-5 14-5 16 0M4 12c2 5 14 5 16 0"/>` +
        `<path d="M12 4c5 2 5 14 0 16M12 4c-5 2-5 14 0 16"/></svg>`,
    kimi: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none">` +
        `<rect x="4" y="4" width="16" height="16" rx="5" fill="#111827"/>` +
        `<path d="M8 16V8h2v3l3-3h2.5l-3.4 3.6L16 16h-2.7l-2.6-3.2-.7.7V16z" fill="#fff"/></svg>`,
    glm: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="#3d7afd">` +
        `<circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/>` +
        `<circle cx="4" cy="8" r="1.5"/><circle cx="20" cy="8" r="1.5"/>` +
        `<circle cx="4" cy="16" r="1.5"/><circle cx="20" cy="16" r="1.5"/>` +
        `<circle cx="12" cy="12" r="2.4"/><circle cx="7" cy="12" r="1.2" opacity=".6"/><circle cx="17" cy="12" r="1.2" opacity=".6"/></svg>`,
    deepseek: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none">` +
        `<path d="M3 13c2.5 0 4-1.2 5-3 .8 2.4 3 4 6 4 2.2 0 4-.7 5.5-2-.3 4-3.8 6.8-8 6.8-3.7 0-6.8-2.4-8.5-5.8z" fill="#4d6bfe"/>` +
        `<circle cx="15.5" cy="10.5" r="1.1" fill="#fff"/></svg>`,
    minimax: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">` +
        `<path d="M3 12c1.5 0 1.5-5 3-5s1.5 11 3 11 1.5-13 3-13 1.5 9 3 9 1.5-3 3-3"/></svg>`,
    tavily: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M12 21V8"/><path d="M12 8l-4 4M12 8l4 4"/>` +
        `<path d="M12 3l5 4"/><path d="M5 9l5-2.5"/></svg>`,
    mimo: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="currentColor">` +
        `<title>XiaomiMiMo</title><path d="M.958 15.936a.459.459 0 01.459.44v2.729a.46.46 0 01-.918 0v-2.729a.459.459 0 01.459-.44zm4.814-2.035a.46.46 0 01.553.45v4.754a.458.458 0 11-.918 0V15.48L3.74 17.202a.462.462 0 01-.655.016.462.462 0 01-.065-.082L.628 14.67a.459.459 0 01.658-.637l2.124 2.187 2.127-2.188a.46.46 0 01.235-.13zm2.068.004a.46.46 0 01.458.445v4.755a.46.46 0 01-.458.458.459.459 0 01-.458-.458V14.35a.459.459 0 01.458-.445zm1.973 2.014a.46.46 0 01.46.457v2.729a.46.46 0 01-.784.324.46.46 0 01-.134-.324v-2.729a.46.46 0 01.458-.458zm.002-2.045a.458.458 0 01.328.157l2.127 2.19 2.125-2.19a.459.459 0 01.784.318v4.756a.46.46 0 01-.455.458.46.46 0 01-.458-.458V15.48l-1.667 1.723a.46.46 0 01-.65.008l-.005-.005c0-.002-.002-.002-.004-.003l-2.455-2.534a.46.46 0 01-.008-.667.461.461 0 01.338-.128zm6.797 1.206a.46.46 0 01.53.651A1.966 1.966 0 0019.81 18.4a.462.462 0 01.623.18.46.46 0 01-.181.624 2.863 2.863 0 01-1.38.353l-.142-.004a2.88 2.88 0 01-2.393-4.263.461.461 0 01.274-.21zm.864-.931a2.884 2.884 0 013.915 3.914.46.46 0 01-.402.24l-.057-.004a.458.458 0 01-.164-.055.46.46 0 01-.182-.622 1.967 1.967 0 00-2.669-2.67.459.459 0 11-.441-.803zM9.59 6.368c1.481 0 1.696 1.202 1.696 1.654v2.648h-.917v-.432c-.26.346-.792.535-1.36.535-.133 0-1.289-.03-1.384-1.136-.082-.932.675-1.61 2.053-1.61h.691c0-.563-.367-.886-.983-.886-.44.013-.864.174-1.2.458l-.36-.664c.484-.379 1.012-.567 1.764-.567zm4.427.1c1.263 0 2.082.97 2.083 2.15 0 1.181-.824 2.154-2.083 2.154-1.26 0-2.084-.972-2.084-2.152 0-1.18.82-2.153 2.084-2.153zm6.801.015c.68 0 1.202.465 1.197 1.548v2.642H21.1V8.29c0-.312-.002-.98-.63-.98s-.628.667-.628.838v2.524h-.89V8.148c0-.17-.001-.838-.63-.838-.628 0-.628.668-.628.98v2.383h-.917v-4.03h.917V7a1.22 1.22 0 01.947-.516c.398 0 .76.193.982.686a1.321 1.321 0 011.195-.686zm-18.093.872l1.457-1.772H5.32L3.311 8.07l2.14 2.602H4.24L2.725 8.796 1.21 10.672H0L2.138 8.07.13 5.583h1.138l1.458 1.772zm4.149 3.317h-.916V6.644h.916v4.028zm16.99 0h-.916V6.644h.916v4.028zM9.925 8.71c-1.055 0-1.359.412-1.326.742.032.329.324.537.757.537a1.013 1.013 0 001.014-.968l.002-.31h-.447zM14.018 7.3c-.663 0-1.184.487-1.184 1.32 0 .832.52 1.32 1.184 1.32.662 0 1.182-.49 1.182-1.32 0-.832-.52-1.32-1.182-1.32zM6.417 5.001a.568.568 0 01.587.582.588.588 0 01-1.175 0A.57.57 0 016.417 5zm16.991 0a.57.57 0 01.592.582.588.588 0 01-1.174 0 .57.57 0 01.357-.542.572.572 0 01.225-.04z"></path></svg>`,
    cpa: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2">` +
        `<path d="M12 5A7 7 0 0 1 19 12"/>` +
        `<path d="M19 12A7 7 0 0 1 12 19"/>` +
        `<path d="M12 19A7 7 0 0 1 5 12"/>` +
        `<path d="M5 12A7 7 0 0 1 12 5"/></svg>`,
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
    const wrap = "flex shrink-0 items-center justify-center [&_svg]:block [&_img]:block";
    const logo_img = "h-full w-full object-contain";
    const theme_logo = VENDOR_THEME_LOGOS[id];
    if (theme_logo) {
        return (
            <span className={wrap} style={{ width: size, height: size }} data-testid="vendor-mark">
                <img className={logo_img + " dark:hidden"} src={theme_logo.light} alt="" />
                <img className={logo_img + " hidden dark:block"} src={theme_logo.dark} alt="" />
            </span>
        );
    }

    const logo = VENDOR_LOGOS[id];
    if (logo) {
        return (
            <span className={wrap} style={{ width: size, height: size }} data-testid="vendor-mark">
                <img className={logo_img} src={logo} alt="" />
            </span>
        );
    }

    const render = VENDOR_MARKS[id] ?? VENDOR_MARKS["overview"];
    if (!render) return null;
    return (
        <span
            className={wrap}
            style={{ width: size, height: size, color: color ?? undefined }}
            data-testid="vendor-mark"
            dangerouslySetInnerHTML={{ __html: render(size) }}
        />
    );
}
