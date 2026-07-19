/* icons.jsx — UI glyphs (stroke) + vendor placeholder marks (filled, distinct).
   Vendor marks are simple geometric placeholders, NOT real brand logos. */

const UI_ICONS = {
  refresh: '<path d="M20 11a8 8 0 1 0-1.5 5.5M20 11V5m0 6h-6"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chev_down: '<path d="M6 9l6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/>',
  edit: '<path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"/>',
  cloud_off: '<path d="M3 3l18 18M18.4 15.4A4 4 0 0 0 17 8h-1.3A7 7 0 0 0 6 6.3M5.5 9.5A4 4 0 0 0 6 17h10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
  inbox: '<path d="M3 13l3-8h12l3 8M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6M3 13h5l1.5 2.5h5L16 13h5"/>',
  power: '<path d="M12 4v8M7 6.5a7 7 0 1 0 10 0"/>',
  pause: '<rect x="6" y="5" width="3.5" height="14" rx="1"/><rect x="14.5" y="5" width="3.5" height="14" rx="1"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  exit: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10.5 20a2 2 0 0 0 3 0"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.5-.3-.9-.3-1.4 0-.6.5-1 1-1H15a4 4 0 0 0 4-4c0-5-3.6-9-7-9z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15" cy="8.5" r="1"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.2 8.3-7 9.5C8.2 19.3 5 16 5 11V6z"/>',
  grid_nav: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eye_off: '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4 4M9.4 5.3A9.4 9.4 0 0 1 12 5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.2 3.9M6.5 6.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.2 9.2 0 0 0 2.9-.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  clipboard: '<rect x="8" y="4" width="8" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  tag: '<path d="M3 7v5.6a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5.6-5.6a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 12.6 3H5a2 2 0 0 0-2 2z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"/>',
  link: '<path d="M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 20.5C5.5 16 2.5 12.6 2.5 8.9 2.5 6.2 4.6 4.2 7.2 4.2c1.7 0 3.3.9 4.1 2.3l.7 1.1.7-1.1c.8-1.4 2.4-2.3 4.1-2.3 2.6 0 4.7 2 4.7 4.7 0 3.7-3 7.1-9.5 11.6z"/>',
  cloud: '<path d="M7 18.5a4.2 4.2 0 0 1-.6-8.36A6 6 0 0 1 18 9.8a3.6 3.6 0 0 1-.6 8.7H7z"/>',
  feedback: '<path d="M21 11.5a7.5 7.5 0 0 1-10.8 6.74L4.5 20l1.27-4.16A7.5 7.5 0 1 1 21 11.5z"/>',
  book: '<path d="M12 6c-1.8-1.3-4.2-1.9-7-1.9v13c2.8 0 5.2.6 7 1.9 1.8-1.3 4.2-1.9 7-1.9v-13c-2.8 0-5.2.6-7 1.9z"/>',
  code: '<path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4"/>',
  arrow_ur: '<path d="M7 17L17 7M8 7h9V16"/>',
};

function Icon({ name, size = 18, strokeWidth = 1.7, color, style, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color || 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}
      dangerouslySetInnerHTML={{ __html: UI_ICONS[name] || '' }} />
  );
}

/* ---- Vendor placeholder marks (geometric, distinct hues) ---- */
const VENDOR_ICONS = {
  overview: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#3d7afd" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/>
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>`,
  claude: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><g stroke="#d97757" stroke-width="2" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="5.6" y2="18.4"/><line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(22.5 12 12)"/><line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(67.5 12 12)"/></g><circle cx="12" cy="12" r="2.4" fill="#d97757"/></svg>`,
  codex: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M12 2.6l8 4.4v9.9l-8 4.5-8-4.5V7z" fill="#eef1ff" stroke="#6172f3" stroke-width="1.4"/><path d="M12 12.4l8-4.6M12 12.4v9.1M12 12.4L4 7.8" stroke="#6172f3" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2.6l8 4.4-8 5.4-8-5.4z" fill="#8b9bff"/></svg>`,
  glm: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="#3d7afd"><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="20" cy="8" r="1.5"/><circle cx="4" cy="16" r="1.5"/><circle cx="20" cy="16" r="1.5"/><circle cx="12" cy="12" r="2.4"/><circle cx="7" cy="12" r="1.2" opacity=".6"/><circle cx="17" cy="12" r="1.2" opacity=".6"/></svg>`,
  deepseek: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M3 13c2.5 0 4-1.2 5-3 .8 2.4 3 4 6 4 2.2 0 4-.7 5.5-2-.3 4-3.8 6.8-8 6.8-3.7 0-6.8-2.4-8.5-5.8z" fill="#4d6bfe"/><circle cx="15.5" cy="10.5" r="1.1" fill="#fff"/></svg>`,
  minimax: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#e23744" stroke-width="2" stroke-linecap="round"><path d="M3 12c1.5 0 1.5-5 3-5s1.5 11 3 11 1.5-13 3-13 1.5 9 3 9 1.5-3 3-3"/></svg>`,
  tavily: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V8" stroke="#3d7afd"/><path d="M12 8l-4 4M12 8l4 4" stroke="#3d7afd"/><path d="M12 3l5 4" stroke="#f5a524"/><path d="M5 9l5-2.5" stroke="#22c55e"/></svg>`,
  /* orange shield — Brave Search placeholder */
  brave: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.6l6.2 2.1.7 7.7c.2 2.5-1.1 4.9-3.3 6.1L12 21.4l-3.6-2.9c-2.2-1.2-3.5-3.6-3.3-6.1l.7-7.7z" fill="#fb542b"/><path d="M12 8.1l2.3 2.5-2.3 4.2-2.3-4.2z" fill="#fff"/></svg>`,
  /* four-point sparkle */
  gemini: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.2c.5 4.6 2.6 7.2 7.6 7.8-5 .6-7.1 3.2-7.6 7.8-.5-4.6-2.6-7.2-7.6-7.8 5-.6 7.1-3.2 7.6-7.8z" transform="translate(0 2)" fill="#3a72f0"/></svg>`,
  /* dark rounded square w/ crescent — Kimi placeholder */
  kimi: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#17181d"/><path d="M15 8.2A4.6 4.6 0 1 0 15 15.8 5.8 5.8 0 0 1 15 8.2z" fill="#fff"/></svg>`,
  /* blue upward arc — Antigravity placeholder */
  antigravity: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.3" fill="#2f6df0"/><path d="M8 8v3.4a4 4 0 0 0 8 0V8" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><path d="M12 16.4v2.2" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  /* amber rounded square w/ concentric lens — MiMo placeholder */
  mimo: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#ff7a45"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="1.7" fill="#fff"/></svg>`,
  /* segmented donut — CPA Manager data source */
  cpa: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="4.2"><path d="M12 5A7 7 0 0 1 19 12" stroke="#3d7afd"/><path d="M19 12A7 7 0 0 1 12 19" stroke="#22c55e"/><path d="M12 19A7 7 0 0 1 5 12" stroke="#f5a524"/><path d="M5 12A7 7 0 0 1 12 5" stroke="#d97757"/></svg>`,
};

function VendorMark({ id, size = 28 }) {
  return <span className="vicon" style={{ width: size, height: size }}
    dangerouslySetInnerHTML={{ __html: (VENDOR_ICONS[id] || VENDOR_ICONS.overview)(size) }} />;
}

Object.assign(window, { Icon, VendorMark, UI_ICONS, VENDOR_ICONS });
