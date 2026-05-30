// UsageBoard popover components.

// ---------- Area chart (multi-series, straight segments) ----------
function AreaChart({ chart, width = 366, plotH = 132 }) {
  const padL = 34;
  const padR = 6;
  const padT = 8;
  const xLabelH = 22;
  const plotW = width - padL - padR;
  const totalH = padT + plotH + xLabelH;
  const yMax = chart.yMax;
  const n = chart.series[0].data.length;

  const xAt = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + (1 - Math.max(0, Math.min(v, yMax)) / yMax) * plotH;
  const baseY = padT + plotH;

  const fmt = (t) => (t === 0 ? "0" : t + "M");

  return (
    <svg width={width} height={totalH} viewBox={`0 0 ${width} ${totalH}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {/* gridlines + y labels */}
      {chart.yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={yAt(t)} x2={width - padR} y2={yAt(t)} stroke="#ececee" strokeWidth="1" />
          <text x={padL - 7} y={yAt(t) + 4} textAnchor="end" fontSize="11.5" fill="#b2b2b8">
            {fmt(t)}
          </text>
        </g>
      ))}
      {/* areas (back-to-front, larger series first) */}
      {chart.series.map((s, si) => {
        const pts = s.data.map((v, i) => `${xAt(i)},${yAt(v)}`);
        const area = `M ${xAt(0)},${baseY} L ${pts.join(" L ")} L ${xAt(n - 1)},${baseY} Z`;
        return <path key={"a" + si} d={area} fill={s.color} fillOpacity="0.1" />;
      })}
      {/* lines */}
      {chart.series.map((s, si) => {
        const line = "M " + s.data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L ");
        return <path key={"l" + si} d={line} fill="none" stroke={s.color} strokeWidth="1.7" strokeLinejoin="round" />;
      })}
      {/* x labels */}
      {chart.xLabels.map((lbl, i) => {
        const x = padL + (chart.xLabels.length === 1 ? 0 : (i / (chart.xLabels.length - 1)) * plotW);
        const anchor = i === 0 ? "start" : i === chart.xLabels.length - 1 ? "end" : "middle";
        return (
          <text key={lbl} x={x} y={totalH - 6} textAnchor={anchor} fontSize="11.5" fill="#a9a9af">
            {lbl}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- one usage row ----------
function UsageRow({ row }) {
  let fillPct, text;
  if (row.kind === "pct") {
    fillPct = row.value;
    text = `${row.value}%`;
  } else {
    const u = row.decimals ? row.used.toFixed(row.decimals) : row.used;
    text = `${u} / ${row.total}`;
    const raw = row.total ? (row.used / row.total) * 100 : 0;
    fillPct = row.used > 0 ? Math.max(raw, 2.5) : 0;
  }
  const tone = row.tone;
  const invert = tone === "danger" || tone === "warn" || fillPct >= 65;

  return (
    <div className="ub-row">
      <div className="ub-row-label">{row.label}</div>
      <div className="ub-bar" data-tone={tone || undefined} data-invert={invert || undefined}>
        <div className="ub-bar-fill" style={{ width: `${Math.min(fillPct, 100)}%` }} />
        <div className="ub-bar-text">{text}</div>
      </div>
      <div className="ub-row-time">{row.time}</div>
    </div>
  );
}

// ---------- token grid ----------
function TokenGrid({ tokens }) {
  return (
    <div className="ub-tokens">
      {tokens.map((t) => (
        <div key={t.name}>
          <div className="ub-tok-head">
            <span className="ub-tok-dot" style={{ background: t.dot }} />
            <span className="ub-tok-name">{t.name}</span>
          </div>
          <div className="ub-tok-val">
            {t.val}
            <span className="ub-tok-unit">{t.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- provider header row ----------
const PROVIDER_TINT = {
  claude: "#d97757",
  codex: "#635bff",
  glm: "#4c63e6",
  deepseek: "#4d6bfe",
  tavily: "#6b7280",
  minimax: "#e3197f",
};

function ProviderHead({ data }) {
  const Mark = PIcon[data.key];
  const c = PROVIDER_TINT[data.key] || "#6b7280";
  return (
    <div className="ub-phead">
      <span
        className="ub-picon"
        style={{ background: `color-mix(in srgb, ${c} 13%, #fff)` }}
      >
        {Mark && <Mark />}
      </span>
      <span className="ub-pname">{data.name}</span>
      {data.plan && <span className="ub-badge" data-plan={data.plan}>{data.plan}</span>}
      <span className="ub-phead-r">
        <span className="ub-countdown">{data.countdown}</span>
        <span className="ub-mini-refresh"><UBIcon.Refresh w={14} /></span>
      </span>
    </div>
  );
}

// ---------- provider card ----------
// mode: "tab" (always full) | "list" (rows always; details when expanded)
function ProviderCard({ data, mode = "tab", expanded = false }) {
  const hasDetails = !!data.tokens;
  const showDetails = mode === "tab" ? hasDetails : hasDetails && expanded;
  const listCard = mode === "list";

  return (
    <div className={"ub-pcard" + (listCard ? " is-listcard" : "") + (listCard && !hasDetails ? " ub-card-pad" : "")}>
      <ProviderHead data={data} />
      <div className="ub-rows">
        {data.rows.map((r, i) => <UsageRow key={i} row={r} />)}
      </div>

      {showDetails && (
        <React.Fragment>
          <TokenGrid tokens={data.tokens} />
          {data.chart && (
            <div className="ub-chart">
              <AreaChart chart={data.chart} />
            </div>
          )}
        </React.Fragment>
      )}

      {listCard && hasDetails && (
        <div className="ub-expand">
          {expanded ? <UBIcon.ChevronUp /> : <UBIcon.ChevronDown />}
        </div>
      )}
    </div>
  );
}

// ---------- header + tabs ----------
function PopHeader() {
  return (
    <div className="ub-head">
      <span className="ub-logo"><i /><i /><i /></span>
      <span className="ub-wordmark">UsageBoard</span>
      <span className="ub-head-actions">
        <button className="ub-iconbtn" title="刷新全部"><UBIcon.Refresh /></button>
        <button className="ub-iconbtn" title="设置"><UBIcon.Settings /></button>
        <button className="ub-iconbtn" title="退出"><UBIcon.Power /></button>
      </span>
    </div>
  );
}

function TabBar({ active }) {
  return (
    <div className="ub-tabs">
      {UB_TAB_ORDER.map((k) => (
        <div key={k} className="ub-tab" data-active={k === active || undefined}>
          {UB_PROVIDERS[k].name}
        </div>
      ))}
    </div>
  );
}

// ---------- window shell (just the window — no OS tray chrome) ----------
function UsageWindow({ children }) {
  return <div className="ub ub-win">{children}</div>;
}

// Tabbed mode — one provider with details
function PopupTabbed({ active }) {
  const data = UB_PROVIDERS[active];
  return (
    <UsageWindow>
      <PopHeader />
      <TabBar active={active} />
      <div className="ub-divider" />
      <div className="ub-body">
        <ProviderCard data={data} mode="tab" />
      </div>
    </UsageWindow>
  );
}

// List mode — all providers stacked; `expanded` = set of keys showing details
function PopupList({ order = UB_TAB_ORDER, expanded = [] }) {
  return (
    <UsageWindow>
      <PopHeader />
      <div className="ub-divider" />
      <div className="ub-body" style={{ paddingTop: 14 }}>
        {order.map((k) => (
          <ProviderCard
            key={k}
            data={UB_PROVIDERS[k]}
            mode="list"
            expanded={expanded.includes(k)}
          />
        ))}
      </div>
    </UsageWindow>
  );
}

window.PopupTabbed = PopupTabbed;
window.PopupList = PopupList;

// shared with multi-account.jsx (Babel scripts don't share lexical scope)
window.TokenGrid = TokenGrid;
window.AreaChart = AreaChart;
window.UsageRow = UsageRow;
window.UsageWindow = UsageWindow;
window.TabBar = TabBar;
window.PopHeader = PopHeader;
window.PROVIDER_TINT = PROVIDER_TINT;
