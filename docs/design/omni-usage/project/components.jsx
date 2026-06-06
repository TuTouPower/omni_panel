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

/* full row with reset time column.
   When `max` is given the row is a fraction metric (e.g. balance / MCP calls):
   it shows "value/max" instead of a percentage and drops the reset column.
   `idx` is the bar's position within its card/account (0-based).
   `elapsed` (0..1, optional) is the elapsed fraction of this metric's quota
   window — used only by the 带投影预测 scheme. */
function BarRow({ label, value, max, idx = 0, reset, elapsed }) {
  const scheme = React.useContext(BarSchemeContext);
  const unused = value == null;
  const frac = max != null;
  const pct = unused ? 0 : (frac ? (max > 0 ? (value / max) * 100 : 0) : value);
  const c = barFillColor(scheme, { pct, idx, elapsed });
  return (
    <div className={'bar-row' + (frac ? ' frac' : '')}>
      <span className="bar-lbl">{label}</span>
      <div className="track">
        <div className="fill" style={{
          width: Math.max(0, Math.min(100, pct)) + '%',
          background: c,
        }} />
      </div>
      <span className="bar-pct">{unused ? '' : (frac ? value + '/' + max : value + '%')}</span>
      {!frac && <span className="bar-reset">{unused ? '' : reset}</span>}
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

function CardMenu({ disabled, onEdit, onDelete, onToggle, onClose }) {
  return (
    <>
      <div className="card-menu-overlay" onClick={onClose} />
      <div className="card-menu" onClick={(e) => e.stopPropagation()}>
        <div className="cm-item" onClick={() => { onEdit(); onClose(); }}>
          <span className="cm-ic"><Icon name="edit" size={15} /></span>编辑
        </div>
        <div className="cm-item" onClick={() => { onToggle(); onClose(); }}>
          <span className="cm-ic"><Icon name="power" size={15} /></span>{disabled ? '启用' : '关闭'}
        </div>
        <div className="cm-item danger" onClick={() => { onDelete(); onClose(); }}>
          <span className="cm-ic"><Icon name="trash" size={15} /></span>删除
        </div>
      </div>
    </>
  );
}

function UsageCard({ vendorId, name, updated, h5, week, r5, rw, e5, ew,
                     balanceOnly, balance, mcp, metrics,
                     accounts, l2open, onToggleL2,
                     state = 'normal', refreshing, onRefresh, limitMode,
                     collapsed, onToggleCollapse, disabled,
                     menuOpen, onToggleMenu, onCloseMenu, onEdit, onDelete, onToggleDisable,
                     canDrag, onDragStart, onDragEnter, onDragEnd, onHandleDown, dragging, dragOver }) {
  const isAcct = !vendorId;
  const accts = accounts || [];
  const multi = accts.length > 1;
  const dH5 = limitMode && h5 >= 90, dWk = limitMode && week >= 90;
  const alert = !disabled && state === 'normal' && (dH5 || dWk);
  return (
    <div className={'card' + (isAcct ? ' acct' : '') + (alert ? ' alert' : '')
        + (disabled ? ' disabled' : '') + (collapsed ? ' collapsed' : '')
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
        {multi && (collapsed || disabled) && <span className="count-badge">{collapsed && !disabled && !l2open ? '概览' : accts.length + '账号'}</span>}
        {multi && !collapsed && !disabled && (
          <span className="l2seg" role="tablist">
            <button className={l2open ? '' : 'on'} title="概览"
              onClick={() => { if (l2open) onToggleL2(); }}>概览</button>
            <button className={l2open ? 'on' : ''} title="账号明细"
              onClick={() => { if (!l2open) onToggleL2(); }}>{accts.length}账号</button>
          </span>
        )}
        {disabled && <span className="off-badge">已关闭</span>}
        {!disabled && <span className="rel-time">{refreshing ? '刷新中…' : updated}</span>}
        <div className="card-tools">
          {!disabled && (
            <button className={'icon-btn card-refresh' + (refreshing ? ' spinning' : '')}
              onClick={onRefresh} title="刷新">
              <Icon name="refresh" size={17} />
            </button>
          )}
          <div className="card-menu-wrap">
            <button className="icon-btn" title="更多" onClick={onToggleMenu}>
              <Icon name="more" size={18} />
            </button>
            {menuOpen && (
              <CardMenu disabled={disabled} onEdit={onEdit} onDelete={onDelete}
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
       disabled ? (
         <div className="card-state off">
           <span className="cs-ic"><Icon name="power" size={16} /></span>
           <span>监控已关闭，不再刷新用量</span>
           <span className="cs-action" onClick={onToggleDisable}>启用</span>
         </div>
       ) :
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
                   <span className="ai-key">{a.key}</span>
                   <span className="ai-time">{a.updated}</span>
                 </div>
                 <div className="ai-bars">
                   {a.metrics ? (
                     a.metrics.map((m, i) => (
                       <BarRow key={m.label} label={m.label} value={m.value} max={m.max} idx={i} />
                     ))
                   ) : a.balanceOnly && a.balance ? (
                     <BarRow label="余额" value={a.balance.value} max={a.balance.max} idx={0} />
                   ) : (
                     <>
                       <BarRow label="5小时" value={a.h5} idx={0} reset={a.r5} elapsed={a.e5} />
                       <BarRow label="一周"  value={a.week} idx={1} reset={a.rw} elapsed={a.ew} />
                       {a.mcp && <BarRow label="MCP" value={a.mcp.value} max={a.mcp.max} idx={2} />}
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
             <BarRow key={m.label} label={m.label} value={m.value} max={m.max} idx={i} />
           ))}
         </div>
       ) : balanceOnly && balance ? (
         <div className="bars">
           <BarRow label="余额" value={balance.value} max={balance.max} idx={0} />
         </div>
       ) : (
         <div className="bars">
           <BarRow label="5小时" value={h5} idx={0} reset={r5} elapsed={e5} />
           <BarRow label="一周"  value={week} idx={1} reset={rw} elapsed={ew} />
           {mcp && <BarRow label="MCP" value={mcp.value} max={mcp.max} idx={2} />}
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

Object.assign(window, { BarSchemeContext, BarRow, SkeletonBars, CardMenu, UsageCard, TokenChart, TokenPanel, Tab });
