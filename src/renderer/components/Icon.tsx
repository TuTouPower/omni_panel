import { type CSSProperties } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
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

const UI_ICONS: Record<string, string> = {
    refresh: '<path d="M20 11a8 8 0 1 0-1.5 5.5M20 11V5m0 6h-6"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev_down: '<path d="M6 9l6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/>',
    edit: '<path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"/>',
    cloud_off:
        '<path d="M3 3l18 18M18.4 15.4A4 4 0 0 0 17 8h-1.3A7 7 0 0 0 6 6.3M5.5 9.5A4 4 0 0 0 6 17h10"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
    inbox: '<path d="M3 13l3-8h12l3 8M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6M3 13h5l1.5 2.5h5L16 13h5"/>',
    power: '<path d="M12 4v8M7 6.5a7 7 0 1 0 10 0"/>',
    pause: '<rect x="6" y="5" width="3.5" height="14" rx="1"/><rect x="14.5" y="5" width="3.5" height="14" rx="1"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    exit: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10.5 20a2 2 0 0 0 3 0"/>',
    palette:
        '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.5-.3-.9-.3-1.4 0-.6.5-1 1-1H15a4 4 0 0 0 4-4c0-5-3.6-9-7-9z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15" cy="8.5" r="1"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3.2 8.3-7 9.5C8.2 19.3 5 16 5 11V6z"/>',
    grid_nav:
        '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/>',
    eye_off:
        '<path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10 7 10 7s-.7 1.4-2 3"/><path d="M6.2 6.2C4 8.2 2.5 10.6 2 12c0 0 3.5 7 10 7 1.8 0 3.5-.4 5-1.2"/><line x1="2" y1="2" x2="22" y2="22"/>',
    chevron: '<path d="M8 4l8 8-8 8"/>',
    external_link:
        '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9A15 15 0 0 1 12 3z"/>',
    chart: '<path d="M3 20h18M7 20v-8M12 20V6M17 20v-5"/>',
    clipboard:
        '<rect x="8" y="4" width="8" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    tag: '<path d="M3 7v5.6a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5.6-5.6a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 12.6 3H5a2 2 0 0 0-2 2z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    feedback:
        '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
};

interface IconProps {
    name: string;
    size?: number;
    strokeWidth?: number;
    color?: string;
    style?: CSSProperties;
    className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, color, style, className }: IconProps) {
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
            dangerouslySetInnerHTML={{ __html: UI_ICONS[name] ?? "" }}
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

export type VendorId = UsageProvider | "overview" | "cpa";

interface VendorMarkProps {
    id: VendorId;
    size?: number;
    color?: string;
}

export function VendorMark({ id, size = 28, color }: VendorMarkProps) {
    const theme_logo = VENDOR_THEME_LOGOS[id];
    if (theme_logo) {
        return (
            <span className="vicon" style={{ width: size, height: size }}>
                <img className="vendor-logo-img vendor-logo-light" src={theme_logo.light} alt="" />
                <img className="vendor-logo-img vendor-logo-dark" src={theme_logo.dark} alt="" />
            </span>
        );
    }

    const logo = VENDOR_LOGOS[id];
    if (logo) {
        return (
            <span className="vicon" style={{ width: size, height: size }}>
                <img className="vendor-logo-img" src={logo} alt="" />
            </span>
        );
    }

    const render = VENDOR_MARKS[id] ?? VENDOR_MARKS["overview"];
    if (!render) return null;
    return (
        <span
            className="vicon"
            style={{ width: size, height: size, color: color ?? undefined }}
            dangerouslySetInnerHTML={{ __html: render(size) }}
        />
    );
}
