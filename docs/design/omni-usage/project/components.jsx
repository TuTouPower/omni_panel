/* components.jsx — shared UI: BarRow, UsageCard, TokenChart, Tab */

/* =================================================================
   USAGE-BAR COLOR SCHEMES
   Three selectable strategies (设置 > 外观 > 用量条颜色方案):
     'risk-current'   风险色：仅当前用量      ← DEFAULT
     'risk-projected' 风险色：带投影预测
     'nine-cycle'     彩色区分：九色循环
   The active scheme is supplied through BarSchemeContext (default below
   is the system default — risk-current). Never default to nine-cycle.
   ================================================================= */
const BarSchemeContext = React.createContext('risk-current');

/* =================================================================
   USAGE-BAR SHAPE / STYLE  (设置 > 外观 > 用量条样式)
   An INDEPENDENT axis from the color scheme above — every color scheme
   works under either style:
     'thin'    细线型  ← DEFAULT — the original 5-column row
               [label] [thin progress] [value] [date] [clock]
     'capsule' 粗胶囊型 — the value moves INSIDE a 22px capsule, freeing a
               column, and the track becomes a light tint of the fill color:
               [label] [capsule progress + value] [date] [clock]
   Style and color scheme are two separate settings; never merge them. */
const BarStyleContext = React.createContext('thin');

/* --- nine-color cycle (visual distinction only — NOT a risk signal) ---
   Colors are assigned strictly by a bar's ORDER within its card/account,
   cycling every 9 bars (index % 9). Bar 10 reuses color 1, bar 11 color 2… */
const USAGE_COLORS = [
  '#5B8CFF', // 1 主蓝
  '#8B72F8', // 2 主紫
  '#46C7C7', // 3 主青
  '#7EA2FF', // 4 扩展蓝
  '#A18CFF', // 5 扩展紫
  '#72D4D1', // 6 扩展青
  '#9CB8FF', // 7 浅蓝灰
  '#B6A7FF', // 8 浅紫灰
  '#A7D8D8', // 9 淡青灰
];
function usageColor(idx) {
  const n = USAGE_COLORS.length;
  return USAGE_COLORS[((idx % n) + n) % n];
}

/* --- risk colors (green / yellow / orange / red) --- */
const RISK_VARS = { green: 'var(--risk-green)', yellow: 'var(--risk-yellow)', orange: 'var(--risk-orange)', red: 'var(--risk-red)' };

/* 风险色：仅当前用量 — judged from current usage ratio only.
   pct is 0..100. Severity: red > orange > yellow > green. */
function riskCurrentLevel(pct) {
  if (pct >= 95) return 'red';
  if (pct > 85)  return 'orange';
  if (pct > 60)  return 'yellow';
  return 'green';
}

/* 风险色：带投影预测 — also projects end-of-window usage from current pace.
   projected = current / elapsed (both ratios). If elapsed is missing or
   invalid (no reset/window-start, elapsed<=0, bad data), fall back to the
   current-only rule. */
function riskProjectedLevel(pct, elapsed) {
  if (!(elapsed > 0)) return riskCurrentLevel(pct);   // graceful fallback
  const projected = (pct / 100) / elapsed;            // ratio, e.g. 1.0 = on track to 100%
  if (pct >= 95 || projected >= 1.00) return 'red';
  if (pct > 85  || projected >= 0.90) return 'orange';
  if (pct > 60  || projected >= 0.75) return 'yellow';
  return 'green';
}

/* resolve the fill color for a bar under the active scheme. */
function barFillColor(scheme, { pct, idx, elapsed }) {
  if (scheme === 'nine-cycle') return usageColor(idx);
  if (scheme === 'risk-projected') return RISK_VARS[riskProjectedLevel(pct, elapsed)];
  // 'risk-current' (default) + any unknown value → safest, simplest rule
  return RISK_VARS[riskCurrentLevel(pct)];
}

/* =================================================================
   LABEL DISPLAY NAME  (spec §1 label 列)
   The label column is a FIXED global width (6ic, set in CSS — never per-card,
   never per-vendor, never measured from content). Overflow is handled purely
   by CSS ellipsis + a hover tooltip carrying the full raw name. We never
   truncate by JS character count any more.
   What we DO in JS is map a long, machine-style rawLabel to a tidy
   displayLabel — e.g. "gemini-3.1-flash-lite-preview" → "3.1 Flash-Lite".
   The map below is the built-in default; a user-customisable map can be
   merged in from settings (window.__labelMap) without touching this file. */
const LABEL_MAP = {
  'gemini-2.5-pro': '2.5 Pro',
  'gemini-2.5-flash': '2.5 Flash',
  'gemini-2.5-flash-lite': '2.5 Flash-Lite',
  'gemini-3-pro-preview': '3 Pro',
  'gemini-3-flash-preview': '3 Flash',
  'gemini-3.1-pro-preview': '3.1 Pro',
  'gemini-3.1-flash-lite': '3.1 Flash-Lite',
  'gemini-3.1-flash-lite-preview': '3.1 Flash-Lite·Pv',
};
function displayLabel(raw) {
  if (!raw) return raw;
  const user = (typeof window !== 'undefined' && window.__labelMap) || null;
  if (user && user[raw]) return user[raw];
  if (LABEL_MAP[raw]) return LABEL_MAP[raw];
  // generic fallback: drop a known vendor prefix + a trailing "-preview".
  return raw
    .replace(/^(gemini|minimax|gpt|claude|deepseek)-/i, '')
    .replace(/-preview$/i, '');
}

/* split a reset/refresh string into its date part and HH:mm clock part so the
   two can live in separate, independently-aligned columns (spec §4/§5).
     "今天 13:10" → { date: "今天",  clock: "13:10" }
     "5/18 21:00" → { date: "5/18",  clock: "21:00" }
     "13:10"      → { date: "",      clock: "13:10" }
     "--" / null  → { date: "--",    clock: "--"   } */
const _CLOCK_RE = /^\d{1,2}:\d{2}$/;
/* normalise a numeric date to zero-padded MM.DD (5/18 → 05.18, 6.8 → 06.08).
   Word dates (今天 / 明天 / today …) pass through untouched. */
function _fmtDate(d) {
  const m = d.match(/^(\d{1,2})[\/.](\d{1,2})$/);
  if (!m) return d;
  return m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0');
}
function splitTime(reset) {
  const t = (reset == null ? '' : String(reset)).trim();
  if (!t) return { date: '', clock: '' };
  if (t === '--') return { date: '--', clock: '--' };
  const parts = t.split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && _CLOCK_RE.test(last)) {
    return { date: _fmtDate(parts.slice(0, -1).join(' ')), clock: last };
  }
  if (_CLOCK_RE.test(t)) return { date: '', clock: t };
  return { date: _fmtDate(t), clock: '' };
}

/* one usage row — always five columns: 名称 / 条 / 数值 / 日期 / 时间.
   `max` present  → fraction metric, value shows "value/max" (balance, MCP, quotas).
   `max` absent   → percentage metric, value shows "value%".
   `value == null`→ no data, value & time show "--" but the column structure holds.
   `reset` is the per-metric refresh/reset time ("今天 13:10", "6/8 19:00", "--").
   `idx` is the row's position within its card (0-based, for the 九色循环 scheme).
   The label column width is inherited from the card via the --lbl-w CSS var. */
function BarRow({ label, full, value, max, idx = 0, reset, elapsed }) {
  const scheme = React.useContext(BarSchemeContext);
  const style = React.useContext(BarStyleContext);
  const unused = value == null;
  const frac = max != null;
  const pct = unused ? 0 : (frac ? (max > 0 ? (value / max) * 100 : 0) : value);
  const c = barFillColor(scheme, { pct, idx, elapsed });
  const valText = unused ? '--' : (frac ? value + '/' + max : value + '%');
  const { date, clock } = splitTime(unused ? '--' : reset);
  const fillPct = Math.max(0, Math.min(100, pct));

  /* 粗胶囊型 (spec §三-§十): 4 columns, value lives INSIDE a centered
     capsule, the track is a low-opacity tint of the very same fill color.
     label / date / clock keep their global widths; only the capsule (1fr)
     stretches when the window widens. */
  if (style === 'capsule') {
    return (
      <div className="bar-row cap">
        <span className="bar-lbl" title={full || label}>{displayLabel(label)}</span>
        <div className="cap-track" style={{
          background: unused ? 'var(--bar-track)'
                            : 'color-mix(in srgb, ' + c + ' 16%, transparent)',
        }}>
          {!unused && (
            <div className="cap-fill" style={{ width: fillPct + '%', background: c }} />
          )}
          {/* value rides the visual centre of the WHOLE track (§五). Two stacked
             copies give perfect contrast at any fill / any length (§六): a dark base
             for the track portion, plus a white copy clipped to exactly the filled
             region — no straddling, no unreadable overflow on balance like 52/100. */}
          <span className="cap-val" title={valText}>{valText}</span>
          {!unused && (
            <span className="cap-val clip" aria-hidden="true"
              style={{ clipPath: 'inset(0 ' + (100 - fillPct) + '% 0 0)' }}>{valText}</span>
          )}
        </div>
        <span className="bar-date">{date}</span>
        <span className="bar-clock">{clock}</span>
      </div>
    );
  }

  /* 细线型 (default) — unchanged five-column row */
  return (
    <div className="bar-row">
      <span className="bar-lbl" title={full || label}>{displayLabel(label)}</span>
      <div className="track">
        <div className="fill" style={{
          width: fillPct + '%',
          background: c,
        }} />
      </div>
      <span className="bar-pct" title={valText}>{valText}</span>
      <span className="bar-date">{date}</span>
      <span className="bar-clock">{clock}</span>
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className="skeleton-bars">
      <div className="skel-row"><div className="skel lbl" /><div className="skel" /></div>
      <div className="skel-row"><div className="skel lbl" /><div className="skel" /></div>
    </div>
  );
}

function CardMenu({ onEdit, onDelete, onToggle, onClose }) {
  return (
    <>
      <div className="card-menu-overlay" onClick={onClose} />
      <div className="card-menu" onClick={(e) => e.stopPropagation()}>
        <div className="cm-item" onClick={() => { onEdit(); onClose(); }}>
          <span className="cm-ic"><Icon name="edit" size={15} /></span>编辑
        </div>
        <div className="cm-item" onClick={() => { onToggle(); onClose(); }}>
          <span className="cm-ic"><Icon name="power" size={15} /></span>关闭
        </div>
      </div>
    </>
  );
}

function UsageCard({ vendorId, name, updated, h5, week, r5, rw, e5, ew,
                     balanceOnly, balance, mcp, metrics,
                     accounts, l2open, onToggleL2,
                     state = 'normal', refreshing, onRefresh, limitMode,
                     collapsed, onToggleCollapse,
                     menuOpen, onToggleMenu, onCloseMenu, onEdit, onDelete, onToggleDisable,
                     canDrag, onDragStart, onDragEnter, onDragEnd, onHandleDown, dragging, dragOver }) {
  const isAcct = !vendorId;
  const accts = accounts || [];
  const multi = accts.length > 1;
  const dH5 = limitMode && h5 >= 90, dWk = limitMode && week >= 90;
  const alert = state === 'normal' && (dH5 || dWk);

  return (
    <div className={'card' + (isAcct ? ' acct' : '') + (alert ? ' alert' : '')
        + (collapsed ? ' collapsed' : '')
        + (dragging ? ' dragging' : '') + (dragOver ? ' drag-over' : '')}
      draggable={canDrag ? true : undefined}
      onDragStart={onDragStart} onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd} onDrop={onDragEnd}>
      <div className="card-head">
        <button className="icon-btn card-grip" title="拖动以调整顺序"
          onMouseDown={onHandleDown} onClick={(e) => e.stopPropagation()}>
          <Icon name="grip" size={18} strokeWidth={2} />
        </button>
        {vendorId && <VendorMark id={vendorId} size={26} />}
        <span className="card-name">{name}</span>
        {multi && collapsed && <span className="count-badge">{!l2open ? '概览' : accts.length + '账号'}</span>}
        {multi && !collapsed && (
          <span className="l2seg" role="tablist">
            <button className={l2open ? '' : 'on'} title="概览"
              onClick={() => { if (l2open) onToggleL2(); }}>概览</button>
            <button className={l2open ? 'on' : ''} title="账号明细"
              onClick={() => { if (!l2open) onToggleL2(); }}>{accts.length}账号</button>
          </span>
        )}
        <span className="rel-time">{refreshing ? '刷新中…' : updated}</span>
        <div className="card-tools">
          <button className={'icon-btn card-refresh' + (refreshing ? ' spinning' : '')}
            onClick={onRefresh} title="刷新">
            <Icon name="refresh" size={17} />
          </button>
          <div className="card-menu-wrap">
            <button className="icon-btn" title="更多" onClick={onToggleMenu}>
              <Icon name="more" size={18} />
            </button>
            {menuOpen && (
              <CardMenu onEdit={onEdit} onDelete={onDelete}
                onToggle={onToggleDisable} onClose={onCloseMenu} />
            )}
          </div>
          <button className={'icon-btn card-collapse' + (collapsed ? ' is-collapsed' : '')}
            onClick={onToggleCollapse} title={collapsed ? '展开' : '折叠'}>
            <Icon name="chev_down" size={18} />
          </button>
        </div>
      </div>

      {collapsed ? null :
       refreshing ? <SkeletonBars /> :
       state === 'error' ? (
         <div className="card-state err">
           <span className="cs-ic"><Icon name="cloud_off" size={17} /></span>
           <span>刷新失败 · 网络异常</span>
           <span className="cs-action" onClick={onRefresh}>重试</span>
         </div>
       ) :
       state === 'auth' ? (
         <div className="card-state auth">
           <span className="cs-ic"><Icon name="lock" size={16} /></span>
           <span>凭证失效，请重新登录</span>
           <span className="cs-action">重新登录</span>
         </div>
       ) : (multi && l2open) ? (
         <div className="acct-detail">
           {accts.map((a) => {
             const adH5 = limitMode && a.h5 >= 90, adWk = limitMode && a.week >= 90;
             return (
               <div className="acct-item" key={a.key}>
                 <div className="ai-head">
                   <span className="ai-dot" />
                   <span className="ai-name">{a.name}</span>
                   <span className="ai-time">{a.updated}</span>
                 </div>
                 <div className="ai-bars">
                   {a.metrics ? (
                     a.metrics.map((m, i) => (
                       <BarRow key={m.label} label={m.label} full={m.full} value={m.value} max={m.max} idx={i} reset={m.reset} />
                     ))
                   ) : a.balanceOnly && a.balance ? (
                     <BarRow label="余额" value={a.balance.value} max={a.balance.max} idx={0} reset={a.balance.reset} />
                   ) : (
                     <>
                       <BarRow label="5小时" value={a.h5} idx={0} reset={a.r5} elapsed={a.e5} />
                       <BarRow label="一周"  value={a.week} idx={1} reset={a.rw} elapsed={a.ew} />
                       {a.mcp && <BarRow label="MCP" value={a.mcp.value} max={a.mcp.max} idx={2} reset={a.mcp.reset} />}
                     </>
                   )}
                 </div>
               </div>
             );
           })}
         </div>
       ) : metrics ? (
         <div className="bars">
           {metrics.map((m, i) => (
             <BarRow key={m.label} label={m.label} full={m.full} value={m.value} max={m.max} idx={i} reset={m.reset} />
           ))}
         </div>
       ) : balanceOnly && balance ? (
         <div className="bars">
           <BarRow label="余额" value={balance.value} max={balance.max} idx={0} reset={balance.reset} />
         </div>
       ) : (
         <div className="bars">
           <BarRow label="5小时" value={h5} idx={0} reset={r5} elapsed={e5} />
           <BarRow label="一周"  value={week} idx={1} reset={rw} elapsed={ew} />
           {mcp && <BarRow label="MCP" value={mcp.value} max={mcp.max} idx={2} reset={mcp.reset} />}
         </div>
       )}
    </div>
  );
}

/* ---------- token chart ---------- */
function TokenChart({ data }) {
  const W = 400, H = 168;
  const padL = 34, padR = 8, padT = 10, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const base = padT + plotH;
  const vals = data.values;
  const n = vals.length;
  const slot = plotW / n;
  const bw = Math.min(slot * 0.6, 12);
  const yTicks = [1, 0.75, 0.5, 0.25, 0];
  const yLabels = { 1: '100M', 0.75: '75M', 0.5: '50M', 0.25: '25M', 0: '0' };

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="var(--blue)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => {
        const y = padT + plotH * (1 - t);
        return (
          <g key={t}>
            <line className="grid-line" x1={padL} y1={y} x2={W - padR} y2={y} />
            <text className="axis-lbl" x={padL - 7} y={y + 3.5} textAnchor="end">{yLabels[t]}</text>
          </g>
        );
      })}
      {vals.map((v, i) => {
        const h = Math.max(2, v * plotH);
        const x = padL + slot * i + (slot - bw) / 2;
        return <rect key={i} className="bar" x={x} y={base - h} width={bw} height={h}
          rx={bw > 6 ? 2.5 : 1.5} fill="url(#barGrad)" />;
      })}
      {data.labels.map((lb, i) => {
        const frac = data.labels.length === 1 ? 0.5 : i / (data.labels.length - 1);
        const x = padL + frac * plotW;
        const anchor = i === 0 ? 'start' : i === data.labels.length - 1 ? 'end' : 'middle';
        return <text key={i} className="axis-lbl" x={x} y={H - 7} textAnchor={anchor}>{lb}</text>;
      })}
    </svg>
  );
}

function TokenPanel({ chartData, totals, collapsed, onToggleCollapse, onHandleDown }) {
  const [range, setRange] = React.useState('today');
  return (
    <div className={'tokens' + (collapsed ? ' collapsed' : '')}>
      <div className="tokens-head">
        <button className="icon-btn card-grip" title="拖动以调整顺序" onMouseDown={onHandleDown}>
          <Icon name="grip" size={18} strokeWidth={2} />
        </button>
        <span className="tokens-title">Total Tokens</span>
        <span className="tokens-total">{fmtTokens(totals[range])}</span>
        {!collapsed && (
          <div className="seg">
            {[['today', '今天'], ['week', '最近一周'], ['month', '最近一月']].map(([k, lb]) => (
              <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{lb}</button>
            ))}
          </div>
        )}
        <button className={'icon-btn card-collapse' + (collapsed ? ' is-collapsed' : '')}
          onClick={onToggleCollapse} title={collapsed ? '展开' : '折叠'}>
          <Icon name="chev_down" size={18} />
        </button>
      </div>
      {!collapsed && <TokenChart data={chartData[range]} />}
    </div>
  );
}

function Tab({ active, onClick, vendorId, label }) {
  return (
    <button className={'tab' + (active ? ' active' : '')} onClick={onClick}>
      <span className="tab-ic">
        <VendorMark id={vendorId} size={24} />
      </span>
      <span className="tab-lbl">{label}</span>
    </button>
  );
}

Object.assign(window, { BarSchemeContext, BarStyleContext, BarRow, SkeletonBars, CardMenu, UsageCard, TokenChart, TokenPanel, Tab });
