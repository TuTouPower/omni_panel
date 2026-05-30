import { type CSSProperties } from "react";

const UI_ICONS: Record<string, string> = {
    refresh: '<path d="M20 11a8 8 0 1 0-1.5 5.5M20 11V5m0 6h-6"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev_down: '<path d="M6 9l6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/>',
    edit: '<path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"/>',
    warn: '<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4M12 17h.01"/>',
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

/* ── Vendor marks (geometric placeholder icons, NOT real brand logos) ── */
const VENDOR_MARKS: Record<string, (s: number) => string> = {
    overview: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="#3d7afd" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
        `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/>` +
        `<rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>`,
    claude: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24"><g stroke="#d97757" stroke-width="2" stroke-linecap="round">` +
        `<line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>` +
        `<line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="5.6" y2="18.4"/>` +
        `<line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(22.5 12 12)"/>` +
        `<line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(67.5 12 12)"/></g>` +
        `<circle cx="12" cy="12" r="2.4" fill="#d97757"/></svg>`,
    codex: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none">` +
        `<path d="M12 2.6l8 4.4v9.9l-8 4.5-8-4.5V7z" fill="#eef1ff" stroke="#6172f3" stroke-width="1.4"/>` +
        `<path d="M12 12.4l8-4.6M12 12.4v9.1M12 12.4L4 7.8" stroke="#6172f3" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M12 2.6l8 4.4-8 5.4-8-5.4z" fill="#8b9bff"/></svg>`,
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
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="#e23744" stroke-width="2" stroke-linecap="round">` +
        `<path d="M3 12c1.5 0 1.5-5 3-5s1.5 11 3 11 1.5-13 3-13 1.5 9 3 9 1.5-3 3-3"/></svg>`,
    tavily: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M12 21V8" stroke="#3d7afd"/><path d="M12 8l-4 4M12 8l4 4" stroke="#3d7afd"/>` +
        `<path d="M12 3l5 4" stroke="#f5a524"/><path d="M5 9l5-2.5" stroke="#22c55e"/></svg>`,
};

interface VendorMarkProps {
    id: string;
    size?: number;
}

export function VendorMark({ id, size = 28 }: VendorMarkProps) {
    const render = VENDOR_MARKS[id] ?? VENDOR_MARKS["overview"];
    if (!render) return null;
    return (
        <span
            className="vicon"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: render(size) }}
        />
    );
}
