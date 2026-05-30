// Provider marks — generic geometric forms in brand-appropriate colors.
// Deliberately NOT pixel-copies of any trademark; simple shapes only.
// Also a couple of header/UI icons (power, chevrons).

const PIcon = {
  // terracotta radial burst (asterisk)
  claude: () => (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <g
        stroke="#d97757"
        strokeWidth="2.1"
        strokeLinecap="round"
        transform="translate(12 12)"
      >
        {Array.from({ length: 9 }).map((_, i) => {
          const a = (i / 9) * Math.PI * 2;
          const r = 8.2;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 2.4}
              y1={Math.sin(a) * 2.4}
              x2={Math.cos(a) * r}
              y2={Math.sin(a) * r}
            />
          );
        })}
      </g>
    </svg>
  ),
  // indigo hexagon w/ chevron
  codex: () => (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path
        d="M12 2.2 20.5 7v10L12 21.8 3.5 17V7z"
        fill="#635bff"
      />
      <path
        d="M9.5 9.5 12.6 12 9.5 14.5M13.6 14.8h2.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // blue flower-burst
  glm: () => (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <g fill="#3a72f0" transform="translate(12 12)">
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <ellipse
              key={i}
              cx={Math.cos(a) * 5.6}
              cy={Math.sin(a) * 5.6}
              rx="2.5"
              ry="2.5"
              transform={`rotate(${(a * 180) / Math.PI})`}
            />
          );
        })}
        <circle r="2.6" fill="#9dc0ff" />
      </g>
    </svg>
  ),
  // deep blue rounded mark w/ inner curve
  deepseek: () => (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <circle cx="12" cy="12" r="9.5" fill="#4d6bfe" />
      <path
        d="M7 9.5c2.8-.6 5 .8 5.6 3.2.5 2 2.2 2.9 4.2 2.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="7.6" cy="9.2" r="1.15" fill="#fff" />
    </svg>
  ),
  // three colored axis arrows
  tavily: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <g transform="translate(11.5 12.5)">
        <path d="M0 0 0-8.5M0-8.5-2-6M0-8.5 2-6" stroke="#3a72f0" />
        <path d="M0 0 7.5 4M7.5 4 4.6 4.2M7.5 4 6.2 1.5" stroke="#f6a52a" />
        <path d="M0 0-7.5 4M-7.5 4-6.2 1.5M-7.5 4-4.6 4.2" stroke="#ee4d4d" />
      </g>
    </svg>
  ),
  // magenta waveform
  minimax: () => (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <g stroke="#e3197f" strokeWidth="2" strokeLinecap="round">
        <line x1="4.5" y1="9.5" x2="4.5" y2="14.5" />
        <line x1="8.2" y1="6" x2="8.2" y2="18" />
        <line x1="12" y1="3.5" x2="12" y2="20.5" />
        <line x1="15.8" y1="7.5" x2="15.8" y2="16.5" />
        <line x1="19.5" y1="10" x2="19.5" y2="14" />
      </g>
    </svg>
  ),
};

const UBIcon = {
  Refresh: ({ w = 17 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.8 3.2v3.6h-3.6" />
    </svg>
  ),
  Settings: ({ w = 17 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.4v1.7M10 15.9v1.7M3.6 10H1.9M18.1 10h-1.7M5.1 5.1 3.9 3.9M16.1 16.1l-1.2-1.2M5.1 14.9l-1.2 1.2M16.1 3.9l-1.2 1.2" />
    </svg>
  ),
  Power: ({ w = 17 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.4 5.6a5.5 5.5 0 1 0 7.2 0" />
      <path d="M10 2.5v6" />
    </svg>
  ),
  ChevronDown: ({ w = 18 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  ),
  ChevronUp: ({ w = 18 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 7.5 15 12.5" />
    </svg>
  ),
  Plus: ({ w = 15 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  ),
  Clock: ({ w = 12 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-1px" }}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6.2V10l2.6 1.8" />
    </svg>
  ),
  ChevronLeft: ({ w = 18 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.5 5 7.5 10 12.5 15" />
    </svg>
  ),
  ChevronRight: ({ w = 18 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 5 12.5 10 7.5 15" />
    </svg>
  ),
  Restart: ({ w = 16 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.6 8A6.5 6.5 0 1 1 3.2 11.4" />
      <path d="M3.2 3.6v3.9h3.9" />
    </svg>
  ),
  ListView: ({ w = 16 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5.5h9M7 10h9M7 14.5h9" />
      <circle cx="3.6" cy="5.5" r="0.4" />
      <circle cx="3.6" cy="10" r="0.4" />
      <circle cx="3.6" cy="14.5" r="0.4" />
    </svg>
  ),
  TabView: ({ w = 16 }) => (
    <svg width={w} height={w} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="14" height="11" rx="2" />
      <path d="M3 8.2h14M6.4 4.5v3.7" />
    </svg>
  ),
};

window.PIcon = PIcon;
window.UBIcon = UBIcon;
