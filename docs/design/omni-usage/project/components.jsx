/* components.jsx — shared UI: Bar, UsageCard, TokenChart, Tab */

function Bar({ label, value, kind }) {
  const danger = value >= 85;
  return (
    <div className="bar-row">
      <span className="bar-lbl">{label}</span>
      <div className="track">
        <div className={'fill ' + (danger ? 'danger' : kind)} style={{ width: Math.min(100, value) + '%' }} />
      </div>
      <span className={'bar-pct' + (danger ? ' danger' : '')}>{value}%</span>
      <span className="bar-reset">{label === '5小时' ? null : null}{value === -1 ? '' : ''}</span>
    </div>
  );
}

/* full row with reset time column */
function BarRow({ label, value, kind, reset, danger }) {
  return (
    <div className="bar-row">
      <span className="bar-lbl">{label}</span>
      <div className="track">
        <div className={'fill ' + (danger ? 'danger' : kind)} style={{ width: Math.min(100, value) + '%' }} />
      </div>
      <span className={'bar-pct' + (danger ? ' danger' : '')}>{value}%</span>
      <span className="bar-reset">{reset}</span>
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

function UsageCard({ vendorId, name, badge, updated, h5, week, r5, rw,
                     accounts, l2open, onToggleL2,
                     state = 'normal', refreshing, onRefresh, limitMode,
                     collapsed, onToggleCollapse, disabled, onEnable,
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
        {multi && (collapsed || disabled) && <span className="count-badge">{accts.length}账号</span>}
        {multi && !collapsed && !disabled && (
          <span className="l2seg" role="tablist">
            <button className={l2open ? '' : 'on'} title="平均用量"
              onClick={() => { if (l2open) onToggleL2(); }}>平均</button>
            <button className={l2open ? 'on' : ''} title="账号明细"
              onClick={() => { if (!l2open) onToggleL2(); }}>{accts.length}账号</button>
          </span>
        )}
        {disabled && <span className="off-badge">已关闭</span>}
        {!collapsed && !disabled && <span className="rel-time">{refreshing ? '刷新中…' : updated}</span>}
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
                   <BarRow label="5小时" value={a.h5} kind="blue" reset={a.r5} danger={adH5} />
                   <BarRow label="一周"  value={a.week} kind="purple" reset={a.rw} danger={adWk} />
                 </div>
               </div>
             );
           })}
         </div>
       ) : (
         <div className="bars">
           <BarRow label="5小时" value={h5} kind="blue" reset={r5} danger={dH5} />
           <BarRow label="一周"  value={week} kind="purple" reset={rw} danger={dWk} />
         </div>
       )}
    </div>
  );
}

/* ---------- token chart ---------- */
function TokenChart({ data, range }) {
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
      {!collapsed && <TokenChart data={chartData[range]} range={range} />}
    </div>
  );
}

function Tab({ active, onClick, icon, vendorId, label }) {
  return (
    <button className={'tab' + (active ? ' active' : '')} onClick={onClick}>
      <span className="tab-ic">
        {icon ? <Icon name={icon} size={22} color={active ? 'var(--blue)' : 'var(--text-2)'} strokeWidth={1.8} />
              : <VendorMark id={vendorId} size={24} />}
      </span>
      <span className="tab-lbl">{label}</span>
    </button>
  );
}

Object.assign(window, { Bar, BarRow, SkeletonBars, CardMenu, UsageCard, TokenChart, TokenPanel, Tab });
